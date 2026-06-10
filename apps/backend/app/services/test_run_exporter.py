"""Temporary QA exporter for successful LLM-backed test runs."""

from __future__ import annotations

import json
import re
import shutil
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text

from app.config import settings
from app.db.session import get_engine

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_DIR = REPO_ROOT / "apps" / "backend"
DEFAULT_OUT_DIR = REPO_ROOT / "docs" / "plans" / "test_runs"
ALLOWED_ARTIFACT_SUFFIXES = {
    ".html",
    ".md",
    ".pdf",
    ".png",
    ".typ",
    ".yaml",
    ".yml",
}


def _json_default(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True, default=_json_default) + "\n",
        encoding="utf-8",
    )


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    cleaned = cleaned.strip("._-")
    return cleaned or "unknown"


def _fetch_all(sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with get_engine().connect() as conn:
        rows = conn.execute(text(sql), params or {}).mappings().all()
    return [dict(row) for row in rows]


def _text_value(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _normalize_json_field(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _contains_trace_id(value: Any, trace_id: str) -> bool:
    value = _normalize_json_field(value)
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "llm_trace_id" and item == trace_id:
                return True
            if _contains_trace_id(item, trace_id):
                return True
        return False
    if isinstance(value, list):
        return any(_contains_trace_id(item, trace_id) for item in value)
    return value == trace_id


def _get_generation_run_by_id(generation_run_id: str | None) -> dict[str, Any] | None:
    generation_run_id = _text_value(generation_run_id)
    if not generation_run_id:
        return None
    rows = _fetch_all(
        "select * from generation_runs where generation_run_id = :generation_run_id",
        {"generation_run_id": generation_run_id},
    )
    return rows[0] if rows else None


def _llm_trace_id_from_generation_run(run: dict[str, Any] | None) -> str | None:
    if not run:
        return None
    for field in ("request_payload", "result_payload"):
        payload = _normalize_json_field(run.get(field))
        if isinstance(payload, dict):
            trace_id = _text_value(payload.get("llm_trace_id"))
            if trace_id:
                return trace_id
    return None


def _fetch_llm_calls_for_trace(trace_id: str) -> list[dict[str, Any]]:
    return _fetch_all(
        """
        select *
        from llm_calls
        where trace_id = :trace_id
        order by created_at asc, operation asc, attempt asc, id asc
        """,
        {"trace_id": trace_id},
    )


def _resolve_export_source(
    input_id: str,
    *,
    generation_run_id: str | None = None,
) -> tuple[str, dict[str, Any] | None, list[dict[str, Any]]]:
    """Resolve an input id to (trace_id, generation_run, llm_calls).

    ``input_id`` may be either a generation run id or an LLM trace id.  Captures
    are named by generation run id when the run can be resolved.
    """

    input_id = _text_value(input_id) or ""
    explicit_run = _get_generation_run_by_id(generation_run_id)
    input_run = _get_generation_run_by_id(input_id) if input_id else None
    generation_run = explicit_run or input_run

    trace_candidates: list[str] = []
    run_trace_id = _llm_trace_id_from_generation_run(generation_run)
    if run_trace_id:
        trace_candidates.append(run_trace_id)
    if input_id and input_id not in trace_candidates:
        trace_candidates.append(input_id)

    for trace_id in trace_candidates:
        calls = _fetch_llm_calls_for_trace(trace_id)
        if calls:
            if generation_run is None:
                generation_run = _find_generation_run(trace_id=trace_id, calls=calls)
            return trace_id, generation_run, calls

    missing = generation_run_id or input_id
    raise ValueError(f"No llm_calls rows found for trace_id or generation_run_id={missing}")


def _find_generation_run(
    *,
    trace_id: str,
    calls: list[dict[str, Any]],
    generation_run_id: str | None = None,
) -> dict[str, Any] | None:
    candidate_ids = {trace_id}
    if generation_run_id:
        candidate_ids.add(generation_run_id)
    for call in calls:
        ctx = _normalize_json_field(call.get("request_context"))
        if isinstance(ctx, dict):
            candidate = ctx.get("generation_run_id")
            if isinstance(candidate, str) and candidate.strip():
                candidate_ids.add(candidate.strip())

    for candidate_id in candidate_ids:
        run = _get_generation_run_by_id(candidate_id)
        if run:
            return run

    recent_runs = _fetch_all(
        """
        select *
        from generation_runs
        order by created_at desc
        limit 2000
        """,
    )
    for run in recent_runs:
        if _contains_trace_id(run.get("request_payload"), trace_id):
            return run
    for run in recent_runs:
        if _contains_trace_id(run.get("result_payload"), trace_id):
            return run
    return None


def _artifact_rows(
    *,
    generation_run: dict[str, Any] | None,
    calls: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    generation_run_ids: set[str] = set()
    application_pack_ids: set[str] = set()
    artifact_ids: set[str] = set()

    if generation_run:
        if generation_run.get("generation_run_id"):
            generation_run_ids.add(str(generation_run["generation_run_id"]))
        if generation_run.get("application_pack_id"):
            application_pack_ids.add(str(generation_run["application_pack_id"]))
        payload = _normalize_json_field(generation_run.get("result_payload"))
        if isinstance(payload, dict) and isinstance(payload.get("artifact_ids"), list):
            artifact_ids.update(str(item) for item in payload["artifact_ids"] if item)

    for call in calls:
        ctx = _normalize_json_field(call.get("request_context"))
        if not isinstance(ctx, dict):
            continue
        if ctx.get("generation_run_id"):
            generation_run_ids.add(str(ctx["generation_run_id"]))
        if ctx.get("application_pack_id"):
            application_pack_ids.add(str(ctx["application_pack_id"]))

    rows_by_id: dict[str, dict[str, Any]] = {}

    def add_rows(sql: str, values: set[str], param_name: str) -> None:
        for value in sorted(values):
            for row in _fetch_all(sql, {param_name: value}):
                rows_by_id[str(row["artifact_id"])] = row

    add_rows(
        "select * from artifacts where generation_run_id = :generation_run_id order by created_at",
        generation_run_ids,
        "generation_run_id",
    )
    add_rows(
        "select * from artifacts where application_pack_id = :application_pack_id order by created_at",
        application_pack_ids,
        "application_pack_id",
    )
    add_rows(
        "select * from artifacts where artifact_id = :artifact_id order by created_at",
        artifact_ids,
        "artifact_id",
    )
    return list(rows_by_id.values())


def _resolve_artifact_source(row: dict[str, Any]) -> Path | None:
    storage_path = row.get("storage_path")
    candidates: list[Path] = []
    if isinstance(storage_path, str) and storage_path.strip():
        raw = Path(storage_path).expanduser()
        candidates.append(raw if raw.is_absolute() else (REPO_ROOT / raw).resolve())
        candidates.append(raw if raw.is_absolute() else (BACKEND_DIR / raw).resolve())

    file_name = row.get("file_name")
    if isinstance(file_name, str) and file_name.strip():
        for owner in (
            row.get("application_pack_id"),
            row.get("generation_run_id"),
            row.get("resume_id"),
        ):
            if owner:
                candidates.append(settings.artifact_dir / str(owner) / file_name)

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def _copy_artifacts(
    rows: list[dict[str, Any]],
    *,
    output_dir: Path,
) -> tuple[list[dict[str, Any]], list[str]]:
    copied: list[dict[str, Any]] = []
    warnings: list[str] = []
    if not rows:
        return copied, warnings

    target_dir = output_dir / "artifacts"
    target_dir.mkdir(parents=True, exist_ok=True)
    used_names: set[str] = set()

    for row in rows:
        source = _resolve_artifact_source(row)
        if source is None:
            warnings.append(f"Artifact source missing: {row.get('artifact_id')}")
            continue
        if source.suffix.lower() not in ALLOWED_ARTIFACT_SUFFIXES:
            warnings.append(f"Skipped unsupported artifact type: {source}")
            continue

        target_name = source.name
        if target_name in used_names:
            target_name = f"{_slug(str(row.get('artifact_id') or source.stem))}{source.suffix}"
        used_names.add(target_name)
        target = target_dir / target_name
        shutil.copy2(source, target)
        copied.append(
            {
                "artifact_id": row.get("artifact_id"),
                "kind": row.get("kind"),
                "mime_type": row.get("mime_type"),
                "source_path": str(source),
                "exported_path": str(target.relative_to(output_dir)),
                "application_pack_id": row.get("application_pack_id"),
                "generation_run_id": row.get("generation_run_id"),
                "resume_id": row.get("resume_id"),
            }
        )
    return copied, warnings


def _trace_warnings(calls: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    for call in calls:
        label = f"{call.get('operation')} attempt {call.get('attempt')}"
        prompt_preview = call.get("prompt_preview")
        response_preview = call.get("response_preview")
        if not prompt_preview:
            warnings.append(f"{label}: prompt content is missing from llm_calls.prompt_preview.")
        if not response_preview:
            warnings.append(f"{label}: response content is missing from llm_calls.response_preview.")
        if isinstance(prompt_preview, str) and "...[truncated " in prompt_preview:
            warnings.append(f"{label}: prompt preview is truncated.")
        if isinstance(response_preview, str) and "...[truncated " in response_preview:
            warnings.append(f"{label}: response preview is truncated.")
    return warnings


def _call_metadata(call: dict[str, Any]) -> dict[str, Any]:
    return {
        "llm_call_id": call.get("llm_call_id"),
        "call_group_id": call.get("call_group_id"),
        "trace_id": call.get("trace_id"),
        "request_scope": call.get("request_scope"),
        "operation": call.get("operation"),
        "provider": call.get("provider"),
        "model": call.get("model"),
        "model_name": call.get("model_name"),
        "response_model": call.get("response_model"),
        "request_kind": call.get("request_kind"),
        "success": call.get("success"),
        "attempt": call.get("attempt"),
        "max_tokens": call.get("max_tokens"),
        "temperature": call.get("temperature"),
        "reasoning_effort": call.get("reasoning_effort"),
        "json_mode": call.get("json_mode"),
        "latency_ms": call.get("latency_ms"),
        "finish_reason": call.get("finish_reason"),
        "prompt_chars": call.get("prompt_chars"),
        "prompt_tokens_est": call.get("prompt_tokens_est"),
        "response_chars": call.get("response_chars"),
        "response_tokens_est": call.get("response_tokens_est"),
        "usage_input_tokens": call.get("usage_input_tokens"),
        "usage_output_tokens": call.get("usage_output_tokens"),
        "usage_total_tokens": call.get("usage_total_tokens"),
        "estimated_input_cost_usd": call.get("estimated_input_cost_usd"),
        "estimated_output_cost_usd": call.get("estimated_output_cost_usd"),
        "estimated_total_cost_usd": call.get("estimated_total_cost_usd"),
        "error_type": call.get("error_type"),
        "error_message": call.get("error_message"),
        "request_context": _normalize_json_field(call.get("request_context")),
        "created_at": call.get("created_at"),
        "updated_at": call.get("updated_at"),
        "completed_at": call.get("completed_at"),
    }


def _write_call_exports(calls: list[dict[str, Any]], output_dir: Path) -> list[dict[str, Any]]:
    by_operation: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for call in calls:
        by_operation[str(call.get("operation") or "unknown")].append(call)

    exports: list[dict[str, Any]] = []
    for operation, operation_calls in sorted(by_operation.items()):
        safe_operation = _slug(operation)
        operation_calls = sorted(
            operation_calls,
            key=lambda row: (
                int(row.get("attempt") or 0),
                str(row.get("created_at") or ""),
                str(row.get("llm_call_id") or ""),
            ),
        )
        multi_attempt = len(operation_calls) > 1
        used_dirs: set[str] = set()

        for index, call in enumerate(operation_calls, start=1):
            if multi_attempt:
                attempt = int(call.get("attempt") or index)
                child_name = f"attempt-{attempt}"
                if child_name in used_dirs:
                    call_id = str(call.get("llm_call_id") or index)[:8]
                    child_name = f"attempt-{attempt}-{call_id}"
                target_dir = output_dir / safe_operation / child_name
                relative_dir = f"{safe_operation}/{child_name}"
                used_dirs.add(child_name)
            else:
                target_dir = output_dir / safe_operation
                relative_dir = safe_operation

            target_dir.mkdir(parents=True, exist_ok=True)
            (target_dir / "prompt.txt").write_text(
                call.get("prompt_preview") or "",
                encoding="utf-8",
            )
            (target_dir / "response.txt").write_text(
                call.get("response_preview") or "",
                encoding="utf-8",
            )
            _write_json(target_dir / "metadata.json", _call_metadata(call))
            exports.append(
                {
                    "operation": operation,
                    "attempt": call.get("attempt"),
                    "llm_call_id": call.get("llm_call_id"),
                    "directory": relative_dir,
                    "prompt_path": f"{relative_dir}/prompt.txt",
                    "response_path": f"{relative_dir}/response.txt",
                    "metadata_path": f"{relative_dir}/metadata.json",
                    "success": call.get("success"),
                    "finish_reason": call.get("finish_reason"),
                }
            )
    return exports


def _summarize_calls(calls: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "total_calls": len(calls),
        "successful_calls": sum(1 for call in calls if call.get("success") is True),
        "failed_calls": sum(1 for call in calls if call.get("success") is False),
        "operations": sorted({str(call.get("operation") or "unknown") for call in calls}),
        "usage_input_tokens": sum(int(call.get("usage_input_tokens") or 0) for call in calls),
        "usage_output_tokens": sum(int(call.get("usage_output_tokens") or 0) for call in calls),
        "usage_total_tokens": sum(int(call.get("usage_total_tokens") or 0) for call in calls),
        "estimated_total_cost_usd": round(
            sum(float(call.get("estimated_total_cost_usd") or 0.0) for call in calls),
            6,
        ),
        "latency_total_ms": sum(int(call.get("latency_ms") or 0) for call in calls),
    }


def _generation_run_summary(run: dict[str, Any] | None) -> dict[str, Any] | None:
    if not run:
        return None
    return {
        "generation_run_id": run.get("generation_run_id"),
        "run_kind": run.get("run_kind"),
        "status": run.get("status"),
        "prompt_id": run.get("prompt_id"),
        "application_pack_id": run.get("application_pack_id"),
        "source_resume_id": run.get("source_resume_id"),
        "tailored_resume_id": run.get("tailored_resume_id"),
        "job_id": run.get("job_id"),
        "warnings": _normalize_json_field(run.get("warnings")),
        "created_at": run.get("created_at"),
        "completed_at": run.get("completed_at"),
        "request_payload": _normalize_json_field(run.get("request_payload")),
    }


def _write_qa_notes(
    path: Path,
    *,
    generation_run_id: str | None,
    trace_id: str,
    label: str | None,
    warnings: list[str],
    artifacts: list[dict[str, Any]],
) -> None:
    warning_lines = "\n".join(f"- {warning}" for warning in warnings) if warnings else "- None"
    artifact_lines = (
        "\n".join(f"- `{artifact['exported_path']}` ({artifact.get('kind')})" for artifact in artifacts)
        if artifacts
        else "- None copied"
    )
    label_line = f"\nLabel: {label}\n" if label else ""
    path.write_text(
        f"""# QA Notes

Run: `{generation_run_id or "unknown"}`
Trace: `{trace_id}`{label_line}
## Checklist

- [ ] Prompt contains current canaries and expected contract text.
- [ ] JSON/plain-text output is complete and parseable for the operation type.
- [ ] Output has no blocked terms or obvious JD-copy saturation.
- [ ] PDF/text artifact matches the reviewed model output.
- [ ] Any warnings below are understood before using this run for calibration.

## Export Warnings

{warning_lines}

## Artifacts

{artifact_lines}

## Trace Settings Reminder

For complete prompt/response capture, run with `LLM_TRACE_STORE_CONTENT=true` and set
`LLM_TRACE_PREVIEW_CHARS` high enough for the full prompt and response.
""",
        encoding="utf-8",
    )


def _markdown_cell(value: Any) -> str:
    text = str(value or "")
    return text.replace("|", "\\|").replace("\n", " ").strip()


def _write_test_run_index(output_root: Path) -> None:
    rows: list[dict[str, Any]] = []
    skipped: list[str] = []
    if not output_root.exists():
        return

    for run_dir in sorted(path for path in output_root.iterdir() if path.is_dir()):
        manifest_path = run_dir / "manifest.json"
        if not manifest_path.exists():
            skipped.append(run_dir.name)
            continue
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            skipped.append(run_dir.name)
            continue

        summary = manifest.get("summary") if isinstance(manifest.get("summary"), dict) else {}
        generation_run = (
            manifest.get("generation_run") if isinstance(manifest.get("generation_run"), dict) else {}
        )
        operations = summary.get("operations") if isinstance(summary.get("operations"), list) else []
        warning_count = len(manifest.get("warnings")) if isinstance(manifest.get("warnings"), list) else 0
        artifact_count = len(manifest.get("artifacts")) if isinstance(manifest.get("artifacts"), list) else 0
        rows.append(
            {
                "exported_at": str(manifest.get("exported_at") or ""),
                "trace_id": str(manifest.get("trace_id") or run_dir.name),
                "generation_run_id": str(generation_run.get("generation_run_id") or run_dir.name),
                "folder": run_dir.name,
                "label": str(manifest.get("label") or ""),
                "operations": ", ".join(str(item) for item in operations),
                "calls": summary.get("total_calls") or 0,
                "tokens": summary.get("usage_total_tokens") or 0,
                "warnings": warning_count,
                "artifacts": artifact_count,
            }
        )

    rows.sort(key=lambda row: (row["exported_at"], row["folder"]), reverse=True)

    lines = [
        "# Test Run Index",
        "",
        "Generated from each run's `manifest.json`. Newest exports are listed first.",
        "",
        "| Exported at | Generation run | Trace | Label | Operations | Calls | Tokens | Warnings | Artifacts |",
        "|---|---|---|---|---|---:|---:|---:|---:|",
    ]
    for row in rows:
        folder = _markdown_cell(row["folder"])
        generation_run_id = _markdown_cell(row["generation_run_id"])
        trace_id = _markdown_cell(row["trace_id"])
        lines.append(
            "| "
            f"{_markdown_cell(row['exported_at'])} | "
            f"[`{generation_run_id}`]({folder}/) | "
            f"`{trace_id}` | "
            f"{_markdown_cell(row['label'])} | "
            f"{_markdown_cell(row['operations'])} | "
            f"{row['calls']} | "
            f"{row['tokens']} | "
            f"{row['warnings']} | "
            f"{row['artifacts']} |"
        )

    if skipped:
        lines.extend(
            [
                "",
                "## Skipped",
                "",
                "These folders do not have a readable `manifest.json`:",
                "",
            ]
        )
        lines.extend(f"- `{name}`" for name in skipped)

    (output_root / "_index.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def export_test_run_capture(
    *,
    trace_id: str,
    generation_run_id: str | None = None,
    label: str | None = None,
    out_dir: Path | None = None,
    overwrite: bool = True,
) -> Path:
    """Export a trace capture for QA and return the output directory."""

    output_root = out_dir or DEFAULT_OUT_DIR
    resolved_trace_id, generation_run, calls = _resolve_export_source(
        trace_id,
        generation_run_id=generation_run_id,
    )
    resolved_generation_run_id = (
        _text_value(generation_run.get("generation_run_id")) if generation_run else None
    )
    output_dir = output_root / (resolved_generation_run_id or resolved_trace_id)

    if output_dir.exists():
        if overwrite:
            shutil.rmtree(output_dir)
        else:
            raise FileExistsError(f"Test run export already exists: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    artifact_rows = _artifact_rows(generation_run=generation_run, calls=calls)

    call_exports = _write_call_exports(calls, output_dir)
    copied_artifacts, artifact_warnings = _copy_artifacts(
        artifact_rows,
        output_dir=output_dir,
    )
    warnings = _trace_warnings(calls) + artifact_warnings

    manifest = {
        "input_id": trace_id,
        "trace_id": resolved_trace_id,
        "label": label,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "exporter": "app.services.test_run_exporter",
        "source": {
            "database_url": (
                settings.effective_database_url.rsplit("@", 1)[-1]
                if "@" in settings.effective_database_url
                else settings.effective_database_url
            ),
            "artifact_dir": str(settings.artifact_dir),
        },
        "summary": _summarize_calls(calls),
        "generation_run": _generation_run_summary(generation_run),
        "calls": call_exports,
        "artifacts": copied_artifacts,
        "warnings": warnings,
    }
    _write_json(output_dir / "manifest.json", manifest)
    _write_qa_notes(
        output_dir / "qa-notes.md",
        generation_run_id=resolved_generation_run_id,
        trace_id=resolved_trace_id,
        label=label,
        warnings=warnings,
        artifacts=copied_artifacts,
    )
    _write_test_run_index(output_root)
    return output_dir
