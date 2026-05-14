# LLM Calibration P0/P1/P2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all token budget, timeout, prompt input, and telemetry changes from `docs/plans/phase-3.15-5-claude-calibration-report.md`.

**Architecture:** Eight independent backend changes + one frontend change, executed in dependency order. P0 items (CL prompt restructure + cap cuts) ship first because they have the largest waste impact. P1 items (adaptive tailoring cap + timeout overrides + bold keyword fix) follow. P2 (fence telemetry + frontend cap utilization surface) last.

**Tech Stack:** Python / FastAPI backend (`app/llm.py`, `app/services/`, `app/prompts/`), Next.js frontend (`components/observability/`), pytest for tests.

---

## Chunk 1: P0 — Cover Letter Prompt Input Restructure

### Task 1: Trim TAILORED RESUME payload in cover_letter.py

The `_tailored_resume_json()` function in `cover_letter.py` currently serializes the full normalized resume including duplicated `description`/`highlights` arrays, `title` (dup of `position`), `date`/`years` (dup of `start_date`+`end_date`), `role` (dup of `techStack` in projects), `sectionMeta`, and `personalInfo` contact fields. Replace it with a clean evidence builder that keeps all entries but strips redundancy.

**Files:**
- Modify: `apps/backend/app/services/cover_letter.py`
- Modify: `apps/backend/app/services/message_profiles.py` (no code changes — just stop calling it for CL)
- Test: `apps/backend/tests/service/test_cover_letter.py`

- [ ] **Step 1: Write failing test for `_tailored_resume_evidence_json`**

Add to `tests/service/test_cover_letter.py`:

```python
from app.services.cover_letter import _tailored_resume_evidence_json

class TestTailoredResumeEvidence:
    def _make_resume(self):
        return {
            "personalInfo": {
                "name": "Jane Doe",
                "location": "Nashville, TN",
                "email": "jane@example.com",
                "phone": "+1 555 0000",
                "headline": "Data Engineer",
                "photoUrl": None,
                "socialNetworks": [],
                "profileLinks": [],
                "customConnections": [],
            },
            "summary": "Software engineer with data platform experience.",
            "workExperience": [
                {
                    "id": 1,
                    "position": "Senior Engineer",
                    "title": "Senior Engineer",
                    "company": "Acme",
                    "location": "Remote",
                    "start_date": "2024-01",
                    "end_date": "present",
                    "date": "2024-01 - present",
                    "years": "2024-01 - present",
                    "techStack": "Python, FastAPI",
                    "description": ["Python, FastAPI", "Built pipelines", "Automated audits"],
                    "highlights": ["Built pipelines", "Automated audits"],
                }
            ],
            "personalProjects": [
                {
                    "id": 1,
                    "name": "MyProject",
                    "role": "Python, Docker",
                    "techStack": "Python, Docker",
                    "date": "",
                    "years": "",
                    "github": "https://github.com/x",
                    "website": None,
                    "description": ["Built something"],
                    "highlights": ["Built something"],
                }
            ],
            "education": [
                {
                    "id": 1,
                    "institution": "SDSU",
                    "area": "Data Analytics",
                    "degree": "MS",
                    "start_date": "2023-08",
                    "end_date": "2025-05",
                }
            ],
            "skills": {"groups": [{"label": "Languages", "values": ["Python", "SQL"]}]},
            "sectionMeta": [{"id": "summary", "order": 0}],
            "customSections": {},
        }

    def test_removes_sectionmeta(self):
        result = json.loads(_tailored_resume_evidence_json(self._make_resume()))
        assert "sectionMeta" not in result

    def test_removes_description_keeps_highlights(self):
        result = json.loads(_tailored_resume_evidence_json(self._make_resume()))
        entry = result["workExperience"][0]
        assert "description" not in entry
        assert entry["highlights"] == ["Built pipelines", "Automated audits"]

    def test_removes_title_date_years_duplicates(self):
        result = json.loads(_tailored_resume_evidence_json(self._make_resume()))
        entry = result["workExperience"][0]
        assert "title" not in entry
        assert "date" not in entry
        assert "years" not in entry

    def test_removes_personal_info_contact_fields(self):
        result = json.loads(_tailored_resume_evidence_json(self._make_resume()))
        pi = result["personalInfo"]
        assert "email" not in pi
        assert "phone" not in pi
        assert "socialNetworks" not in pi
        assert "profileLinks" not in pi
        assert "customConnections" not in pi
        assert pi["name"] == "Jane Doe"
        assert pi["location"] == "Nashville, TN"

    def test_removes_project_role_date_github(self):
        result = json.loads(_tailored_resume_evidence_json(self._make_resume()))
        proj = result["personalProjects"][0]
        assert "role" not in proj
        assert "date" not in proj
        assert "years" not in proj
        assert "github" not in proj
        assert "website" not in proj
        assert "description" not in proj
        assert proj["highlights"] == ["Built something"]

    def test_keeps_all_experience_entries(self):
        resume = self._make_resume()
        resume["workExperience"].append({
            "id": 2, "position": "Intern", "title": "Intern", "company": "OldCo",
            "location": "NY", "start_date": "2022-06", "end_date": "2022-08",
            "date": "2022-06 - 2022-08", "years": "2022-06 - 2022-08",
            "techStack": "Java", "description": ["Java", "Did thing"], "highlights": ["Did thing"],
        })
        result = json.loads(_tailored_resume_evidence_json(resume))
        assert len(result["workExperience"]) == 2
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/backend && python -m pytest tests/service/test_cover_letter.py::TestTailoredResumeEvidence -x -q 2>&1 | head -20
```

