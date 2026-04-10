# Phase 3.3.3 — Compact Addressed Output Format
## Implementation Plan (final, pre-code)

---

## Already Live in the Codebase

| Change | Status | Where |
|---|---|---|
| `tech_stacks` rename (project summary → LLM-facing field) | ✅ live | `tailoring/models.py:150`, `contracts.py:90,144` |
| `SkillGroup` schema: `label` + `values` only, no `id` | ✅ live | `schemas/models.py:522–536` |
| Location written to `personalInfo.location` from JD | ✅ live | `preservation.py:329–345` (`_resolved_target_location`) |
| `ResumeChange._normalise_op_alias` handles `op`/`after`/`value` variants | ✅ live | `schemas/models.py` |

**Location note:** `finalize_tailored_resume` already writes `job_keywords["location"]` → `personalInfo.location` when present. No new code needed. The plan must confirm that `extract_job_keywords` reliably extracts `location` from JDs — confirmed via `EXTRACT_KEYWORDS_PROMPT` (rules include `location` field). This is already working end-to-end.

---

## New Output Contract: Compact Addressed Diff

### Design constraints

1. **Every output token is new content** — nothing the server already knows.
2. **No `op` field** — position is the operation. Existing index → overwrite. Prompt forbids new indices.
3. **Fixed quantity** — model may rewrite bullets, not add them. Total bullet count per entry can only stay equal (rewrite) or decrease (by omitting an index and leaving original bullets intact). No empty-string deletion — simpler to reason about and fewer edge cases.
4. **Skills: no new values, same total count.** May relabel groups, reorder values within the pool, regroup across labels.
5. **Partial entries only** — only entries with changes appear. Server copies everything else from original.
6. **Summary is a single tight sentence** — enforced via prompt.

### Output shape

```json
{
  "summary": "<one-sentence summary>",
  "experience": {
    "0": { "bullets": { "0": "...", "2": "..." } },
    "1": { "bullets": { "1": "..." } }
  },
  "projects": {
    "0": {
      "tech_stacks": "Python, Click, observability tooling",
      "bullets": { "0": "..." }
    }
  },
  "skills": [
    { "label": "Programming Languages", "values": ["Python", "SQL", "Bash"] },
    { "label": "Frameworks", "values": ["FastAPI", "Flask"] }
  ]
}
```

### Field-by-field rules

**`summary`**
- Always present.
- One sentence only. Format: `"[N]+ years in [domain], with [1–2 JD-specific strengths]."` — no second sentence, no em-dash.
- System prompt enforces this with a single explicit constraint.

**`experience` / `projects`**
- Object keyed by 0-based entry index as a string (`"0"`, `"1"`, …).
- Entries absent from the object → server keeps original unchanged.
- Each entry: `{ "bullets": { "INDEX": "new text", ... } }` where INDEX is a string integer matching the original `description` array position.
- `INDEX` must be within the original bullet count for that entry (provided in contract via `bullet_counts`). Any index ≥ original count is silently ignored by the server.
- To rewrite a bullet: provide its index with new text. To leave a bullet unchanged: omit its index. There is no deletion mechanism — the server fills any omitted index from the original.
- Projects may additionally include `"tech_stacks": "..."` to overwrite the project tagline.

**`skills`**
- Array of `{ "label": "...", "values": [...] }` — no `id` field, ever.
- The normalizer (`normalize_skill_groups`) accepts this shape natively.
- Omit the `"skills"` key entirely when no skill changes are intended.
- Total value count across all groups must equal `skills_values` from the contract (enforced by server-side preservation pass as backstop).
- No new values may be introduced — relabel, reorder, regroup only.

### Why not `["Label", ["val1", "val2"]]` tuple syntax?
The `normalize_skill_groups` → `_normalize_group_dict` code handles dict inputs (`label` + `values`/`items`) and string inputs, but not raw list-of-two-elements. Accepting that shape would require a new coercion branch and is brittle to parse. The dict form `{"label": "...", "values": [...]}` is already the minimal supported representation and is unambiguous.

---

## Response Contract: What We Send to the LLM

New compact contract replaces the verbose `sections` object. Built in `contracts.py` and serialised by `TailoringResponseContract.to_prompt_dict()`.

