# Phase 3.14.1 — Full tailor prompt reorganize (plan)

**Scope:** `tailor_resume_full` only — **`user.txt`**, **`system.txt`**, **`output_file_schema_rules/resume_diff_output.txt`**.  
**Status:** Reorg **implemented** (2026-05-01). **`PROMPT_VERSIONS`**: tailoring **v5.1**, **`tailoring_contract` v5.3** (`to_prompt_dict` omits per-entry **tech_stacks** and **positions**; titles/stacks only on resume).

---

## Slim response contract (prompt JSON)

`TailoringResponseContract.to_prompt_dict()` exposes **`entries`** + **`bullet_counts`** per section only (plus `mode`, `rules`, `output_keys`, `index_note`). **`experience_positions`** / **`experience_tech_stacks`** / **`project_tech_stacks`** stay on the Pydantic model for **`build_response_contract`** but are **not** serialized to the LLM — read titles and stacks from **`$original_resume`**.

---

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| User placeholder order | **JD → resume → response_contract → resume_diff_rules** |
| PRIMARY RUN RULES | **Top of `system.txt`** |
| Contract duplicates in prompt JSON | **Done** — no **tech_stacks** or **positions** in `to_prompt_dict()` |
| Section titles | **Unchanged** for grep continuity |

---

## Three-file charter

| File | Role |
|------|------|
| **`resume_diff_output.txt`** | Universal bible: PRECEDENCE, JSON shape, indexing, locks, **WHAT STAYS FIXED**, editorial (defensibility, bullets, calibration, SUMMARY/ROLE TITLE/ATS/SKILLS prose, banned words, portfolio rules, format examples) |
| **`system.txt`** | **PRIMARY RUN RULES**, **ROLE & GOAL**, **PROCESS** |
| **`user.txt`** | **EDITORIAL ORDER** TOC + data blocks (JD first) |

---

## `response_contract` (reminder)

Built per request in **`contracts.py`** → **`to_prompt_dict()`**; tells the LLM row labels (**entries**, typically company / project name) and **bullet_counts**. Job titles, stacks, and bullets: **`$original_resume`**. Not edited by hand.

---

## Future pass

- Lite / critique / rewrite alignment with new bible layout; **`TAILORING MODE:`** / empty full-mode catalog slice UX.
- **`$run_constraints`** or UI-driven PRIMARY rules.
