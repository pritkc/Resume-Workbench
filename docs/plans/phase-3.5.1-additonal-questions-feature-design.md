# Phase 3.5.1 - Additional Questions Feature Design

## Objective
Enable users to paste/write custom job application questions after resume generation and get personalized answers in a single LLM request using:
- generated tailored resume context
- job description context
- target metadata (role/company/location)

Primary user outcome:
- user can submit multiple custom questions at once
- system returns cohesive, personalized answers under one generation operation
- answers are tied to the application pack for later reuse/edit/copy

## Product Scope

### In Scope (V1)
- New "Additional Questions" workflow in Tailor/Resume flow after preview generation.
- Batch question submission (single API call -> single LLM request).
- Batch answer generation grounded on tailored resume + JD context.
- Persist generated Q&A to the related application pack context.
- Regenerate all answers or selected answers.
- Single fixed default answer style (professional, concise, confident) with no user-configurable style controls.

### Out of Scope (V1)
- Per-company answer library across multiple packs.
- Multi-language answer translation workflows beyond current content language setting.
- Auto-fill browser extension or ATS integration.

## User Flow

### Primary Flow
1. User generates tailored resume preview (existing flow).
2. In review screen (or resume viewer for confirmed packs), user opens "Additional Questions" panel.
3. User pastes one or more questions (one per line or structured list input).
4. User submits.
5. Backend performs one LLM request for the whole batch.
6. UI renders answer cards mapped to each question.
7. User can copy individual answers, copy all, edit manually, or regenerate.

### Secondary Flows
- Regenerate selected questions only.
- Save edited answers back to pack (manual override).
- Open previously generated answers when returning to pack.

## UX Placement

### Tailor Page
- Add a section under preview/diff review: `Additional Questions`.
- Disabled until preview is available (requires generated resume context).
- Show status chips: `idle`, `generating`, `saved`, `error`.

### Resume Viewer/Builder (confirmed resume)
- Add read/write panel for existing question answers tied to the pack.
- Keep clear distinction between:
  - AI-generated answer
  - user-edited answer

## API Design

### Endpoint
`POST /api/v1/application-packs/questions/answer`

Rationale:
- aligns with existing pack-centered generation (`preview`, `confirm`)
- naturally binds outputs to application pack lifecycle

### Request Schema (proposed)
```json
{
  "resume_id": "string",
  "job_id": "string",
  "application_pack_id": "string|null",
  "generation_run_id": "string|null",
  "questions": [
    {
      "question_id": "q_0",
      "question": "Why do you want to work here?"
    }
  ],
  "regenerate": false,
  "target_question_ids": []
}
```

Note:
- No `tone` or `length` fields in V1 request payload.
- Output style is controlled server-side using the existing prompt style conventions.

### Response Schema (proposed)
```json
{
  "request_id": "uuid",
  "data": {
    "application_pack_id": "pack-123",
    "generation_run_id": "run-questions-123",
    "answers": [
      {
        "question_id": "q_0",
        "question": "Why do you want to work here?",
        "answer": "...",
        "confidence": "high",
        "warnings": []
      }
    ],
    "warnings": []
  }
}
```

### Validation Rules
- `questions` min 1, max 15 (hard cap for single-call stability).
- each question non-empty after trim.
- max chars per question: 500.
- total combined question chars cap: 5000.
- deduplicate exact repeated questions in request.
- if request exceeds caps: 400 with actionable detail.

## Persistence Design

### V1 Storage Strategy
Use `generation_runs` with `run_kind = "application_pack_questions"`.

`request_payload`:
- question list
- target question ids (if partial regen)

`result_payload`:
- answers array
- grounding metadata summary
- warnings

Why this first:
- no schema migration required for immediate release
- consistent with existing observability and artifact lifecycle

### V1.1 Optional Optimization
Add `application_packs.question_answers` JSON column for fast latest-read without scanning runs.
- populated from most recent successful `application_pack_questions` run

## Prompting Strategy (Single LLM Call)

### New Prompt Surface
Add prompt template(s):
- `APPLICATION_QUESTIONS_PROMPT`
- operation name: `application_questions_generate`
- prompt version key: `application_questions_generate`

### Input Context to Model
- Candidate profile summary from tailored resume (compact, no sensitive unnecessary fields).
- Key experience bullets and skills relevant to JD.
- Job target context: role/company/location and JD intelligence highlights.
- User questions array.

### Prompt Style and Reuse
- Follow existing prompt style used by cover letter/outreach and tailoring prompts:
  - concise instruction blocks
  - strict JSON output contract
  - grounded/no-invention rules