Expected: ImportError or AttributeError (function doesn't exist yet).

- [ ] **Step 3: Add `_tailored_resume_evidence_json` to `cover_letter.py`**

Add directly below the existing `_tailored_resume_json` function (around line 436 in `cover_letter.py`):

```python
_PI_KEEP = {"name", "location", "title", "headline"}
_EXP_REMOVE = {"id", "title", "date", "years", "description"}
_PROJ_REMOVE = {"id", "role", "date", "years", "github", "website", "description"}


def _tailored_resume_evidence_json(resume_data: dict[str, Any]) -> str:
    """Serialize resume for cover-letter prompts: all entries, no redundant fields."""
    normalized = normalize_resume_data(copy.deepcopy(resume_data))

    def _clean_exp(entry: dict[str, Any]) -> dict[str, Any]:
        return {k: v for k, v in entry.items() if k not in _EXP_REMOVE}

    def _clean_proj(entry: dict[str, Any]) -> dict[str, Any]:
        return {k: v for k, v in entry.items() if k not in _PROJ_REMOVE}

    def _clean_pi(pi: dict[str, Any]) -> dict[str, Any]:
        return {k: v for k, v in pi.items() if k in _PI_KEEP and v}

    output: dict[str, Any] = {}
    if "personalInfo" in normalized:
        output["personalInfo"] = _clean_pi(normalized["personalInfo"])
    if "summary" in normalized:
        output["summary"] = normalized["summary"]
    if "workExperience" in normalized:
        output["workExperience"] = [_clean_exp(e) for e in normalized["workExperience"]]
    if "personalProjects" in normalized:
        output["personalProjects"] = [_clean_proj(p) for p in normalized["personalProjects"]]
    if "education" in normalized:
        output["education"] = normalized["education"]
    if "skills" in normalized:
        output["skills"] = normalized["skills"]

    return json.dumps(output, separators=(",", ":"), ensure_ascii=True)
```

- [ ] **Step 4: Run tests to confirm passing**

```bash
cd apps/backend && python -m pytest tests/service/test_cover_letter.py::TestTailoredResumeEvidence -x -q 2>&1 | tail -5
```

Expected: all 6 tests pass.

---

### Task 2: Add JD extract slice builder and rewire `_build_message_prompt_inputs`

The `_build_message_prompt_inputs` function currently produces four keys: `job_target`, `job_description`, `resume_profile`, `tailored_resume`. After this task it produces three: `job_target`, `jd_extract_slice`, `tailored_resume`. The `job_description` (raw JD text) and `resume_profile` (CANDIDATE PROFILE) are removed.

**Files:**
- Modify: `apps/backend/app/services/cover_letter.py`
- Test: `apps/backend/tests/service/test_cover_letter.py`

- [ ] **Step 1: Write failing tests for `_jd_extract_slice_json` and updated `_build_message_prompt_inputs`**

```python
from app.services.cover_letter import _jd_extract_slice_json, _build_message_prompt_inputs

class TestJdExtractSlice:
    def test_keeps_narrative_fields_only(self):
        jd_extract = {
            "role": {"title": "Data Engineer", "role_domain": "data-engineering", "scope": "Own ETL"},
            "company": {"name": "Acme", "company_context": "B2B SaaS", "team_context": "platform team",
                        "domain_context": "fintech", "product_context": "ledger", "scale_signals": []},
            "location": "Austin, TX",
            "requirements": {"years_min": 3, "must_have": ["Python"]},
            "technical_requirements": {"required_needs": ["Spark"], "resume_technical_keywords": ["dbt"]},
            "responsibility_themes": ["build pipelines", "own data quality"],
            "resume_technical_keywords": ["Python", "Spark"],
            "keyword_must_match": ["dbt"],
            "transferable_themes": ["scale systems"],
            "low_signal_terms": ["fast-paced"],
            "resume_bold_keyword_sources": ["Apache Spark"],
            "resume_domain_keywords": ["fintech"],
            "calibration": {"level_expectations": "IC owns end-to-end pipeline"},
        }
        result = json.loads(_jd_extract_slice_json(jd_extract))
        # Narrative fields present
        assert "role" in result
        assert "company" in result
        assert "responsibility_themes" in result
        assert "calibration" in result
        # ATS/keyword fields excluded
        assert "requirements" not in result
        assert "technical_requirements" not in result
        assert "resume_technical_keywords" not in result
        assert "keyword_must_match" not in result
        assert "transferable_themes" not in result
        assert "low_signal_terms" not in result
        assert "resume_bold_keyword_sources" not in result
        assert "location" not in result

    def test_handles_missing_fields_gracefully(self):
        result = json.loads(_jd_extract_slice_json({}))
        assert isinstance(result, dict)

    def test_falls_back_to_full_extract_when_no_narrative(self):
        """When all narrative fields are absent, returns empty dict not an error."""
        result = json.loads(_jd_extract_slice_json({"location": "NYC"}))
        assert isinstance(result, dict)


class TestBuildMessagePromptInputs:
    def _resume(self):
        return {
            "personalInfo": {"name": "J", "location": "TN", "email": "j@x.com"},
            "summary": "Engineer.", "workExperience": [], "personalProjects": [],
            "education": [], "skills": {"groups": []}, "sectionMeta": [],
        }

    def test_no_resume_profile_key(self):
        inputs = _build_message_prompt_inputs(
            self._resume(), "Software Engineer at Acme",
            job_keywords={"role": {"title": "SE"}, "company": {"name": "Acme"}},
        )
        assert "resume_profile" not in inputs

    def test_no_raw_job_description_key(self):
        inputs = _build_message_prompt_inputs(
            self._resume(), "Software Engineer at Acme",
            job_keywords={"role": {"title": "SE"}, "company": {"name": "Acme"}},
        )
        assert "job_description" not in inputs

    def test_has_jd_extract_slice(self):
        inputs = _build_message_prompt_inputs(
            self._resume(), "Software Engineer at Acme",
            job_keywords={"role": {"title": "SE"}, "company": {"name": "Acme"}},
        )
        assert "jd_extract_slice" in inputs
        assert isinstance(json.loads(inputs["jd_extract_slice"]), dict)

    def test_fallback_when_no_job_keywords(self):
        """When job_keywords is None, jd_extract_slice falls back to full jd_extract or raw JD."""
        inputs = _build_message_prompt_inputs(
            self._resume(), "Software Engineer at Acme", job_keywords=None
        )
        assert "jd_extract_slice" in inputs
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/backend && python -m pytest tests/service/test_cover_letter.py::TestJdExtractSlice tests/service/test_cover_letter.py::TestBuildMessagePromptInputs -x -q 2>&1 | head -15
```

- [ ] **Step 3: Add `_jd_extract_slice_json` and rewrite `_build_message_prompt_inputs`**

In `cover_letter.py`, add after `_tailored_resume_evidence_json`:

```python
_JD_EXTRACT_NARRATIVE_KEYS = {"role", "company", "responsibility_themes", "calibration"}


def _jd_extract_slice_json(job_keywords: dict[str, Any] | None) -> str:
    """Return a narrative-only slice of the JD extract for cover letter prompts."""
    if not isinstance(job_keywords, dict) or not job_keywords:
        return "{}"
    sliced = {k: v for k, v in job_keywords.items() if k in _JD_EXTRACT_NARRATIVE_KEYS}
    return json.dumps(sliced, separators=(",", ":"), ensure_ascii=True)
```

Then replace the existing `_build_message_prompt_inputs` function:

```python
def _build_message_prompt_inputs(
    resume_data: dict[str, Any],
    job_description: str,
    *,
    job_keywords: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Build prompt inputs for cover-letter and outreach generation."""
    job_target = extract_job_target_metadata(job_description, job_keywords=job_keywords)
    return {
        "job_target": json.dumps(
            {key: value for key, value in job_target.items() if value},
            separators=(",", ":"),
            ensure_ascii=True,
        ),
        "jd_extract_slice": _jd_extract_slice_json(job_keywords),
        "tailored_resume": _tailored_resume_evidence_json(resume_data),
    }
```

- [ ] **Step 4: Run tests**

```bash
cd apps/backend && python -m pytest tests/service/test_cover_letter.py::TestJdExtractSlice tests/service/test_cover_letter.py::TestBuildMessagePromptInputs -x -q 2>&1 | tail -5
```

---

### Task 3: Update prompt builder signature and user.txt template

The `build_messages()` function in `prompts/cover_letter.py` still expects `resume_profile` and `job_description`. Swap to `jd_extract_slice`. Also update the `user.txt` template.

**Files:**
- Modify: `apps/backend/app/prompts/cover_letter.py`
- Modify: `apps/backend/app/prompts/text/cover_letter/user.txt`
- Modify: `apps/backend/app/services/cover_letter.py` (the call site in `generate_cover_letter_and_outreach`)

- [ ] **Step 1: Update `user.txt`**

Replace the full content of `apps/backend/app/prompts/text/cover_letter/user.txt`:

```
Generate both outputs in one pass:
1) a cover letter
2) a short outreach message

Return plain text only using this exact wrapper:
<<COVER_LETTER>>
[cover letter body]
<<END_COVER_LETTER>>
<<OUTREACH_MESSAGE>>
[outreach message body]
<<END_OUTREACH_MESSAGE>>

JOB TARGET (JSON):
$job_target

JD INTELLIGENCE (JSON — role, company, responsibility themes, level expectations):
$jd_extract_slice

RESUME (JSON — full career evidence):
$tailored_resume

COVER LETTER:
- 150 words max, exactly 3 paragraphs
- Arc: P1 - their world; P2 - fit evidence; P3 - forward motion
- P1: anchor in one specific JD detail: product area, technical challenge, team mission, or company context. Specificity test: this sentence must be uncopiable to a letter for any other company. If it could appear in any other application, rewrite it.
- P2: connect 1-2 real facts from the resume to the P1 anchor: actual tools, outcomes, or scope. Do not lift sentences verbatim from resume bullets; restate at a narrative level. Frame the connection around their challenge, not your credential: "at X I did Y, which means I understand Z [their problem]" not "I have experience with Z."
- P3: 1-2 sentences. State what you want to happen next. Confident, neutral, no eagerness.
- The cover letter adds something not in the resume: narrative context, motivation for this company specifically, or the connective thread between your work and their challenge. It does not summarize the resume.
- No salutation line if recipient name is unknown — begin P1 directly.

OUTREACH MESSAGE:
- 60 words max, 2-3 sentences — reads like a text, not a letter
- S1: name the specific role plus one detail specific to this company or team that couldn't be auto-generated from just the job title alone. Specificity test: would this sentence make sense if sent to a different company? If yes, rewrite it.
- S2: the candidate's single strongest relevant credential as a plain fact from the resume — not a self-assessment ("Built X at Y, cutting Z" not "I have strong X skills")
- S3: one time-bounded, low-friction ask ("got 15 min this week?" not "I'd love to connect whenever works for you")
- Contractions and sentence fragments are fine
- Tone: peer colleague reaching out, not applicant applying

BANNED (applies to both outputs):
- Openers: I am writing to express, I am excited/thrilled/passionate about, I would love to, I have always been interested in, I have a strong background in
- Self-assessments: I believe I would be an excellent/great/perfect fit, I am confident that, I am highly motivated, proven track record, fast learner, I am detail-oriented, extensive experience, I think I would be a valuable addition
- Closings: I look forward to hearing from you, Please find my resume attached, I hope to hear from you soon, I eagerly await, I would love the opportunity to
- Vague asks: pick your brain, happy to share more if useful, I'd love to be considered, let me know if you're interested
- Filler: results-driven, team player, passionate professional, dedicated, dynamic, self-starter

FACTS:
- Use only information from the provided JSON and JD text
- Do not invent names, metrics, employers, dates, or credentials
- If a job_target field is an empty string, omit it rather than inventing a substitute
- If the JD/company anchor is weak or generic, keep the claim narrower instead of pretending deep company knowledge.
```

- [ ] **Step 2: Update `prompts/cover_letter.py` — swap variable names**

In `apps/backend/app/prompts/cover_letter.py`, replace the `VARIABLES` dict and `build_messages` function:

```python
VARIABLES = {
    "job_target": "Role/company JSON",
    "jd_extract_slice": "Narrative JD extract slice (role, company, responsibility_themes, calibration)",
    "tailored_resume": "Trimmed resume JSON (all entries, no redundant fields)",
}


def build_messages(
    *,
    job_target: str,
    jd_extract_slice: str,
    tailored_resume: str = "",
) -> tuple[str, str]:
    from app.prompts import load_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(
            comp["user"],
            job_target=job_target,
            jd_extract_slice=jd_extract_slice,
            tailored_resume=tailored_resume,
        )

    instructions = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    rules = load_override(STEP_NAME, "rules") or RULES
    system = instructions.strip()
    if rules.strip():
        system = system + "\n\n" + rules.strip()
    user = render_user_template(
        USER_TEMPLATE,
        job_target=job_target,
        jd_extract_slice=jd_extract_slice,
        tailored_resume=tailored_resume,
    )
    return system, user
```

- [ ] **Step 3: Update the call site in `cover_letter.py`**

In `generate_cover_letter_and_outreach`, replace the `cover_letter_build_messages(...)` call:

```python
system, user = cover_letter_build_messages(
    job_target=prompt_inputs["job_target"],
    jd_extract_slice=prompt_inputs["jd_extract_slice"],
    tailored_resume=prompt_inputs["tailored_resume"],
)
```

Also update `_build_message_metadata` to remove `candidate_profile_chars` and replace `prompt_job_description_chars` with `jd_extract_slice_chars`:

```python
def _build_message_metadata(
    *,
    job_description: str,
    prompt_inputs: dict[str, str],
    prompt_version: str,
) -> dict[str, Any]:
    return {
        "job_description_chars": len(job_description),
        "jd_extract_slice_chars": len(prompt_inputs.get("jd_extract_slice", "")),
        "tailored_resume_chars": len(prompt_inputs.get("tailored_resume", "")),
        "prompt_version": prompt_version,
    }
```

- [ ] **Step 4: Run existing cover letter tests**

```bash
cd apps/backend && python -m pytest tests/service/test_cover_letter.py -x -q 2>&1 | tail -10
```

Expected: all pass. If any test imports `resume_profile` or `job_description` from prompt inputs, update the test assertions to match the new keys.

- [ ] **Step 5: Run shipped placeholder lint**

```bash
cd apps/backend && python -m pytest tests/unit/test_shipped_prompt_placeholders.py -x -q 2>&1 | tail -10
```

Expected: pass. This test validates that every `$variable` in `.txt` files has a matching kwarg in `build_messages`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/app/services/cover_letter.py \
        apps/backend/app/prompts/cover_letter.py \
        apps/backend/app/prompts/text/cover_letter/user.txt \
        apps/backend/tests/service/test_cover_letter.py
git commit -m "feat: restructure cover letter prompt — jd extract slice replaces raw JD; trim tailored resume of duplicates; remove candidate profile"
```

---

## Chunk 2: P0 — Cap Cuts

### Task 4: Lower cover letter output cap and per-operation timeout

**Files:**
- Modify: `apps/backend/app/services/cover_letter.py`

- [ ] **Step 1: Update constants at top of `cover_letter.py`**

Find these lines:
```python
COMBINED_MESSAGE_TIMEOUT_SECONDS = 150
COMBINED_MESSAGE_MAX_TOKENS = 2600
```

Replace with:
```python
COMBINED_MESSAGE_TIMEOUT_SECONDS = 45
COMBINED_MESSAGE_MAX_TOKENS = 800
```

Find `retry_max_tokens=3200` in `generate_cover_letter_and_outreach` and change to `retry_max_tokens=1200`.

- [ ] **Step 2: Run cover letter tests**

```bash
cd apps/backend && python -m pytest tests/service/test_cover_letter.py -x -q 2>&1 | tail -5
```

Expected: pass (constants don't affect unit tests).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/app/services/cover_letter.py
git commit -m "feat: lower cover letter output cap 2600→800 initial, 3200→1200 retry; timeout 150s→45s"
```

---

### Task 5: Lower extract_jd_intel_output cap to 2,500

The `extract_jd_intelligence` function in `analysis.py` calls `complete_json` with no explicit `max_tokens`, falling through to the default of 4,096. Pass 2,500 explicitly.

**Files:**
- Modify: `apps/backend/app/services/tailoring/analysis.py`

- [ ] **Step 1: Add `max_tokens=2500` to the `complete_json` call**

In `apps/backend/app/services/tailoring/analysis.py`, find:

```python
    result = await complete_json(
        prompt=prompt,
        system_prompt=system_prompt,
        config=get_step_llm_config("extract_jd_intel"),
        operation=LLM_OPERATION_EXTRACT_JD_INTEL_OUTPUT,
        metadata={
```

Add `max_tokens=2500,` after `config=...`:

```python
    result = await complete_json(
        prompt=prompt,
        system_prompt=system_prompt,
        config=get_step_llm_config("extract_jd_intel"),
        max_tokens=2500,
        operation=LLM_OPERATION_EXTRACT_JD_INTEL_OUTPUT,
        metadata={
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/app/services/tailoring/analysis.py
git commit -m "feat: lower extract_jd_intel_output cap 4096→2500 tokens"
```

---

## Chunk 3: P1 — Adaptive Cap + Timeout Overrides

### Task 6: Add `compute_adaptive_max_tokens` to contracts.py

**Files:**
- Modify: `apps/backend/app/services/tailoring/contracts.py`
- Test: `apps/backend/tests/unit/test_prompt_contracts.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/unit/test_prompt_contracts.py`:

```python
from app.services.tailoring.contracts import compute_adaptive_max_tokens


class TestAdaptiveMaxTokens:
    def _make_contract(self, exp_bullets, proj_bullets, skill_values, mode="full"):
        """Build a minimal contract from raw counts."""
        from app.services.tailoring.models import TailoringResponseContract
        n_exp = len(exp_bullets)
        n_proj = len(proj_bullets)
        n_skill_groups = len(skill_values)
        return TailoringResponseContract(
            prompt_mode=mode,
            experience_entries=[f"Co{i}" for i in range(n_exp)],
            experience_bullet_counts=exp_bullets,
            direct_jd_bullet_budget=[1] * n_exp,
            preserve_story_min=[1] * n_exp,
            project_entries=[f"P{i}" for i in range(n_proj)],
            project_bullet_counts=proj_bullets,
            skill_group_ids=[f"g{i}" for i in range(n_skill_groups)],
            skill_group_value_counts=skill_values,
        )

    def test_full_mode_floor_is_6000(self):
        # Tiny resume → hits floor
        contract = self._make_contract([1], [1], [2], mode="full")
        cap = compute_adaptive_max_tokens(contract, mode="full")
        assert cap == 6000

    def test_lite_mode_floor_is_4096(self):
        contract = self._make_contract([1], [1], [2], mode="lite")
        cap = compute_adaptive_max_tokens(contract, mode="lite")
        assert cap == 4096

    def test_test_run_contract_within_8000(self):
        # Mirrors test run: 13 exp bullets (4 entries), 3 proj bullets, 29 skill values
        contract = self._make_contract(
            [5, 2, 3, 3], [1, 1, 1], [4, 6, 4, 8, 7], mode="full"
        )
        cap = compute_adaptive_max_tokens(contract, mode="full")
        assert 6000 <= cap <= 8000

    def test_very_large_resume_capped_at_8000(self):
        # 7 entries × 5 bullets + 6 projects × 3 bullets + 50 skill values
        contract = self._make_contract(
            [5, 5, 5, 5, 5, 5, 5], [3, 3, 3, 3, 3, 3], [10, 10, 10, 10, 10], mode="full"
        )
        cap = compute_adaptive_max_tokens(contract, mode="full")
        assert cap == 8000
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/backend && python -m pytest tests/unit/test_prompt_contracts.py::TestAdaptiveMaxTokens -x -q 2>&1 | head -10
```

Expected: ImportError (function doesn't exist).

- [ ] **Step 3: Add `compute_adaptive_max_tokens` to `contracts.py`**

Add at the bottom of `apps/backend/app/services/tailoring/contracts.py`, before the last blank line:

```python
def compute_adaptive_max_tokens(
    contract: TailoringResponseContract,
    *,
    mode: str,
) -> int:
    """Compute an output token cap from the response contract grid.

    Empirical baseline (test run 0a7bf7b4): 34 tokens/cell minified, 1.25× pretty-print
    overhead (model ignores minify instruction), 1.40× safety headroom.
    Floor: 6,000 (full) / 4,096 (lite). Ceiling: 8,000.
    """
    exp_bullets = sum(contract.experience_bullet_counts)
    proj_bullets = sum(contract.project_bullet_counts)
    skill_values = sum(contract.skill_group_value_counts)
    scalar_cells = (
        len(contract.experience_bullet_counts) * 2  # position + tech_stacks per entry
        + len(contract.project_bullet_counts) * 2   # name + tech_stacks per project
        + len(contract.skill_group_value_counts)     # label per group
        + 2                                          # summary + bold_keywords
    )
    total_cells = exp_bullets + proj_bullets + skill_values + scalar_cells
    estimated_minified = total_cells * 34
    estimated_pretty = int(estimated_minified * 1.25)
    with_headroom = int(estimated_pretty * 1.40)
    floor = 6_000 if mode == "full" else 4_096
    ceiling = 8_000
    return max(floor, min(ceiling, with_headroom))
```

- [ ] **Step 4: Run tests**

```bash
cd apps/backend && python -m pytest tests/unit/test_prompt_contracts.py -x -q 2>&1 | tail -5
```

Expected: all pass.

---

### Task 7: Add `timeout_seconds` override to `llm.py` and wire per-op timeouts

**Files:**
- Modify: `apps/backend/app/llm.py`

No new tests needed — the timeout parameter is pass-through to the router kwargs and the existing test suite doesn't mock timeouts at this granularity.

- [ ] **Step 1: Add `timeout_seconds` to `complete()`**

In `complete()` signature (around line 1177), add `timeout_seconds: int | None = None`:

```python
async def complete(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.7,
    retries: int = 1,
    operation: str = "text_completion",
    metadata: dict[str, Any] | None = None,
    retry_hint: str | None = None,
    retry_max_tokens: int | None = None,
    timeout_seconds: int | None = None,
) -> str:
```

Then replace the `"timeout"` line inside `complete()`:

```python
"timeout": timeout_seconds or _calculate_timeout(
    "completion",
    current_max_tokens,
    config.provider,
),
```

- [ ] **Step 2: Add `timeout_seconds` to `complete_json()`**

In `complete_json()` signature (around line 1554), add `timeout_seconds: int | None = None`:

```python
async def complete_json(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    max_tokens: int = 4096,
    retries: int = 2,
    operation: str = "json_completion",
    metadata: dict[str, Any] | None = None,
    retry_hint: str | None = None,
    timeout_seconds: int | None = None,
) -> dict[str, Any]:
```

Then replace the `"timeout"` line inside `complete_json()`:

```python
"timeout": timeout_seconds or _calculate_timeout("json", max_tokens, config.provider),
```

- [ ] **Step 3: Run existing LLM tests**

```bash
cd apps/backend && python -m pytest tests/unit/test_llm_text_completion.py -x -q 2>&1 | tail -5
```

Expected: pass (new param is optional with `None` default).

---

### Task 8: Wire adaptive cap and per-op timeouts into orchestration + llm_calls

**Files:**
- Modify: `apps/backend/app/services/tailoring/llm_calls.py`
- Modify: `apps/backend/app/services/tailoring/orchestration.py`
- Modify: `apps/backend/app/services/tailoring/analysis.py`

- [ ] **Step 1: Update `run_primary_tailoring` in `llm_calls.py`**

Replace the entire file content:

```python
"""LLM call helpers for the tailoring pipeline."""

from __future__ import annotations

from typing import Any

from app.config import get_step_llm_config
from app.llm import complete_json
from app.prompts import PROMPT_VERSIONS
from app.services.tailoring.prompting import TailoringPromptContext

_TAILOR_TIMEOUT_SECONDS = 170
_CRITIQUE_TIMEOUT_SECONDS = 90


def tailor_step_name(prompt_id: str) -> str:
    return "tailor_resume_full" if prompt_id == "full" else "tailor_resume_lite"


async def run_primary_tailoring(
    prompt_context: TailoringPromptContext,
    job_description: str,
    *,
    max_tokens: int = 9000,
) -> dict[str, Any]:
    return await complete_json(
        prompt=prompt_context.user_prompt,
        system_prompt=prompt_context.system_prompt,
        config=get_step_llm_config(tailor_step_name(prompt_context.prompt_id)),
        max_tokens=max_tokens,
        retries=1,
        operation="resume_generate_full",
        timeout_seconds=_TAILOR_TIMEOUT_SECONDS,
        metadata={
            "prompt_id": prompt_context.prompt_id,
            "prompt_version": PROMPT_VERSIONS.get("tailoring_user", "unknown"),
            "prompt_hash": prompt_context.prompt_hash,
            "job_description_chars": len(job_description),
            "structured_resume_input": prompt_context.used_structured_resume_input,
        },
        retry_hint=prompt_context.retry_hint,
    )
```

- [ ] **Step 2: Wire adaptive cap in `orchestration.py`**

Import `compute_adaptive_max_tokens` at the top of `orchestration.py`:

```python
from app.services.tailoring.contracts import build_response_contract, compute_adaptive_max_tokens
```

In `generate_tailored_resume`, after `response_contract = build_response_contract(...)` and before the `run_primary_tailoring` call, add:

```python
    adaptive_max_tokens = compute_adaptive_max_tokens(
        response_contract,
        mode=resolved_prompt_id,
    )
```

Then update the `run_primary_tailoring` call to pass it:

```python
    result = await run_primary_tailoring(
        prompt_context,
        job_description=job_description,
        max_tokens=adaptive_max_tokens,
    )
```

Also update the `rewrite_resume` `complete_json` call to use adaptive cap + timeout:

```python
        result = await complete_json(
            prompt=r_user,
            system_prompt=r_sys,
            config=get_step_llm_config("rewrite_resume"),
            max_tokens=adaptive_max_tokens,
            retries=1,
            operation="rewrite_resume",
            timeout_seconds=170,
            metadata={
                "prompt_version": PROMPT_VERSIONS.get("rewrite_resume", "unknown"),
                "prompt_id": prompt_context.prompt_id,
                "computed_max_tokens": adaptive_max_tokens,
            },
            retry_hint=prompt_context.retry_hint,
        )
```

And the `critique_resume` call to use a timeout:

```python
        critique_raw = await complete_json(
            prompt=c_user,
            system_prompt=c_sys,
            config=get_step_llm_config("critique_resume"),
            max_tokens=4096,
            retries=1,
            operation="critique_resume",
            timeout_seconds=90,
            metadata={
                "prompt_version": PROMPT_VERSIONS.get("critique_resume", "unknown"),
            },
        )
```

Store `adaptive_max_tokens` in the `run_primary_tailoring` metadata by also updating the metadata dict in `llm_calls.py`:

```python
        metadata={
            ...
            "computed_max_tokens": max_tokens,
            "exp_bullet_count": sum(prompt_context ...),  # not easily available here
        },
```

Actually, it's cleaner to pass `computed_max_tokens` as part of the metadata dict from `orchestration.py`. Add it to the `run_primary_tailoring` call metadata by updating `llm_calls.py` to accept optional extra metadata, or simply put `computed_max_tokens` in the `rewrite_resume` metadata and include it in the primary tailoring metadata from orchestration. Since `llm_calls.py`'s metadata dict is constructed inside `run_primary_tailoring`, the simplest approach is to pass `max_tokens` (which is already in the record as `max_tokens` field) — that's already stored in the LLM call record. The `computed_max_tokens` will equal `max_tokens` in the record. No extra plumbing needed.

- [ ] **Step 3: Add timeout to extract_jd_intel call in `analysis.py`**

```python
    result = await complete_json(
        prompt=prompt,
        system_prompt=system_prompt,
        config=get_step_llm_config("extract_jd_intel"),
        max_tokens=2500,
        operation=LLM_OPERATION_EXTRACT_JD_INTEL_OUTPUT,
        timeout_seconds=90,
        metadata={...},
    )
```

- [ ] **Step 4: Run tailoring-related tests**

```bash
cd apps/backend && python -m pytest tests/unit/test_prompt_contracts.py tests/service/test_improver.py -x -q 2>&1 | tail -10
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/services/tailoring/llm_calls.py \
        apps/backend/app/services/tailoring/orchestration.py \
        apps/backend/app/services/tailoring/contracts.py \
        apps/backend/app/services/tailoring/analysis.py \
        apps/backend/app/llm.py \
        apps/backend/tests/unit/test_prompt_contracts.py
git commit -m "feat: adaptive tailoring cap (6k-8k) from contract grid; per-operation timeout overrides; extract_jd_intel cap 2500"
```

---

## Chunk 4: P1 — Bold Keyword Fix + P2 — Fence Telemetry + Frontend

### Task 9: Add methodology-label exclusion line to `resume_diff_output.txt`

**Files:**
- Modify: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt`
- Test: `apps/backend/tests/unit/test_prompt_lint.py` (verify the file still loads cleanly)

- [ ] **Step 1: Edit `resume_diff_output.txt`**

Find line 54:
```
- Examples of low-signal bold terms to exclude: Data Analysis, Process Mapping, Workflow Visualization, Process Optimization.
```

Replace with:
```
- Examples of low-signal bold terms to exclude: Data Analysis, Process Mapping, Workflow Visualization, Process Optimization.
- Also exclude: methodology and process labels (SDLC, Agile, Scrum, CI/CD pipeline, test automation), generic infrastructure categories (Relational Databases, Cloud Storage, Distributed Systems, Message Queue), and competency phrases (Test Case Design, Project Management, Stakeholder Communication, Defect Tracking). When the JD names no high-signal tools, draw bold_keywords only from tools, languages, and platforms present in the resume evidence.
```

- [ ] **Step 2: Run prompt lint test**

```bash
cd apps/backend && python -m pytest tests/unit/test_prompt_lint.py tests/unit/test_text_prompts.py -x -q 2>&1 | tail -5
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt
git commit -m "feat: add methodology label exclusion rule to bold_keywords in resume_diff_output.txt"
```

---

### Task 10: Add fence telemetry to `complete_json` in `llm.py`

**Files:**
- Modify: `apps/backend/app/llm.py`

- [ ] **Step 1: Add fence telemetry computation inside `complete_json`**

Inside `complete_json`, in the success path — after `result = json.loads(json_str)` and before the truncation check — add:

```python
            # P2: Fence telemetry — measure formatting overhead for calibration
            _raw_chars = len(content)
            _had_fence = content.lstrip().startswith("```")
            try:
                _minified_chars = len(json.dumps(result, separators=(",", ":")))
            except Exception:
                _minified_chars = None
            _fence_meta: dict[str, Any] = {
                "response_had_fence": _had_fence,
                "raw_response_chars": _raw_chars,
            }
            if _minified_chars is not None:
                _fence_meta["minified_chars"] = _minified_chars
                _fence_meta["formatting_overhead_chars"] = _raw_chars - _minified_chars
```

Then merge `_fence_meta` into `metadata` before passing to `_record_llm_attempt` on the **success** path:

```python
            _trace_metadata = {**(metadata or {}), **_fence_meta}
            _record_llm_attempt(
                ...
                extra_context=_trace_metadata,
            )
            return result
```

Do NOT add `_fence_meta` to the error path calls — those don't have a successfully parsed result.

- [ ] **Step 2: Run tests**

```bash
cd apps/backend && python -m pytest tests/unit/test_llm_text_completion.py -x -q 2>&1 | tail -5
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/app/llm.py
git commit -m "feat: add response_had_fence + formatting_overhead_chars telemetry to complete_json traces"
```

---

### Task 11: Surface cap utilization in llm-trace-call-card (frontend)

Show a compact "cap used" stat (output tokens / max_tokens) alongside the existing token display. Add a `⚠ FENCE` badge when `response_had_fence` is true in `request_context`.

**Files:**
- Modify: `apps/frontend/components/observability/llm-trace-call-card.tsx`
- Modify: `apps/frontend/lib/observability/llm-trace-helpers.ts` (add `getCapUtilization` helper)

- [ ] **Step 1: Add `getCapUtilization` to helpers**

In `apps/frontend/lib/observability/llm-trace-helpers.ts`, add:

```typescript
export function getCapUtilization(call: LLMCallRecord): number | null {
  const output = getOutputTokens(call);
  const cap = call.max_tokens;
  if (!cap || !output) return null;
  return Math.round((output / cap) * 100);
}
```

- [ ] **Step 2: Update `llm-trace-call-card.tsx` — add cap utilization and fence badge**

In the tokens stat tile (inside the `grid gap-2` div), replace the existing tokens block:

```tsx
<div className="rounded-md border border-slate-200 bg-slate-50/80 p-2.5">
  <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Tokens</p>
  <p className="mt-0.5 font-mono font-semibold text-slate-900">
    {formatCount(getInputTokens(call) + getOutputTokens(call))}
  </p>
  <p className="mt-0.5 font-mono text-[10px] text-slate-500">
    {formatCount(getInputTokens(call))} in / {formatCount(getOutputTokens(call))} out
  </p>
  {(() => {
    const util = getCapUtilization(call);
    return util !== null ? (
      <p className={`mt-0.5 font-mono text-[10px] font-semibold ${
        util >= 85 ? 'text-red-700' : util >= 50 ? 'text-amber-700' : 'text-emerald-700'
      }`}>
        {util}% of cap
      </p>
    ) : null;
  })()}
</div>
```

Add a fence badge next to the operation name — inside the `flex flex-wrap items-center gap-2` div, after the `json_mode` badge:

```tsx
{call.request_context?.response_had_fence === true ? (
  <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-[11px] uppercase text-amber-800">
    fence
  </span>
) : null}
```

Add the import for `getCapUtilization` at the top of the file:

```typescript
import {
  ...
  getCapUtilization,
} from '@/lib/observability/llm-trace-helpers';
```

- [ ] **Step 3: Lint check**

```bash
cd apps/frontend && npm run lint 2>&1 | tail -10
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/components/observability/llm-trace-call-card.tsx \
        apps/frontend/lib/observability/llm-trace-helpers.ts
git commit -m "feat: show cap utilization % and fence badge in llm-trace-call-card"
```

---

## Final Verification

- [ ] **Run full backend test suite**

```bash
cd apps/backend && python -m pytest tests/ -x -q --tb=short 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Start dev server and spot-check llm-traces UI**

```bash
npm run dev
```

Open `http://localhost:3000/llm-traces`. Verify:
- Existing trace cards render without error
- Cap utilization `%` appears when `max_tokens` and output tokens are both present
- No console errors

- [ ] **Final commit if any cleanup needed**

```bash
git add -p  # stage only intentional changes
git commit -m "chore: post-calibration cleanup"
```
