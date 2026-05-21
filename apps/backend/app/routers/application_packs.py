"""Application pack endpoints."""

import asyncio
from datetime import datetime, timezone
import json
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.database import db
from app.llm import llm_trace_scope

from app.routers.resumes import (
    _improve_preview_flow,
    _resolve_prompt_id,
    _resolve_request_theme_settings,
    improve_resume_confirm_endpoint,
    improve_resume_preview_endpoint,
)
from app.schemas import (
    ApplicationQuestionAnswer,
    ApplicationPackListResponse,
    ApplicationQuestionsAnswerRequest,
    ApplicationQuestionsData,
    ApplicationQuestionsFetchResponse,
    ApplicationQuestionsResponse,
    ApplicationQuestionsSaveRequest,
    ImproveResumeConfirmRequest,
    ImproveResumeRequest,
    ImproveResumeResponse,
    LivePreviewStartData,
    LivePreviewStartResponse,
)
from app.services.live_generation import LIVE_TERMINAL_EVENT_TYPES, live_generation_registry
from app.services.application_questions import (
    dedupe_question_inputs,
    generate_application_question_answers,
    merge_answers_for_partial_regeneration,
    read_answers_from_generation_payload,
    validate_question_batch_constraints,
)
from app.services.resume_codes import derive_resume_code

router = APIRouter(prefix="/application-packs", tags=["Application Packs"])

QUESTION_GENERATE_RUN_KIND = "application_pack_questions"
QUESTION_MANUAL_RUN_KIND = "application_pack_questions_manual"
QUESTION_RUN_KINDS = (QUESTION_MANUAL_RUN_KIND, QUESTION_GENERATE_RUN_KIND)


async def _run_live_preview_background(
    *,
    live_run_id: str,
    generation_run_id: str,
    trace_id: str,
    request: ImproveResumeRequest,
    resume: dict[str, Any],
    job: dict[str, Any],
    prompt_id: str,
) -> None:
    live_run = await live_generation_registry.get_run(live_run_id)
    if live_run is None:
        return

    stage_state = {"stage": "load_job_keywords"}
    try:
        await live_generation_registry.emit(
            live_run_id,
            "run.started",
            {
                "status": "running",
                "resume_id": request.resume_id,
                "job_id": request.job_id,
                "prompt_id": prompt_id,
            },
        )
        await live_generation_registry.emit(
            live_run_id,
            "stage.started",
            {
                "host_event": "live_preview",
                "sub_event": "request_accepted",
                "stage_label": "Starting live preview",
                "stage_detail": "The preview request was accepted and the backend pipeline is starting.",
            },
        )
        with llm_trace_scope(
            trace_id,
            "resumes.improve_preview",
            {
                "resume_id": request.resume_id,
                "resume_code": derive_resume_code(request.resume_id),
                "source_resume_id": request.resume_id,
                "source_resume_code": derive_resume_code(request.resume_id),
                "job_id": request.job_id,
                "live_run_id": live_run_id,
                "generation_run_id": generation_run_id,
            },
        ):
            result = await asyncio.wait_for(
                _improve_preview_flow(
                    request=request,
                    resume=resume,
                    job=job,
                    prompt_id=prompt_id,
                    request_id=trace_id,
                    theme_settings=_resolve_request_theme_settings(
                        request_theme_settings=request.theme_settings,
                        resume=resume,
                    ),
                    stage_state=stage_state,
                    preview_generation_run_id=generation_run_id,
                    live_run=live_run,
                ),
                timeout=240.0,
            )
        await live_generation_registry.set_result(live_run_id, result)
        await live_generation_registry.emit(
            live_run_id,
            "run.completed",
            {
                "status": "completed",
                "application_pack_id": result.data.application_pack_id,
                "generation_run_id": result.data.generation_run_id,
                "artifact_count": len(result.data.artifacts),
            },
        )
    except asyncio.CancelledError:
        db.update_generation_run(
            generation_run_id,
            {
                "status": "cancelled",
                "completed_at": datetime.now(timezone.utc),
                "warnings": ["Live preview cancelled by user."],
            },
        )
        await live_generation_registry.emit(
            live_run_id,
            "run.cancelled",
            {"status": "cancelled", "stage": stage_state.get("stage")},
        )
        raise
    except Exception as exc:
        db.update_generation_run(
            generation_run_id,
            {
                "status": "failed",
                "completed_at": datetime.now(timezone.utc),
                "warnings": [str(exc)],
                "result_payload": {
                    "live_run_id": live_run_id,
                    "llm_trace_id": trace_id,
                    "failed_stage": stage_state.get("stage"),
                    "error_type": type(exc).__name__,
                    "error_message": str(exc),
                },
            },
        )
        await live_generation_registry.set_error(live_run_id, str(exc))
        await live_generation_registry.emit(
            live_run_id,
            "run.failed",
            {
                "status": "failed",
                "stage": stage_state.get("stage"),
                "error_type": type(exc).__name__,
                "message": str(exc),
            },
        )


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {value}") from error


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _resolve_source_and_tailored_resume_ids(
    resume: dict[str, Any],
) -> tuple[str | None, str | None]:
    resume_id = resume.get("resume_id")
    parent_id = resume.get("parent_id")
    if parent_id:
        return parent_id, resume_id
    return resume_id, None


