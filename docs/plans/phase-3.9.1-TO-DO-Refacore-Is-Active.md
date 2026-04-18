# Phase 3.9.1 — TO-DO: Refactor `is_active` / Active-Centric UX

**Status:** PLANNED — implementation postponed  
**Created:** 2026-04-17  
**Depends on:** Phase 3.8.2 (multi-resume: `is_active`, pins, per-row Tailor) — IMPLEMENTED  

---

## 1. Purpose

Reduce redundancy between **per-row Tailor** (and builder links) and **“active resume”** as a separate concept in the UI. Align **default Tailor source** with **last-used resume**, with a clear fallback when no history exists.

This document is the **technical implementation plan** for future work; it does not change behavior until implemented.

---

## 2. Decisions finalized (this session)

| Topic | Decision |
|-------|----------|
| **Tailor default source** (nav or `/tailor` without `?source=`) | Prefer **last-used resume id** (client-persisted). |
| **No last-used id, exactly one resume (N=1)** | Use **that** resume automatically. |
| **No last-used id, N > 1** | Not finalized — pick one rule during implementation (see §6). |
| **“Set active” in row menu** | Candidate for **removal** from UI — per-row Tailor covers “start from this resume”; active becomes optional or internal-only. |
| **Dashboard hero** (open builder, create/tailor tied to one active resume) | Candidate for **removal or collapse** once row-level actions + nav Tailor are sufficient; **empty state (0 resumes)** must remain obvious (upload-first). |

---

## 3. Goals

1. **UX:** One clear mental model — the **resume table** is the hub; **Tailor** on a row is the primary “tailor from this base” action.
2. **Defaults:** Opening **Tailor** without a query param uses **last-used**, then **single-resume** fallback.
3. **Onboarding:** **Zero resumes** still shows a **single dominant path** (upload), not a dependence on row actions.
4. **Engineering:** Minimize risky changes: prefer **UI + client defaulting** first; **backend / `is_active`** changes optional and phased.

---

## 4. Non-goals (for this phase)

- Full removal of `is_active` from the database without a dedicated migration design (optional follow-up).
- Changing tailoring **API** contract beyond what already exists (`source` / resume id on tailor flow).

---

## 5. Proposed technical approach (layers)

### 5.1 Client: “last-used Tailor source”

- **Storage:** Dedicated key, e.g. `tailor_last_source_resume_id` (or namespace under an existing app prefix), written when:
  - User starts a Tailor flow with a resolved source resume, and/or
  - User opens Builder from a specific resume (optional — aligns “working context” with last-used).
- **Read order** when loading `/tailor` and `searchParams` has **no** `source`:
  1. If `source` query param present and valid → use it (unchanged).
  2. Else if last-used id exists **and** is still in the fetched resume list → use it.
  3. Else if **N === 1** → use that resume’s id.
  4. Else apply **§6** (N > 1, no last-used).

- **Invalid last-used:** If stored id was deleted, clear it and re-run the same resolution chain.

**Files (expected):** `apps/frontend/app/(default)/tailor/page.tsx`, possibly a tiny helper in `apps/frontend/lib/` (e.g. `tailor-source-storage.ts`).

### 5.2 Dashboard: simplify chrome

- Remove **“Set active”** from row overflow menu **if** product accepts that Tailor + optional pin cover needs.
- Reduce or remove the **top “active resume” hero** block when **≥1** resume:
  - Keep **global** actions that are **not** duplicated per row: e.g. **Upload / add resume**, **Settings**, optional compact **“Tailor”** that goes to `/tailor` (uses last-used + §5.1).
- **N === 0:** Keep a **full empty state** — primary CTA upload; no dependence on row Tailor.

**Files (expected):** `apps/frontend/app/(default)/dashboard/page.tsx`, `apps/frontend/messages/en.json` (and parity keys in other locales if `Messages` type requires it).

### 5.3 Backend / `is_active` (optional phases)

**Phase A — UI only (low risk):**  
Keep DB and APIs as today (`is_active`, `PUT .../active`, health `has_active_resume`). Optionally **hide** “set active” in UI only.

**Phase B — Soften product reliance:**  
Still maintain `is_active` for **upload atomic** rules and health, but **do not** require users to “set active” for Tailor defaults (last-used drives Tailor).

**Phase C — Model cleanup (future):**  
Evaluate renaming or replacing `has_active_resume` with **`has_ready_resume`** or **`resume_count > 0`**, and whether **exactly one** `is_active` is still required — requires migration + test pass. **Out of scope** until Phase A/B are stable.

---

## 6. Open design choice (implement when scheduled)

**Cold start: N > 1 resumes, no last-used, no `?source=`:**

Pick one and document in code comments + user-facing copy if needed:

- **(a)** Default to **server `active_resume_id`** from list API (minimal new logic if still maintained).
- **(b)** Default to **first row** after current sort (pinned-first, etc.).
- **(c)** **No** preselection — user must choose in the dropdown (safest, extra click).

Recommendation: **(a)** if `is_active` remains in backend; **(b)** if active is deprecated in UI first.

---

## 7. Testing plan

- **Unit / integration (frontend):** Tailor page tests for resolution order (mock `fetchResumeList`, localStorage).
- **E2E (if present):** Upload → open Tailor from nav → assert source matches last-used after a prior tailor from row B.
- **Regression:** `npm run verify` in `apps/frontend` (lint + vitest + build). Resume API mock patterns: use **`importOriginal`** for `@/lib/api/resume` mocks (see Phase 3.8.2 / `tailor-page.test.tsx`).
- **Backend:** `uv run pytest` — no change expected for Phase A; run full suite after any `is_active` / health change.

---

## 8. Implementation checklist (for when work starts)

```
[ ] 5.1  Add last-used storage key + read/write helpers
[ ] 5.1  Integrate resolution order in Tailor page (after fetchResumeList + searchParams)
[ ] 5.1  Clear invalid last-used when resume missing from list
[ ] 5.2  Remove or hide "Set active" from dashboard row menu (product sign-off)
[ ] 5.2  Collapse/remove active hero; keep empty state + upload for N=0
[ ] 5.2  Ensure nav "Tailor" or global tailor entry uses last-used path
[ ] 6    Resolve N>1 cold-start rule (a/b/c) and test
[ ] 7    Update/add tests (Vitest + E2E as applicable)
[ ] 7    Run apps/frontend npm run verify + apps/backend pytest
[ ] —   Optional: docs/agent/architecture/storage-and-rendering.md note on last-used vs is_active
```

---

## 9. References

- Phase 3.8.2 design / checklist: `docs/plans/phase-3.8.2-master-resume-refactor-design-claude-opus-4.5.md`
- Dashboard + Tailor: `apps/frontend/app/(default)/dashboard/page.tsx`, `apps/frontend/app/(default)/tailor/page.tsx`

---

*End of Phase 3.9.1 plan*
