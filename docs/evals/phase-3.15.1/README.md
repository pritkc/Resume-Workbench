# Phase 3.15.1 — Eval fixtures (manual)

This folder holds **non-CI** assets for human or offline LLM evaluation of the tailoring pipeline after Phase 3.15.1 changes.

## Contents

- `jds/` — Short synthetic job descriptions (new-grad SWE, full-stack, etc.).
- `rubric.md` — Scoring dimensions aligned with `phase-3.15.1-technical-implementation-plan-by-gpt.md`.

## JD fixture set

- `new_grad_backend_swe.txt` — backend/API new-grad role.
- `new_grad_fullstack.txt` — full-stack new-grad role.
- `data_engineer_entry_level.txt` — entry-level data engineering role.
- `ml_ai_engineer_entry_level.txt` — entry-level ML/AI engineering role.
- `unsupported_kubernetes_trap.txt` — cloud-platform role with Kubernetes as an unsupported/adjacent keyword trap.
- `senior_scope_trap.txt` — senior staff role that should trigger scope mismatch handling.

## How to run a manual pass

1. Normalize a sample resume from `docs/plans/temp/*.yaml` through your usual import path (same shape as production `processed_data`).
2. Pair with a JD file under `jds/`.
3. Run tailoring + optional critique; apply diff; review rehydrated resume against `rubric.md`.
4. Record scores and failure modes in your issue tracker or experiment log.

CI-blocking checks live under `apps/backend/tests/unit/test_prompt_lint.py` and related tests — not under this directory.
