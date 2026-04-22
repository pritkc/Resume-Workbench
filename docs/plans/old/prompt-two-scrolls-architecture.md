# Prompt architecture: two scrolls per step (final)

This document is the **reference shape** for simplifying prompts: one logical file per pipeline step, **two sections** (system + user), optional **single-file overrides** with the same shape.

---

## 1. Principles

| # | Rule |
|---|------|
| 1 | **System** = one blob: short identity + non‑negotiable contract. Keep it **small** for multi‑provider friendliness. |
| 2 | **User** = **everything else**: task wording, schemas, examples, and **injected** variable payloads (JD text, resume JSON, contracts, …). |
| 3 | **Overrides** = **one file per step**, same structure as shipped prompts (not split `instructions.txt` / `rules.txt`). |
| 4 | **Two scrolls per step** = two strings at runtime; editors may show **two panes** or one file with a clear split. |

**Runtime mapping (conceptual):**  
`load_step(step_name) → (system_string, user_template_string)` → `user = substitute(user_template, variables)` → send `(system, user)` to the chat API.

---

## 2. On-disk format: human `.md` vs robust `.py` / structured

| Format | Strengths | Risks to mitigate |
|--------|-----------|-------------------|
| **Markdown + `<<<SYSTEM>>>` / `<<<USER>>>`** | Easy read/copy/paste; works in GitHub. | Delimiter **collision** if pasted text contains the same line; **no** schema validation until CI. |
| **Python module** (`SYSTEM = """..."""`, `USER = """..."""`) | **No** delimiter parsing; syntax highlighted; import-time string validity; can pair with `STEP_NAME`, `VARIABLES`. | Less friendly for non-dev copy/paste (still fine for repo “source of truth”). |
| **TOML / YAML** (`system = """..."""` or `\|`) | Single file, **explicit keys**, parsers avoid “split by magic line” bugs; multiline blocks standard. | Editors must preserve indentation; need a schema or tests for required keys. |

**Recommendation for implementation**

1. **Shipped prompts:** Prefer **`*.prompt.py`** (or **`*.prompt.yaml`**) as the **canonical** source: two named constants or keys, **no** line-based delimiter parsing in production.
2. **Optional export:** Generate **`.prompt.md`** from the same source for docs (or let Prompt Manager read the structured file).
3. **Overrides:** Same extension and schema as shipped (`extract_jd_intel.prompt.py` in `prompt_overrides/`), or **one** override path that mirrors shipped.

If Markdown-with-delimiters is kept for **human-only** editing, **CI must** parse and validate; never rely on ad-hoc splitting without tests.

---

## 3. Placeholder strategy (avoid brace / syntax mismatch)

**Problem:** Python `str.format()` treats `{` and `}` specially. Any JSON schema in the user template must use **`{{` / `}}`** for literal braces. One mistake → `KeyError`, wrong output, or **silent** wrong JSON for the model.

**Robust options (pick one in implementation; document it):**

| Approach | Mechanism | Brace conflict? |
|----------|-----------|-----------------|
| **A. `string.Template`** | Placeholders like `$job_description` (identifier rules apply). | **No** — JSON uses `{` freely. |
| **B. Explicit markers** | Replace `<<JOB_DESCRIPTION>>`, `<<ORIGINAL_RESUME>>` after load. | **No** — choose markers that cannot appear in UTF‑8 JSON if needed (e.g. `<<VAR:job_description>>`). |
| **C. `str.format`** | Only if every literal `{` / `}` in USER is doubled. | **Yes** — high error rate; **must** be covered by unit tests with real templates. |

**Spec:** The step registry lists **allowed placeholder names**; at load time, **fail fast** if the template references an unknown name or if substitution leaves unreplaced tokens.

---

## 4. Delimiter-based Markdown (if used)

Use **line-anchored** markers only as a **human** interchange format; normalize to structured storage on save if possible.

```text
<<<SYSTEM>>>
... verbatim system blob ...

<<<USER>>>
... user template with placeholders per §3 ...
```

**Parsing rules**

- Require **exactly one** `<<<USER>>>`; **optional** leading `<<<SYSTEM>>>` (if missing, system may default to a one-line constant in code).
- **Collision:** If content might include the marker lines, **forbid** those substrings in USER except as section headers, or switch to **YAML/Python** for that step.

**Invalid:** Unclosed sections, zero USER body, or placeholder names not in registry → **raise at startup** (or first request) in strict mode.

---

## 5. Step registry (per step metadata)

| Field | Purpose |
|-------|---------|
| `step_name` | e.g. `extract_jd_intel`, `tailor_resume_full` |
| `variables` | Ordered or named set of injectable fields (for validation + UI chips) |
| `path` | Path to shipped prompt module or file |

---

## 6. Demo: JD extraction (`extract_jd_intel`)

**Variables:** `job_description` (and only that, in this demo).

### 6.1 Robust shape: Python source (`extract_jd_intel.prompt.py` — illustrative)

Placeholders use **`$job_description`** style to avoid JSON brace escaping mistakes:

```python
# Canonical strings; VARIABLES drives validation.
VARIABLES = ("job_description",)

SYSTEM = """\
You are a job description analyst. Extract structured intelligence for resume tailoring.
Respond with a single JSON object only — no markdown fences, no commentary.
"""

USER = """\
Analyze this job description and extract comprehensive intelligence for resume tailoring.

Output JSON matching this schema (illustrative; null / [] where appropriate):

{
  "role": {
    "title": "string",
    "seniority": "string",
    "function": "string",
    "scope": "string"
  },
  "company": {
    "name": "string or null",
    "team": "string or null",
    "domain": "string",
    "product_context": "string",
    "scale_signals": ["string"]
  },
  "location": "string",
  "technical_requirements": {
    "primary_stack": ["string"],
    "secondary_stack": ["string"],
    "infrastructure": ["string"],
    "paradigms": ["string"]
  },
  "requirements": {
    "years": 0,
    "must_have": ["string"],
    "preferred": ["string"],
    "education": "string or null"
  },
  "responsibility_themes": ["string"],
  "ats_keywords": ["string"],
  "bold_keywords": ["string"],
  "calibration": {
    "seniority_expectations": "string",
    "team_context": "string"
  }
}

Field rules:
- role.title: strip company name, location, employment type, and noise.
- location: only `City, ST` when explicitly present; else empty string (not Remote/Hybrid as city).
- responsibility_themes: themes for resume writing, not raw JD bullet copies.
- ats_keywords: thorough; include common abbreviations where relevant.

Job description:
$job_description
"""

# Substitution: string.Template(USER).substitute(job_description=jd_text)
# or: USER.replace("$job_description", jd_text) after validating jd_text does not contain "$job_description" as accidental delimiter — prefer Template.
```

### 6.2 Same content as Markdown delimiters (human interchange only)

If this file is **parsed** by delimiter, the **JSON block uses real `{` `}`** — then **do not** pass this string through `str.format`; use **Template** or **marker** substitution for `job_description` only.

```markdown
<<<SYSTEM>>>
You are a job description analyst...
<<<USER>>>
... schema JSON with single braces as in §6.1 ...

Job description:
<<JOB_DESCRIPTION>>
```

---

## 7. Demo: full resume tailor (`tailor_resume_full`)

**Variables:** `mode_id`, `job_intelligence`, `original_resume`, `response_contract`, `output_language`

### 7.1 Python-style (`$` placeholders)

```python
VARIABLES = (
    "mode_id",
    "job_intelligence",
    "original_resume",
    "response_contract",
    "output_language",
)

SYSTEM = """\
You are an expert resume writer and ATS-aware editor.
You rewrite resume content to align with the job while staying truthful to the master resume.
Follow the response contract exactly; output only valid JSON as required by that contract.
"""

USER = """\
Tailor this resume for the target role.

MODE: $mode_id

REWRITING EXAMPLE:
Original: "Worked on backend systems"
JD needs: Kubernetes, CI/CD, microservices
Rewritten: "Built and maintained backend microservices deployed on Kubernetes with automated CI/CD pipelines, reducing deployment time from 2 hours to 15 minutes"

JOB INTELLIGENCE (from prior extraction step):
$job_intelligence

MASTER RESUME (structured input):
$original_resume

RESPONSE CONTRACT (allowed output shape — obey strictly):
$response_contract

Output language for human-readable fields: $output_language
"""
```

Use `string.Template.substitute` with a **mapping**; ensure values are **strings** (JSON-serialize dicts before inject if needed).

---

## 8. Overrides

- **One file** per step, **same** variable set and structure as shipped.
- Reset = delete override file or clear storage so shipped prompt loads again.
- **Do not** commit deployment-specific overrides that contain secrets; use **`.gitignore`** on `prompt_overrides/` if operators store sensitive tone rules locally, or store overrides outside the repo.

---

## 9. Security & leakage (operational)

| Risk | Mitigation |
|------|------------|
| **Secrets in prompts** | Never put API keys in prompt files; overrides are still plain text on disk. |
| **Prompt injection** | User-supplied JD/resume text is **data**, not system policy; keep **SYSTEM** fixed and small; inject untrusted text only into **USER** (or clearly labeled blocks). |
| **Accidental commit** | Document whether `prompt_overrides/` is gitignored for local experiments. |
| **Log leakage** | Logging full prompts in production should be **opt-in** or redact; document in ops runbook. |

---

## 10. Validation (required for robustness)

- **Unit tests:** For each step, substitute with **dummy** values of realistic size; assert no unreplaced `$` or `<<...>>` tokens remain (depending on chosen strategy).
- **CI:** Import/load every shipped prompt file; **fail** on missing keys, bad encoding, or unknown placeholders.
- **Optional:** JSON-schema for TOML/YAML wrapper if using structured config files.

---

## 11. Prompt Manager UI (target)

- Two editors: **System**, **User** (strings round-tripped from the canonical format).
- Variable chips from registry.
- Reset to default = remove override.

---

## 12. Exceptions

| Topic | Guidance |
|-------|----------|
| **Critique / rewrite** | Duplicate schema in two steps: document sync, or one shared imported constant in Python. |
| **Lite / full** | One template + `$mode_id` or separate step files — product choice. |

---

## 13. Summary

- **Two strings** per step: **system** (small), **user** (everything else + data).
- **Canonical storage:** Prefer **Python** (or YAML/TOML) to avoid delimiter and **`str.format`/`{}`** hazards; Markdown delimiters only with strict parsing/tests.
- **Placeholders:** Prefer **`$name`** or **`<<NAME>>`** over `.format` when JSON appears in USER.
- **Overrides:** Same shape, one file; validate and protect from secret leakage.
- Migration from current multi-file Python modules is a separate implementation phase.