```json
{
  "mode": "full",
  "output_keys": ["summary", "experience", "projects", "skills"],
  "experience": {
    "entries": ["DataFlow Inc.", "Bright Systems", "QuickCart"],
    "bullet_counts": [4, 3, 2]
  },
  "projects": {
    "entries": ["LogLens", "PricePulse"],
    "bullet_counts": [3, 2]
  },
  "skills_values": 16
}
```

- `entries`: names in index order — model uses as mental anchors (does not echo them back).
- `bullet_counts`: exact bullet count per entry — defines valid index range; model may not exceed it.
- `skills_values`: total count of skill values across all groups — model's budget.
- `output_keys`: exact top-level keys the model must emit.

---

## Prompt Changes

### `TAILORING_SYSTEM_PROMPT` — OUTPUT block replacement

```
OUTPUT:
- JSON with exactly these keys: "summary", "experience", "projects", "skills"
- summary: one sentence — "[N]+ years in [domain], [1-2 JD strengths]." No second sentence.
- experience / projects: object keyed by 0-based entry index (string "0", "1", …)
  - only include entries you are changing
  - each entry: { "bullets": { "INDEX": "rewritten text" } }
  - projects may also include "tech_stacks": "new tagline"
  - INDEX must be within bullet_counts for that entry (from contract)
  - omit an index to keep that bullet unchanged — do NOT write empty strings
- skills: array of { "label": "...", "values": [...] } — no id field
  - omit "skills" key entirely if no changes
  - total value count must equal skills_values from contract
  - no new values; relabel and reorder only
- Do NOT emit: id, company, location, dates, role, github, website, customSections, changes[]
```

### `TAILORING_MODE_CONSTRAINTS` — updated strings

```python
"nudge": "Rewrite bullets conservatively. Only address bullets that benefit from small wording improvement. Do not address every bullet. No new bullets.",
"keywords": "Weave JD keywords into existing bullets. Only rewrite bullets where a keyword fits naturally. No new bullets.",
"full": "Rewrite bullets to strongly match the JD. You may rewrite any existing bullet at its index. No new bullets — only rewrite what is already there.",
```

All three modes: **no new bullets, no deletion, just selective overwrite.**

### User prompt REWRITING EXAMPLE — updated

```
REWRITING EXAMPLE:
Original bullet: "Worked on backend systems"
JD mentions: Kubernetes, CI/CD
Rewritten: "Built and maintained backend services across Kubernetes clusters with automated CI/CD pipelines"

OUTPUT FORMAT EXAMPLE:
{
  "summary": "5+ years in Python backend engineering with expertise in high-throughput APIs and CI/CD.",
  "experience": {
    "0": { "bullets": { "1": "Built and maintained backend services across Kubernetes clusters..." } }
  }
}
```

---

## Server-Side Reconstruction: `apply_compact_diff`

New function in `preservation.py`. Called immediately after `TailoringLLMResponseV2.model_validate(result)` in orchestration. Produces a dict in `TailoringResumePayload` shape — all downstream code unchanged.

