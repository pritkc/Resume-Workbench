# Phase 3.14.1 — Full tailor prompt reorganize (plan)

**Scope:** `tailor_resume_full` only — **`user.txt`**, **`system.txt`**, **`output_file_schema_rules/resume_diff_output.txt`**.  
**Status:** Reorg **implemented** (2026-05-01). **`PROMPT_VERSIONS`** tailoring keys bumped **v5.0 → v5.1**.

---

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| User placeholder order | **JD → resume → response_contract → resume_diff_rules** |
| PRIMARY RUN RULES | **Top of `system.txt`** |
| Contract / `tech_stacks` slimming | **Skipped** — later pass |
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

Built per request in **`contracts.py`** → **`to_prompt_dict()`**; tells the LLM allowed keys, indices, bullet counts. Not edited by hand. **`$resume_diff_rules`** is static (plus overrides).

---

## Future pass

- Lite / critique / rewrite alignment with new bible layout; **`TAILORING MODE:`** / empty full-mode catalog slice UX.
- **`$run_constraints`** or UI-driven PRIMARY rules.
- Token slimming on **`to_prompt_dict`**.