- Reuse existing compact candidate context strategy (`CandidatePromptProfile`) instead of creating a new resume summarizer format.
- Reuse existing LLM call patterns (`complete_json`, retries, metadata, prompt version tagging) to minimize breakage risk.

### Output Contract
JSON-only with stable shape:
```json
{
  "answers": [
    {
      "question_id": "q_0",
      "answer": "...",
      "confidence": "high|medium|low",
      "warnings": []
    }
  ]
}
```

### Prompt Rules
- Answer each question directly and specifically.
- Ground claims in provided resume/JD context only.
- Do not invent certifications, employers, dates, or metrics.
- If context is weak, provide best possible answer with a short caveat in `warnings`.
- Keep formatting plain text (no markdown lists unless question explicitly asks).

## Grounding and Safety

### Grounding Guardrails
- Reuse existing compact candidate profile strategy used in cover letter/outreach path.
- Reuse JD intelligence payload already derived for tailoring.
- Include strict anti-hallucination rule in system prompt.

### Sensitive Data Handling
- avoid sending unnecessary personal identifiers where not needed.
- redact contact info from prompt payload for this operation.

### Failure Behavior
- If batch generation fails, return structured error with retry guidance.
- If some answers fail parse/quality checks, return partial answers + warnings (no total loss).

## Backend Design

### New/Updated Modules
- `app/routers/application_packs.py`
  - new endpoint for question answer generation
- `app/schemas/models.py` or new `app/schemas/questions.py`
  - request/response models for questions feature
- `app/services/application_questions.py` (new)
  - prompt assembly
  - answer generation and normalization
  - confidence/warning mapping
- `app/prompts/templates.py`
  - new prompt strings + version entry

### Reused Utilities
- `llm_trace_scope` for request tracing
- `db.create_generation_run` / `db.update_generation_run`
- existing resume/job/application pack fetch and validation helpers
- `CandidatePromptProfile` for compact grounded candidate context
- existing prompt version registry and metadata pattern in `app.prompts.templates.PROMPT_VERSIONS`

## Frontend Design

### Tailor Page
- Add `AdditionalQuestionsPanel` component with:
  - textarea or dynamic question rows
  - submit/regenerate controls
  - answer cards with copy/edit actions

### API Client
- add function:
  - `answerApplicationQuestions(payload)`

### State Model
- `questionsDraft[]`
- `answers[]`
- `generationState: idle|generating|done|error`
- `error`, `warnings`

## Edge Cases and Expected Behavior

1. Empty/whitespace question list
- return validation error; no LLM call.

2. Duplicate questions
- dedupe automatically; preserve first question_id mapping.

3. Oversized input batch
- reject with clear limits.

4. Missing pack id on preview stage
- allow generation with `resume_id + job_id`; attach to run.
- once pack exists, later calls should bind to pack.

5. Resume updated after answers were generated
- show stale indicator in UI if `resume.updated_at > answers_run.created_at`.

6. Unsupported question type (requires legal advice)
- answer conservatively with warning marker.

## Testing Plan

### Unit Tests
- prompt builder includes expected context fields and excludes forbidden fields.
- request validator caps and dedupe behavior.
- answer normalization and fallback behavior.

### Integration Tests
- endpoint returns answers for multi-question batch.
- run creation and result persistence in generation runs.
- regenerate selected subset works.
- error path returns structured detail and warnings.

### Frontend Tests
- panel input and submission flow.
- loading/cancel/error states.
- answer render/copy/edit/regenerate interactions.

### E2E Tests
- dashboard -> tailor -> generate resume -> submit custom questions -> get answers -> confirm -> reopen and verify persistence.

## Observability and Metrics

Track via `LLMCall` and generation run payloads:
- operation latency
- success/failure rate
- average questions per batch
- average answer length
- parse retry rate
- warnings frequency

Success KPIs (initial):
- >= 95% successful generations for valid inputs
- p95 latency <= existing preview SLA + 20%
- < 3% parse/format retries

## Rollout Plan

### Phase 3.5.1.a (MVP)
- backend endpoint + prompt + basic panel in tailor page
- single batch generation and display

### Phase 3.5.1.b
- persistence surfacing in resume viewer
- partial regeneration and manual answer edits

### Phase 3.5.1.c
- stale-answer detection and improved warnings
- answer quality instrumentation dashboard

## Acceptance Criteria

- User can submit multiple custom application questions in one request after resume generation.
- System returns personalized answers for all valid questions in a single LLM call.
- Answers are grounded on tailored resume + JD context and persisted with generation run linkage.
- UI supports copy and regenerate.
- Automated tests cover happy path + validation + error scenarios.