def _resolve_application_pack_id(
    *,
    explicit_pack_id: str | None,
    generation_run_id: str | None,
    resume: dict[str, Any] | None,
) -> str | None:
    pack_id = explicit_pack_id
    if not pack_id and generation_run_id:
        generation_run = db.get_generation_run(generation_run_id)
        if generation_run:
            pack_id = generation_run.get("application_pack_id")
    if not pack_id and resume:
        pack_id = resume.get("application_pack_id")
    return pack_id


def _resolve_resume_context(
    *,
    resume: dict[str, Any],
    generation_run_id: str | None,
) -> dict[str, Any]:
    if generation_run_id:
        generation_run = db.get_generation_run(generation_run_id)
        if generation_run:
            result_payload = generation_run.get("result_payload")
            if isinstance(result_payload, dict):
                final_resume = result_payload.get("final_resume_data")
                if isinstance(final_resume, dict):
                    return final_resume
    processed_data = resume.get("processed_data")
    if not isinstance(processed_data, dict):
        raise HTTPException(
            status_code=400,
            detail="Resume has no processed data available for question generation.",
        )
    return processed_data


def _get_latest_question_run(
    *,
    application_pack_id: str | None,
    resume: dict[str, Any] | None,
    job_id: str | None,
) -> dict[str, Any] | None:
    if application_pack_id:
        run = db.get_latest_generation_run(
            run_kind=QUESTION_RUN_KINDS,
            status="completed",
            application_pack_id=application_pack_id,
            job_id=job_id,
        )
        if run:
            return run

    if not resume:
        return None

    resume_id = resume.get("resume_id")
    parent_id = resume.get("parent_id")
    if parent_id:
        run = db.get_latest_generation_run(
            run_kind=QUESTION_RUN_KINDS,
            status="completed",
            tailored_resume_id=resume_id,
            job_id=job_id,
        )
        if run:
            return run
        return db.get_latest_generation_run(
            run_kind=QUESTION_RUN_KINDS,
            status="completed",
            source_resume_id=parent_id,
            job_id=job_id,
        )

    return db.get_latest_generation_run(
        run_kind=QUESTION_RUN_KINDS,
        status="completed",
        source_resume_id=resume_id,
        job_id=job_id,
    )


