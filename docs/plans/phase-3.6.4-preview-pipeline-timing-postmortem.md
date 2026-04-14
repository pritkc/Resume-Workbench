# Phase 3.6.4 - Preview Pipeline Timing Postmortem

## Goal
Measure and persist accurate end-to-end timing for the flow:
1. Receive JD
2. Run tailoring + auxiliary generation
3. Return `Review AI Tailoring Results`

## Latest Real Run Snapshot (from production-like local DB)
Date: 2026-04-14
Latest preview trace: `dbf03fb4-ab2e-40c1-82eb-ba89d243ad76`

LLM operation latency breakdown from `llm_calls`:
- `job_extract_keywords`: **10,705 ms**
- `resume_generate_full`: **16,981 ms**
- `cover_letter_outreach_generate`: **190,073 ms**

Total LLM latency in that run: **217,759 ms (217.76s, ~3m38s)**

Primary bottleneck: `cover_letter_outreach_generate` dominates the runtime.

## What Is Now Instrumented

### Backend (authoritative server-side timings)
The preview pipeline now captures host/sub-event timings in `pipeline_timing` and stores them in:
- Preview response payload (`ImproveResumeData.pipeline_timing`)
- Generation run `result_payload.pipeline_timing`

Recorded host/sub-events include:
- `job_keywords / extract`
- `job_keywords / persist` (or `reuse_cached`)
- `tailoring / generate_full_resume`
- `postprocess / canonicalize_resume`
- `job_preview_hash / persist`
- `diff / calculate`
- `improvements / build_suggestions`
- `auxiliary_messages / generate_cover_letter_outreach`
- `target_metadata / merge`
- `llm_trace / summarize_calls`
- `llm_trace / aggregate_operation_timing`
- `llm / <operation>` aggregated entries per LLM operation (with call counts)
- `application_pack / create`
- `generation_run / create_preview_run`
- `rendercv / render_and_store_preview_artifacts`
- `application_pack / link_generation_run`

### Frontend (user-perceived timings)
The preview result now appends frontend timing events:
- `frontend / upload_job_description`
- `frontend / preview_request`
- `frontend / total_flow`

These appear in the Review modal under **Pipeline Timing**.

## How To Pull Accurate Timing Postmortem Per Run

### 1) Find latest preview run + trace
```sql
SELECT
  generation_run_id,
  created_at,
  request_payload->>'llm_trace_id' AS trace_id
FROM generation_runs
WHERE run_kind='application_pack_preview'
ORDER BY created_at DESC
LIMIT 5;
```

### 2) Get persisted host/sub-event timeline (new)
```sql
SELECT
  generation_run_id,
  result_payload->'pipeline_timing' AS pipeline_timing
FROM generation_runs
WHERE run_kind='application_pack_preview'
ORDER BY created_at DESC
LIMIT 1;
```

### 3) Drill into LLM subevents for that trace
```sql
WITH latest AS (
  SELECT request_payload->>'llm_trace_id' AS trace_id
  FROM generation_runs
  WHERE run_kind='application_pack_preview'
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT
  c.operation,
  c.success,
  c.latency_ms,
  c.created_at,
  c.completed_at
FROM llm_calls c
JOIN latest l ON c.trace_id=l.trace_id
ORDER BY c.latency_ms DESC;
```

### 4) Spot recurring bottlenecks over recent runs
```sql
WITH latest_traces AS (
  SELECT request_payload->>'llm_trace_id' AS trace_id
  FROM generation_runs
  WHERE run_kind='application_pack_preview'
  ORDER BY created_at DESC
  LIMIT 10
)
SELECT
  c.operation,
  COUNT(*) AS calls,
  ROUND(AVG(c.latency_ms)) AS avg_ms,
  MAX(c.latency_ms) AS max_ms,
  ROUND(SUM(c.latency_ms)) AS total_ms
FROM llm_calls c
JOIN latest_traces t ON c.trace_id=t.trace_id
GROUP BY c.operation
ORDER BY total_ms DESC;
```

## Accuracy Notes
- `latency_ms` is request-scoped LLM duration and is the most reliable metric for LLM time.
- Pipeline event duration uses `perf_counter()` for stable elapsed timing and ISO timestamps for ordering.
- Frontend timings reflect user-perceived wall clock from click to modal.

## Immediate Optimization Focus
1. Reduce `cover_letter_outreach_generate` latency (largest contributor).
2. Add request timeout + graceful fallback for auxiliary generation when it exceeds threshold.
3. Consider concurrent/streamed auxiliary generation only if quality remains stable.
4. Keep `job_keywords` cache hit ratio high to avoid repeated extract cost.