```python
def apply_compact_diff(
    original_resume_data: dict[str, Any],
    diff: dict[str, Any],
) -> dict[str, Any]:
    """Apply compact addressed diff onto the original resume. Returns TailoringResumePayload-shape dict."""
    result = copy.deepcopy(original_resume_data)

    if "summary" in diff and isinstance(diff["summary"], str):
        result["summary"] = diff["summary"].strip()

    for diff_key, resume_key in [("experience", "workExperience"), ("projects", "personalProjects")]:
        section_diff = diff.get(diff_key)
        if not isinstance(section_diff, dict):
            continue
        entries = result.get(resume_key, [])
        for entry_idx_str, entry_diff in section_diff.items():
            try:
                entry_idx = int(entry_idx_str)
            except (ValueError, TypeError):
                logger.warning("compact_diff: non-integer entry key %r in %s — skipped", entry_idx_str, diff_key)
                continue
            if entry_idx < 0 or entry_idx >= len(entries):
                logger.warning("compact_diff: %s index %d out of range (len=%d) — skipped", diff_key, entry_idx, len(entries))
                continue
            if not isinstance(entry_diff, dict):
                continue

            entry = entries[entry_idx]

            # tech_stacks: project tagline (maps to 'summary' in storage)
            if diff_key == "projects" and "tech_stacks" in entry_diff:
                ts = entry_diff["tech_stacks"]
                if isinstance(ts, str):
                    entry["summary"] = ts.strip() or None

            # bullets: selective overwrite only
            bullets_diff = entry_diff.get("bullets")
            if isinstance(bullets_diff, dict):
                desc = list(entry.get("description") or [])
                orig_len = len(desc)
                for bullet_idx_str, bullet_text in bullets_diff.items():
                    try:
                        bullet_idx = int(bullet_idx_str)
                    except (ValueError, TypeError):
                        logger.warning("compact_diff: non-integer bullet key %r — skipped", bullet_idx_str)
                        continue
                    if bullet_idx < 0 or bullet_idx >= orig_len:
                        logger.warning(
                            "compact_diff: bullet index %d out of range (orig_len=%d) in %s[%d] — skipped",
                            bullet_idx, orig_len, diff_key, entry_idx,
                        )
                        continue
                    if not isinstance(bullet_text, str) or not bullet_text.strip():
                        logger.warning("compact_diff: empty/non-string bullet at %s[%d].bullets[%d] — skipped", diff_key, entry_idx, bullet_idx)
                        continue
                    desc[bullet_idx] = bullet_text.strip()
                entry["description"] = desc

    # skills
    skills_diff = diff.get("skills")
    if isinstance(skills_diff, list):
        original_values = _all_skill_values(original_resume_data)
        new_values = {v for group in skills_diff for v in (group.get("values") or []) if isinstance(v, str)}
        invented = new_values - original_values
        if invented:
            logger.warning("compact_diff: invented skill values %s — stripping from output", sorted(invented))
            skills_diff = _strip_invented_skills(skills_diff, original_values)
        result.setdefault("skills", {})["groups"] = skills_diff

    return result
```

**Helper functions needed (also in `preservation.py`):**
```python
def _all_skill_values(resume_data: dict[str, Any]) -> set[str]:
    skills = resume_data.get("skills") or resume_data.get("additional") or {}
    groups = skills.get("groups", [])
    return {v for group in groups for v in (group.get("values") or []) if isinstance(v, str)}

def _strip_invented_skills(
    skills_diff: list[dict[str, Any]],
    allowed: set[str],
) -> list[dict[str, Any]]:
    return [
        {"label": g.get("label", ""), "values": [v for v in (g.get("values") or []) if v in allowed]}
        for g in skills_diff
    ]
```

---

## New Pydantic Models

### `tailoring/models.py` — add two new models

```python
class CompactBulletDiff(BaseModel):
    """Per-entry diff in the compact addressed output format."""
    model_config = ConfigDict(extra="ignore")   # silently drop id, company, etc.

    tech_stacks: str | None = None              # projects only; ignored for experience
    bullets: dict[str, str] = Field(default_factory=dict)  # str(int) → new text

class TailoringLLMResponseV2(BaseModel):
    """Compact LLM response: only changed content, addressed by index."""
    model_config = ConfigDict(extra="ignore")   # drop any legacy keys (changes[], workExperience, etc.)

    summary: str = ""
    experience: dict[str, CompactBulletDiff] = Field(default_factory=dict)
    projects: dict[str, CompactBulletDiff] = Field(default_factory=dict)
    skills: list[dict[str, Any]] | None = None
```

`extra="ignore"` on both models means the model can emit `changes[]`, `workExperience`, `id`, etc. — they are silently dropped without a `ValidationError`. This eliminates the need for the fallback path in most cases.

### Keep `TailoringLLMResponse` (existing)

Only invoked if `TailoringLLMResponseV2.model_validate` fails entirely (e.g. the model emits no `summary` key at all). In practice, `extra="ignore"` means the new model will accept almost any dict, so the fallback is a genuine last resort.

---

## Response Contract Model Changes

### `tailoring/models.py` — `TailoringResponseContract.to_prompt_dict()`

Replace the current `sections`-based serialisation with the new compact address format:

```python
def to_prompt_dict(self) -> dict[str, Any]:
    out: dict[str, Any] = {
        "mode": self.prompt_mode,
        "output_keys": ["summary", "experience", "projects", "skills"],
    }
    # populated by build_response_contract from resume payload
    if self._experience_entries:
        out["experience"] = {
            "entries": self._experience_entries,
            "bullet_counts": self._experience_bullet_counts,
        }
    if self._project_entries:
        out["projects"] = {
            "entries": self._project_entries,
            "bullet_counts": self._project_bullet_counts,
        }
    if self._skills_values_count is not None:
        out["skills_values"] = self._skills_values_count
    return out
```

New private fields on `TailoringResponseContract` (set by `build_response_contract`):
```python
_experience_entries: list[str] = []          # company names in index order
_experience_bullet_counts: list[int] = []
_project_entries: list[str] = []             # project names in index order
_project_bullet_counts: list[int] = []
_skills_values_count: int | None = None
```

These are not Pydantic fields — they are set post-construction via a builder pattern or by extending `build_response_contract` to return a richer object.

**Simpler alternative (preferred):** Make `to_prompt_dict()` accept the payload directly, or store the needed data in the existing `sections` dict as metadata fields that `to_prompt_dict()` reads and transforms. The key requirement is that `build_response_contract` has access to the resume payload (it already does).

### `tailoring/contracts.py` — `build_response_contract()`

Add extraction of entry names and bullet counts:

```python
# Work experience
work_entries = resume_payload.workExperience
experience_entry_names = [e.company for e in work_entries]
experience_bullet_counts = [len(e.description) for e in work_entries]

# Projects  
project_entries = resume_payload.personalProjects
project_entry_names = [e.name for e in project_entries]
project_bullet_counts = [len(e.description) for e in project_entries]

# Skills
groups = resume_payload.skills.groups
skills_values_count = sum(len(g.values) for g in groups)
```

Pass these into the contract object for serialisation.

---

## Orchestration Changes

### `tailoring/orchestration.py` — `generate_tailored_resume()`

Replace the existing `TailoringLLMResponse.model_validate` + `rehydrate_tailoring_resume` block:

```python
# Parse compact response
try:
    llm_response_v2 = TailoringLLMResponseV2.model_validate(result)
    # Check it's actually using the new format (has at least one non-empty section)
    has_compact_content = (
        llm_response_v2.summary
        or llm_response_v2.experience
        or llm_response_v2.projects
        or llm_response_v2.skills is not None
    )
except Exception:
    has_compact_content = False

if has_compact_content:
    raw_llm_resume_data = apply_compact_diff(original_resume_data, llm_response_v2.model_dump(exclude_none=True))
    declared_changes = []   # no changes[] in new format; computed from diff instead
else:
    # Fallback: model returned legacy full-body format
    logger.warning("LLM returned legacy full-body format — falling back to v3.0 parse path")
    llm_response = TailoringLLMResponse.model_validate(result)
    tailored_payload = TailoringResumePayload.model_validate(llm_response.model_dump(exclude={"changes"}))
    raw_llm_resume_data = rehydrate_tailoring_resume(tailored_payload, original_resume_data=original_resume_data)
    declared_changes = llm_response.changes
```

---

## Edge Cases — Full Coverage

| Scenario | Handling |
|---|---|
| Model emits `"experience": {"9": ...}` on 3-entry resume | Entry index ≥ len → skip + warn |
| Model emits `"bullets": {"5": "..."}` on 4-bullet entry | Bullet index ≥ orig_len → skip + warn |
| Model emits empty string as bullet text | Empty/blank bullet → skip + warn (no silent deletion) |
| Model emits non-integer key (e.g. `"DataFlow Inc."`) | `int()` raises → skip + warn |
| Model emits `"tech_stacks"` on an experience entry | Accepted by `CompactBulletDiff` but ignored in reconstruction (only applied for projects) |
| Model emits `"id"` inside a skill group | `SkillGroup` ignores it; `normalize_skill_groups` accepts label+values only |
| Model invents new skill value not in original | `_strip_invented_skills` removes it; existing preservation pass is final backstop |
| Model emits fewer skill values than `skills_values` (removed some) | Preservation pass (`preserve_original_skills`) restores missing originals |
| `"skills"` key absent from diff | Original skills untouched |
| `"experience"` key absent from diff | Original WE untouched |
| Model emits `"changes": [...]` in the response | `extra="ignore"` on `TailoringLLMResponseV2` — silently dropped |
| Model emits `"workExperience": [...]` (legacy key) | `extra="ignore"` — silently dropped |
| Model emits `"summary"` with multiple sentences | Server accepts as-is; prompt enforces single sentence; no hard truncation (would risk cutting mid-sentence) |
| `original_resume_data` is `None` | `apply_compact_diff` short-circuits: returns original payload as-is with summary applied only |
| `skills_diff` is not a list (e.g. model emitted a dict) | `isinstance(skills_diff, list)` check fails → original skills kept |
| Model returns empty dict `{}` | `has_compact_content` is False → fallback to legacy path |
| Model returns `{"summary": ""}` (empty summary) | Empty string → treated as no summary change; original summary preserved in `finalize_tailored_resume` |
| `nudge`/`keywords` mode with mode constraint enforced | Prompt says "no new bullets" in all modes. Contract provides `bullet_counts` to anchor valid indices. |