def _build_questions_data(
    *,
    generation_run: dict[str, Any] | None,
    answers: list[ApplicationQuestionAnswer],
    warnings: list[str],
    application_pack_id: str | None,
    resume: dict[str, Any] | None,
) -> ApplicationQuestionsData:
    generated_at = generation_run.get("created_at") if generation_run else None
    run_created_at = _parse_iso_datetime(generated_at)
    resume_updated_at = _parse_iso_datetime(resume.get("updated_at")) if resume else None

    is_stale = bool(run_created_at and resume_updated_at and run_created_at < resume_updated_at)
    stale_reason = (
        "Resume was updated after these answers were generated."
        if is_stale
        else None
    )

    return ApplicationQuestionsData(
        application_pack_id=application_pack_id,
        generation_run_id=generation_run.get("generation_run_id") if generation_run else None,
        run_kind=generation_run.get("run_kind") if generation_run else None,
        answers=answers,
        warnings=warnings,
        generated_at=generated_at,
        is_stale=is_stale,
        stale_reason=stale_reason,
    )


@router.get("", response_model=ApplicationPackListResponse)
async def list_application_packs(
    company: str | None = Query(None),
    role: str | None = Query(None),
    created_from: str | None = Query(None),
    created_to: str | None = Query(None),
) -> ApplicationPackListResponse:
    return ApplicationPackListResponse(
        request_id=str(uuid4()),
        data=db.list_application_packs(
            company=company,
            role=role,
            created_from=_parse_datetime(created_from),
            created_to=_parse_datetime(created_to),
        ),
    )


@router.post("/preview", response_model=ImproveResumeResponse)
async def preview_application_pack(
    request: ImproveResumeRequest,
) -> ImproveResumeResponse:
    return await improve_resume_preview_endpoint(request)


@router.post("/preview/live", response_model=LivePreviewStartResponse)
async def start_live_preview_application_pack(
    request: ImproveResumeRequest,
) -> LivePreviewStartResponse:
    resume = db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    prompt_id = _resolve_prompt_id(request.prompt_id)
    trace_id = str(uuid4())
    generation_run = db.create_generation_run(
        run_kind="application_pack_preview",
        status="running",
        source_resume_id=request.resume_id,
        job_id=request.job_id,
        prompt_id=prompt_id,
        request_payload={
            "prompt_id": prompt_id,
            "llm_trace_id": trace_id,
            "live_preview": True,
        },
        result_payload={
            "live_preview": True,
            "llm_trace_id": trace_id,
        },
    )
    live_run = await live_generation_registry.create_run(
        generation_run_id=generation_run["generation_run_id"],
        trace_id=trace_id,
    )
    db.update_generation_run(
        generation_run["generation_run_id"],
        {
            "request_payload": {
                "prompt_id": prompt_id,
                "llm_trace_id": trace_id,
                "live_preview": True,
                "live_run_id": live_run.live_run_id,
            }
        },
    )
    task = asyncio.create_task(
        _run_live_preview_background(
            live_run_id=live_run.live_run_id,
            generation_run_id=generation_run["generation_run_id"],
            trace_id=trace_id,
            request=request,
            resume=resume,
            job=job,
            prompt_id=prompt_id,
        )
    )
    await live_generation_registry.set_task(live_run.live_run_id, task)
    return LivePreviewStartResponse(
        request_id=trace_id,
        data=LivePreviewStartData(
            live_run_id=live_run.live_run_id,
            generation_run_id=generation_run["generation_run_id"],
            trace_id=trace_id,
        ),
    )


@router.get("/preview/live/{live_run_id}/events")
async def stream_live_preview_events(
    live_run_id: str,
    request: Request,
    last_event_id: int = Query(0, alias="last_event_id", ge=0),
) -> StreamingResponse:
    live_run = await live_generation_registry.get_run(live_run_id)
    if live_run is None:
        raise HTTPException(status_code=404, detail="Live preview run not found")

    header_last_event_id = request.headers.get("last-event-id")
    try:
        initial_sequence = int(header_last_event_id) if header_last_event_id else last_event_id
    except ValueError:
        initial_sequence = last_event_id

    async def event_stream():
        last_sequence = max(0, initial_sequence)
        for event in await live_generation_registry.events_after(live_run_id, last_sequence):
            last_sequence = event.sequence
            yield event.to_sse()
            if event.type in LIVE_TERMINAL_EVENT_TYPES:
                return

        while True:
            if await request.is_disconnected():
                return
            try:
                event = await asyncio.wait_for(live_run.queue.get(), timeout=12.0)
            except asyncio.TimeoutError:
                heartbeat = {
                    "event_id": str(uuid4()),
                    "sequence": last_sequence,
                    "live_run_id": live_run.live_run_id,
                    "generation_run_id": live_run.generation_run_id,
                    "trace_id": live_run.trace_id,
                    "type": "heartbeat",
                    "at": datetime.now(timezone.utc).isoformat(),
                    "data": {"status": live_run.status},
                }
                yield f"event: heartbeat\ndata: {json.dumps(heartbeat, separators=(',', ':'))}\n\n"
                continue
            if event.sequence <= last_sequence:
                continue
            last_sequence = event.sequence
            yield event.to_sse()
            if event.type in LIVE_TERMINAL_EVENT_TYPES:
                return

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/preview/live/{live_run_id}/result", response_model=ImproveResumeResponse)
async def get_live_preview_result(live_run_id: str) -> ImproveResumeResponse:
    live_run = await live_generation_registry.get_run(live_run_id)
    if live_run is None:
        raise HTTPException(status_code=404, detail="Live preview run not found")
    if live_run.result is None:
        raise HTTPException(status_code=202, detail={"status": live_run.status})
    return live_run.result