---

## Files Touched

### `apps/backend/app/services/tailoring/models.py`
- [x] Add `CompactBulletDiff` model
- [x] Add `TailoringLLMResponseV2` model
- [x] Refactor `TailoringResponseContract.to_prompt_dict()` to emit compact address contract
- [x] Add storage fields for entry names + bullet counts to `TailoringResponseContract`

### `apps/backend/app/services/tailoring/contracts.py`
- [x] Extract `experience_entry_names`, `experience_bullet_counts`, `project_entry_names`, `project_bullet_counts`, `skills_values_count` from `resume_payload`
- [x] Pass into `TailoringResponseContract` for serialisation

### `apps/backend/app/services/tailoring/preservation.py`
- [x] Add `apply_compact_diff(original_resume_data, diff)` function
- [x] Add `_all_skill_values(resume_data)` helper
- [x] Add `_strip_invented_skills(skills_diff, allowed)` helper

### `apps/backend/app/services/tailoring/orchestration.py`
- [x] Replace `TailoringLLMResponse.model_validate` + `rehydrate_tailoring_resume` block with compact parse + fallback
- [x] Pass `declared_changes=[]` when using compact path (change manifest computed from diff anyway)

### `apps/backend/app/prompts/templates.py`
- [x] Replace `OUTPUT:` block in `TAILORING_SYSTEM_PROMPT`
- [x] Update all three `TAILORING_MODE_CONSTRAINTS` strings (nudge, keywords, full)
- [x] Update `IMPROVE_RESUME_PROMPT_TEMPLATE` rewriting example + format example
- [x] Bump `"tailoring_system": "v3.1"`, `"tailoring_user": "v3.1"`

### `apps/backend/tests/service/test_improver.py`
- [x] Update `_llm_resume_output()` helper to emit compact format (`summary` only; added `_llm_compact_output` for richer diffs)
- [x] Update any test that asserts on `changes[]` in mock output
- [x] Updated prompt contract assertions to match new output_keys / bullet_counts shape

### `apps/backend/tests/unit/` — new test file
- [x] `test_compact_diff.py` — unit tests for `apply_compact_diff` and helpers (23 tests)

---

## Acceptance Criteria

- [x] LLM response contains no `id`, `company`, `location`, `dates`, `role`, `github`, `website`, `customSections`, `changes[]`, `workExperience`, `personalProjects`
- [x] Skill groups in output: `label` + `values` only, no `id`
- [x] `apply_compact_diff` correctly handles: overwrite, partial entry, absent entry (original preserved), out-of-range index (skip+warn), out-of-range bullet (skip+warn), invented skill (strip), absent skills (original preserved)
- [x] Summary in output is one sentence
- [x] Bullet index ≥ original count → skipped, warning logged, no crash
- [x] Empty/blank bullet text → skipped, warning logged, original preserved
- [x] `skills` key absent → original skills passed through unchanged
- [x] `"changes"`, `"workExperience"`, `"personalProjects"` in LLM response → silently ignored via `extra="ignore"`
- [x] Location from JD written to `personalInfo.location` (existing pipeline, regression test passing)
- [x] All existing `test_improver.py` tests pass with updated mock shapes
- [x] `nudge` and `keywords` mode constraints do not mention deletion or new bullets
- [x] Prompt versions bumped to `v3.1`
- [x] 184 tests passing (2 pre-existing unrelated failures excluded)