@router.post("/preview/live/{live_run_id}/cancel")
async def cancel_live_preview(live_run_id: str) -> dict[str, Any]:
    cancelled = await live_generation_registry.cancel(live_run_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Live preview run not found")
    return {"status": "cancelled", "live_run_id": live_run_id}


@router.post("/confirm", response_model=ImproveResumeResponse)
async def confirm_application_pack(
    request: ImproveResumeConfirmRequest,
) -> ImproveResumeResponse:
    return await improve_resume_confirm_endpoint(request)


@router.post("/questions/answer", response_model=ApplicationQuestionsResponse)
async def answer_application_questions(
    request: ApplicationQuestionsAnswerRequest,
) -> ApplicationQuestionsResponse:
    resume = db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    application_pack_id = _resolve_application_pack_id(
        explicit_pack_id=request.application_pack_id,
        generation_run_id=request.generation_run_id,
        resume=resume,
    )
    if request.application_pack_id and not db.get_application_pack(request.application_pack_id):
        raise HTTPException(status_code=404, detail="Application pack not found")

    deduped_questions, dedupe_warnings = dedupe_question_inputs(request.questions)
    validate_question_batch_constraints(deduped_questions)
    question_ids = {item.question_id for item in deduped_questions}

    target_question_ids = request.target_question_ids
    target_question_set = set(target_question_ids)
    if target_question_set and not target_question_set.issubset(question_ids):
        missing = sorted(target_question_set - question_ids)
        raise HTTPException(
            status_code=400,
            detail=f"target_question_ids contain unknown ids: {', '.join(missing)}",
        )

    latest_run = _get_latest_question_run(
        application_pack_id=application_pack_id,
        resume=resume,
        job_id=request.job_id,
    )
    existing_answers = read_answers_from_generation_payload(
        (latest_run or {}).get("result_payload")
    )

    run_payload = {
        "regenerate": request.regenerate,
        "target_question_ids": target_question_ids,
        "question_count": len(deduped_questions),
        "questions": [item.model_dump() for item in deduped_questions],
        "source_generation_run_id": request.generation_run_id,
        "previous_question_run_id": (latest_run or {}).get("generation_run_id"),
    }
    source_resume_id, tailored_resume_id = _resolve_source_and_tailored_resume_ids(resume)
    generation_run = db.create_generation_run(
        run_kind=QUESTION_GENERATE_RUN_KIND,
        status="processing",
        source_resume_id=source_resume_id,
        tailored_resume_id=tailored_resume_id,
        job_id=request.job_id,
        application_pack_id=application_pack_id,
        prompt_id="application_questions_generate",
        request_payload=run_payload,
    )

    request_id = str(uuid4())
    result_answers: list[ApplicationQuestionAnswer] = []
    warnings = list(dedupe_warnings)

    try:
        questions_for_generation = deduped_questions
        if request.regenerate and target_question_set:
            questions_for_generation = [
                item for item in deduped_questions if item.question_id in target_question_set
            ]
            missing_existing = [
                item
                for item in deduped_questions
                if item.question_id not in target_question_set
                and not any(
                    existing.question_id == item.question_id for existing in existing_answers
                )
            ]
            if missing_existing:
                warnings.append(
                    "Some non-regenerated questions had no previous answers and were regenerated."
                )
                questions_for_generation = questions_for_generation + missing_existing

        resume_context = _resolve_resume_context(
            resume=resume,
            generation_run_id=request.generation_run_id,
        )
        trace_metadata = {
            "resume_id": resume["resume_id"],
            "resume_code": derive_resume_code(resume["resume_id"]),
            "generation_run_id": generation_run["generation_run_id"],
            "application_pack_id": application_pack_id,
            "job_id": request.job_id,
            "question_count": len(questions_for_generation),
        }
        if source_resume_id:
            trace_metadata["source_resume_id"] = source_resume_id
            trace_metadata["source_resume_code"] = derive_resume_code(source_resume_id)
        if tailored_resume_id:
            trace_metadata["tailored_resume_id"] = tailored_resume_id
            trace_metadata["tailored_resume_code"] = derive_resume_code(tailored_resume_id)
        with llm_trace_scope(
            trace_id=generation_run["generation_run_id"],
            request_scope="application_packs.questions.answer",
            metadata=trace_metadata,
        ):
            generated_answers, generation_warnings = await generate_application_question_answers(
                resume_data=resume_context,
                job_description=job["content"],
                questions=questions_for_generation,
                job_metadata={
                    "role": job.get("role"),
                    "company": job.get("company"),
                    "location": job.get("location"),
                },
                job_keywords=job.get("job_keywords"),
            )

        warnings.extend(generation_warnings)
        if request.regenerate and target_question_set:
            result_answers, merge_warnings = merge_answers_for_partial_regeneration(
                ordered_questions=deduped_questions,
                generated_answers=generated_answers,
                existing_answers=existing_answers,
            )
            warnings.extend(merge_warnings)
        else:
            result_answers = generated_answers

        completed_updates = {
            "status": "completed",
            "warnings": warnings,
            "completed_at": datetime.now(timezone.utc),
            "result_payload": {
                "answers": [item.model_dump() for item in result_answers],
                "warning_count": len(warnings),
            },
        }
        db.update_generation_run(generation_run["generation_run_id"], completed_updates)

        completed_run = db.get_generation_run(generation_run["generation_run_id"])
        data = _build_questions_data(
            generation_run=completed_run,
            answers=result_answers,
            warnings=warnings,
            application_pack_id=application_pack_id,
            resume=resume,
        )
        return ApplicationQuestionsResponse(request_id=request_id, data=data)
    except HTTPException:
        db.update_generation_run(
            generation_run["generation_run_id"],
            {
                "status": "failed",
                "warnings": warnings,
                "completed_at": datetime.now(timezone.utc),
            },
        )
        raise
    except Exception as error:
        warnings.append(f"Question generation failed: {error}")
        db.update_generation_run(
            generation_run["generation_run_id"],
            {
                "status": "failed",
                "warnings": warnings,
                "completed_at": datetime.now(timezone.utc),
            },
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to generate answers for application questions.",
        ) from error


@router.post("/questions/save", response_model=ApplicationQuestionsResponse)
async def save_application_question_answers(
    request: ApplicationQuestionsSaveRequest,
) -> ApplicationQuestionsResponse:
    resume = db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    application_pack_id = _resolve_application_pack_id(
        explicit_pack_id=request.application_pack_id,
        generation_run_id=request.generation_run_id,
        resume=resume,
    )
    if request.application_pack_id and not db.get_application_pack(request.application_pack_id):
        raise HTTPException(status_code=404, detail="Application pack not found")

    deduped_answers: list[ApplicationQuestionAnswer] = []
    seen_question_ids: set[str] = set()
    warnings: list[str] = []
    for answer in request.answers:
        if answer.question_id in seen_question_ids:
            warnings.append(
                f"Duplicate answer dropped for question_id={answer.question_id}."
            )
            continue
        seen_question_ids.add(answer.question_id)
        deduped_answers.append(
            ApplicationQuestionAnswer(
                question_id=answer.question_id,
                question=answer.question,
                answer=answer.answer,
                confidence=answer.confidence,
                warnings=answer.warnings,
                is_user_edited=True,
            )
        )

    source_resume_id, tailored_resume_id = _resolve_source_and_tailored_resume_ids(resume)
    run = db.create_generation_run(
        run_kind=QUESTION_MANUAL_RUN_KIND,
        status="completed",
        source_resume_id=source_resume_id,
        tailored_resume_id=tailored_resume_id,
        job_id=request.job_id,
        application_pack_id=application_pack_id,
        prompt_id="manual_save",
        request_payload={
            "source_generation_run_id": request.generation_run_id,
            "manual_answer_count": len(deduped_answers),
        },
        result_payload={
            "answers": [item.model_dump() for item in deduped_answers],
            "warning_count": len(warnings),
        },
        warnings=warnings,
    )
    run = db.get_generation_run(run["generation_run_id"]) or run

    data = _build_questions_data(
        generation_run=run,
        answers=deduped_answers,
        warnings=warnings,
        application_pack_id=application_pack_id,
        resume=resume,
    )
    return ApplicationQuestionsResponse(request_id=str(uuid4()), data=data)


@router.get("/questions", response_model=ApplicationQuestionsFetchResponse)
async def get_application_question_answers(
    resume_id: str | None = Query(None),
    job_id: str | None = Query(None),
    application_pack_id: str | None = Query(None),
) -> ApplicationQuestionsFetchResponse:
    if not application_pack_id and not resume_id:
        raise HTTPException(
            status_code=400,
            detail="Provide either application_pack_id or resume_id.",
        )

    resume: dict[str, Any] | None = None
    if resume_id:
        resume = db.get_resume(resume_id)
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")

    pack_id = application_pack_id or _resolve_application_pack_id(
        explicit_pack_id=application_pack_id,
        generation_run_id=None,
        resume=resume,
    )
    if application_pack_id and not db.get_application_pack(application_pack_id):
        raise HTTPException(status_code=404, detail="Application pack not found")

    effective_job_id = job_id
    if not effective_job_id and pack_id:
        pack = db.get_application_pack(pack_id)
        if pack:
            effective_job_id = pack.get("job_id")

    latest_run = _get_latest_question_run(
        application_pack_id=pack_id,
        resume=resume,
        job_id=effective_job_id,
    )
    if not latest_run:
        return ApplicationQuestionsFetchResponse(request_id=str(uuid4()), data=None)

    answers = read_answers_from_generation_payload(latest_run.get("result_payload"))
    warnings = list(latest_run.get("warnings") or [])
    data = _build_questions_data(
        generation_run=latest_run,
        answers=answers,
        warnings=warnings,
        application_pack_id=pack_id,
        resume=resume,
    )
    return ApplicationQuestionsFetchResponse(request_id=str(uuid4()), data=data)
