# Phase 3.7.4 — Feature Overview (Revised)

Revised after your 6 questions. This sits on top of the 3.7.3 technical foundation.

---

## Your Questions, Answered

### Q1: Isolate lite from full completely

**Answer:** Lite gets its own prompt file. Not a `mode` flag on `tailor_resume.py`.

```
prompts/
├── tailor_resume_full.py     ← full mode only
├── tailor_resume_lite.py     ← lite mode only, completely separate
├── critique_resume.py        ← full only (lite never touches this)
├── rewrite_resume.py         ← full only (lite never touches this)
```

Full pipeline: `extract → tailor_full → critique → rewrite → diff → cover_letter → answer_questions`  
Lite pipeline: `extract → tailor_lite → diff`

No shared code between them, except shared rules (see Q2).

---

### Q2: Modular rules for resume output — change once, applies everywhere

**Answer:** Shared rules live in a `_rules/` subfolder. Any prompt file that outputs (or consumes) a resume diff imports from there.

```
prompts/
├── _rules/
│   ├── resume_diff_output.py     ← "output JSON with keys: summary, experience..."
│   ├── jd_intelligence_output.py ← "output JSON with keys: core_title, keywords..."
│   └── critique_output.py        ← "output JSON with keys: red_flags, missed_keywords..."
├── tailor_resume_full.py         ← imports _rules.resume_diff_output
├── tailor_resume_lite.py         ← imports _rules.resume_diff_output (same rules!)
├── rewrite_resume.py             ← imports _rules.resume_diff_output (same rules!)
├── extract_jd_intel.py           ← imports _rules.jd_intelligence_output
├── critique_resume.py            ← imports _rules.critique_output
```

```python
# prompts/_rules/resume_diff_output.py  (THE single source of truth)

RESUME_DIFF_OUTPUT_RULES = """
OUTPUT FORMAT:
- Valid JSON only — no markdown, no commentary
- Keys: "summary", "experience", "projects", "skills", "bold_keywords"
- summary: one sentence...
- experience: object keyed by 0-based index...
- Do NOT emit: id, company, location, dates, github, website
"""
```

```python
# prompts/tailor_resume_full.py
from prompts._rules.resume_diff_output import RESUME_DIFF_OUTPUT_RULES

RULES = RESUME_DIFF_OUTPUT_RULES  # ← change once in _rules/, applies here automatically
```

```python
# prompts/tailor_resume_lite.py
from prompts._rules.resume_diff_output import RESUME_DIFF_OUTPUT_RULES

RULES = RESUME_DIFF_OUTPUT_RULES  # ← same rules, different instructions
```

**You edit `_rules/resume_diff_output.py` once → full, lite, and rewrite all get the update.**

The catalog UI shows a "Shared Rules" section at the top with a note: *"These rules are referenced by multiple steps. Editing here updates all of them."*

---

### Q3: How the chain works + how the UI shows it

**The chain problem:** Each step's output is the next step's input. If you change `critique_resume`'s output rules, `rewrite_resume` (which reads the critique) might break.

**Solution: Every step declares its inputs and outputs.**

```python
# prompts/critique_resume.py

STEP_NAME = "critique_resume"
RECEIVES_FROM = ["tailor_resume_full"]  # who feeds me
FEEDS_INTO = ["rewrite_resume"]         # who consumes my output
RULES = CRITIQUE_OUTPUT_RULES           # what I output (from _rules/)
```

**UI: Pipeline diagram with clickable nodes**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  FULL PIPELINE                                                          │
│                                                                          │
│  [extract_jd_intel] → [tailor_full] → [critique] → [rewrite] → ⚙️ diff │
│       ↓                                                                  │
│  [cover_letter_outreach]                                                 │
│  [answer_questions]                                                      │
│                                                                          │
│  LITE PIPELINE                                                           │
│  [extract_jd_intel] → [tailor_lite] → ⚙️ diff                           │
└──────────────────────────────────────────────────────────────────────────┘
```

Click any node → expands to show instructions + rules for that step.

**Chain safety: when you edit a shared rule, the UI warns you:**

```
⚠️ This rule is used by: tailor_resume_full, tailor_resume_lite, rewrite_resume
   Changing the output schema affects all 3 steps and the diff parser.
```

**When you edit a step's instructions and add a new `{variable}`, the UI checks:**
- Is this variable available from an upstream step? ✅
- Is this variable unknown? ⚠️ "This variable doesn't exist in any upstream output"

---

### Q4: Instructions editable from the UI

**Answer:** Yes. The Prompt Manager page becomes an **editor**, not just a viewer.

How it works:
- Each step's instructions are shown in an editable text area
- You paste improved text from ChatGPT/Claude → click Save
- Saves to a `prompt_overrides/` directory (not modifying Python source files)
- At runtime: if an override exists for a step, use it; otherwise use the Python default
- A "Reset to default" button restores the original Python file content

```
┌─ Tailor Resume (Full) ──────────────────────── v6.0 ──┐
│ 📁 prompts/tailor_resume_full.py                       │
│ 🤖 Default (claude-sonnet)                              │
│ ✏️ MODIFIED (overridden — click to see original)        │
│                                                         │
│ Instructions: ──────────────────────── [Edit] [Reset]  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ You are a senior resume strategist...               │ │
│ │ Here is the resume: {resume_data}                   │ │
│ │ Here is the JD: {jd_intelligence}                   │ │
│ │ ...                                                 │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Rules: ── from _rules/resume_diff_output ── [Shared]   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ OUTPUT FORMAT:                                      │ │
│ │ - Valid JSON only...                                │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ▶ Raw prompt (instructions + rules, filled with vars)  │
└─────────────────────────────────────────────────────────┘
```

Backend:
```
prompt_overrides/
├── tailor_resume_full.instructions.txt   ← user's edited version
├── critique_resume.instructions.txt
└── (empty until user edits something)
```

```python
# Runtime resolution:
def get_instructions(step_name):
    override = load_override(step_name)  # from prompt_overrides/
    if override:
        return override
    return get_prompt(step_name).INSTRUCTIONS  # from Python source
```

---

### Q5: Variables shown globally at the top

**Answer:** A collapsible "Available Variables" panel at the top of the Prompt Manager page.

```
┌─ AVAILABLE VARIABLES ──────────────────────────── [collapse] ─┐
│                                                                 │
│ FROM JD UPLOAD:                                                 │
│   {job_description}  — raw job description text                 │
│                                                                 │
│ FROM EXTRACT_JD_INTEL:                                          │
│   {jd_intelligence}  — extracted role, keywords, themes (JSON)  │
│                                                                 │
│ FROM BASE RESUME:                                               │
│   {resume_data}      — the candidate's source resume (JSON)     │
│                                                                 │
│ FROM TAILOR OUTPUT:                                              │
│   {draft_resume}     — first-pass tailored resume diff (JSON)   │
│                                                                 │
│ FROM CRITIQUE OUTPUT:                                            │
│   {critique}         — red flags, missed keywords (JSON)        │
│                                                                 │
│ FROM SYSTEM:                                                     │
│   {output_language}  — e.g. "English", from settings            │
│   {response_contract} — computed resume shape constraints       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

When you're editing any step's instructions, you can glance at this to see what's available. Any `{variable}` you type in your instructions will be highlighted inline (blue pill style).

---

### Q6: Model picker for CLIProxy's huge list

**Problem:** CLIProxy has hundreds of models. A dropdown per step is unusable.

**Answer:** One-click pill → searchable modal.

Each step shows a small **pill badge** with the current model:

```
🤖 claude-sonnet (default)    [change]
```

Clicking **[change]** opens a **searchable modal** — the same search/filter component already used on the settings page for CLIProxy model selection:

```
┌─ Select model for: Critique Resume ──────────────────┐
│                                                       │
│ 🔍 Search models...  [________________]               │
│                                                       │
│ ○ Use default (claude-sonnet-4-20250514)                     │
│                                                       │
│ ANTHROPIC                                             │
│ ○ claude-sonnet-4-20250514                                   │
│ ○ claude-haiku-4-5-20251001                             │
│                                                       │
│ OPENAI                                                │
│ ● gpt-4o                                              │
│ ○ gpt-4o-mini                                         │
│                                                       │
│ GOOGLE                                                │
│ ○ gemini-2.5-pro                                      │
│ ○ gemini-2.5-flash                                    │
│                                                       │
│                              [Cancel] [Apply]         │
└───────────────────────────────────────────────────────┘
```

No dropdowns cluttering the page. Just a small pill per step, click to open full picker.

---

## Revised Architecture Summary

### Backend folder structure

```
prompts/
├── _rules/                        ← SHARED output schemas
│   ├── resume_diff_output.py       ← used by tailor_full, tailor_lite, rewrite
│   ├── jd_intelligence_output.py   ← used by extract_jd_intel
│   └── critique_output.py          ← used by critique_resume
│
├── parse_resume.py                ← standalone
├── extract_jd_intel.py            ← shared by both pipelines
├── tailor_resume_full.py          ← full pipeline only
├── tailor_resume_lite.py          ← lite pipeline only (isolated)
├── critique_resume.py             ← full pipeline only
├── rewrite_resume.py              ← full pipeline only
├── cover_letter_outreach.py       ← shared
├── answer_questions.py            ← shared
│
├── _schema.py                     ← JSON schema constant
├── _refinement.py                 ← AI word blacklist
├── enrichment.py                  ← untouched (out of scope)
├── __init__.py                    ← registry + get_prompt()
│
prompt_overrides/                  ← USER EDITS (not in prompts/)
├── tailor_resume_full.instructions.txt
└── (created on first edit)
```

### Pipeline definitions

```python
# services/tailoring/pipelines.py

FULL_PIPELINE = [
    "extract_jd_intel",       # LLM: JD → jd_intelligence
    "tailor_resume_full",     # LLM: resume + jd → draft_resume
    "critique_resume",        # LLM: draft → critique (red flags)
    "rewrite_resume",         # LLM: draft + critique → final_diff
    # code: apply_compact_diff()
]

LITE_PIPELINE = [
    "extract_jd_intel",       # LLM: JD → jd_intelligence
    "tailor_resume_lite",     # LLM: resume + jd → final_diff
    # code: apply_compact_diff()
]

# Cover letter + answer questions are separate (not in the tailoring pipeline)
```

### Each prompt file structure (unchanged from 3.7.3)

```python
# Every file has exactly:
STEP_NAME = "..."
STEP_LABEL = "..."
STEP_VERSION = "..."
FILE_PATH = "..."
VARIABLES = { ... }            # what {vars} this step uses
RECEIVES_FROM = [...]          # upstream dependencies (for UI chain)
FEEDS_INTO = [...]             # downstream consumers (for UI chain)
RULES = IMPORTED_SHARED_RULES  # from _rules/
INSTRUCTIONS = "..."           # the editable part (can be overridden via UI)

def build_prompt(**kwargs) -> str:
    instructions = load_override(STEP_NAME) or INSTRUCTIONS
    return (instructions + "\n\n" + RULES).format(**kwargs)
```

### Catalog/API schema updates

```typescript
// What the catalog API returns for each step
type PromptCatalogEntry = {
  step_name: string;
  label: string;
  version: string;
  file_path: string;
  pipeline: "full" | "lite" | "shared" | "standalone";
  pipeline_order: number;
  
  // Chain info
  receives_from: string[];
  feeds_into: string[];
  
  // Content
  variables: { name: string; description: string }[];
  instructions: string;          // current (override or default)
  instructions_is_override: bool; // true if user edited
  instructions_default: string;   // original from Python source
  rules: string;                  // from _rules/
  rules_source: string;           // "resume_diff_output" (shared rule name)
  raw_prompt: string;             // instructions + rules combined
  
  // Model
  model: string;                  // resolved model name
  model_is_override: boolean;
};

// Global variables (for the top panel)
type PipelineVariable = {
  name: string;
  description: string;
  source: string;  // "extract_jd_intel output" | "base resume" | "settings"
};
```

---

## Full page layout: Prompt Manager

```
┌────────────────────────────────────────────────────────────────────┐
│  PROMPT MANAGER                                                    │
│                                                                    │
│  ┌─ AVAILABLE VARIABLES ─────────────────────── [collapse] ──┐    │
│  │ {job_description} ← JD upload                              │    │
│  │ {jd_intelligence} ← extract_jd_intel output                │    │
│  │ {resume_data} ← base resume                                │    │
│  │ {draft_resume} ← tailor output                              │    │
│  │ {critique} ← critique output                                │    │
│  │ {output_language} ← settings                                │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ┌─ PIPELINE VIEW ───────────────────────────────────────────┐    │
│  │                                                            │    │
│  │  FULL: [extract] → [tailor_full] → [critique] → [rewrite] │    │
│  │  LITE: [extract] → [tailor_lite]                           │    │
│  │                                                            │    │
│  │  OTHER: [parse_resume]  [cover_letter]  [answer_questions] │    │
│  │                                                            │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ━━━ SHARED RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│                                                                    │
│  ┌─ Resume Diff Output ─── used by 3 steps ──────────────────┐    │
│  │ Valid JSON only... Keys: summary, experience...            │    │  
│  │ ⚠️ Used by: tailor_full, tailor_lite, rewrite              │    │
│  │                                     [Edit] [Reset]         │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ━━━ FULL PIPELINE STEPS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│                                                                    │
│  ┌─ Extract JD Intel ──────────── v2.1 ──────────────────────┐    │
│  │ 📁 prompts/extract_jd_intel.py                             │    │
│  │ 🤖 default (claude-sonnet)  [change]                       │    │
│  │ Rules: from _rules/jd_intelligence_output [Shared]         │    │
│  │                                                            │    │
│  │ Instructions: ──────────────────────── [Edit] [Reset]      │    │
│  │ ┌──────────────────────────────────────────────────────┐   │    │
│  │ │ You are a job description analyst...                 │   │    │
│  │ │ Analyze this JD: {job_description}                   │   │    │
│  │ └──────────────────────────────────────────────────────┘   │    │
│  │                                                            │    │
│  │ ▶ Raw prompt                                               │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ┌─ Tailor Resume (Full) ──────── v6.0 ──────────────────────┐    │
│  │ 📁 prompts/tailor_resume_full.py                           │    │
│  │ 🤖 default (claude-sonnet)  [change]                       │    │
│  │ Rules: from _rules/resume_diff_output [Shared]             │    │
│  │ ✏️ MODIFIED — instructions overridden                       │    │
│  │                                                            │    │
│  │ Instructions: ──────────────────── [Edit] [Reset to default│    │
│  │ ┌──────────────────────────────────────────────────────┐   │    │
│  │ │ You are a senior resume strategist...                │   │    │
│  │ │ Resume: {resume_data}                                │   │    │
│  │ │ JD Intel: {jd_intelligence}                          │   │    │
│  │ └──────────────────────────────────────────────────────┘   │    │
│  │                                                            │    │
│  │ ▶ Raw prompt                                               │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ... critique, rewrite cards ...                                   │
│                                                                    │
│  ━━━ LITE PIPELINE STEPS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│                                                                    │
│  ┌─ Tailor Resume (Lite) ──────── v2.0 ──────────────────────┐    │
│  │ 📁 prompts/tailor_resume_lite.py                           │    │
│  │ 🤖 default (claude-sonnet)  [change]                       │    │
│  │ Rules: from _rules/resume_diff_output [Shared]             │    │
│  │ ... completely separate from full ...                       │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ━━━ OTHER PROMPTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│  ... parse_resume, cover_letter, answer_questions cards ...        │
│                                                                    │
│  ━━━ SETTINGS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│  ☑ Enable critique + rewrite (full mode only)                      │
└────────────────────────────────────────────────────────────────────┘
```

---

## Decisions for your review

| # | Decision | What I'm doing |
|---|----------|----------------|
| 1 | **Lite isolation** | Separate file: `tailor_resume_lite.py`. No shared instructions with full. Separate section in the UI. |
| 2 | **Shared rules** | `_rules/` folder. Change `resume_diff_output.py` once → applies to full, lite, rewrite. |
| 3 | **Chain safety** | Each step declares `RECEIVES_FROM` + `FEEDS_INTO`. UI shows warnings when editing shared rules. |
| 4 | **Editable instructions** | Save to `prompt_overrides/` text files. Python source = default. UI shows "Modified" badge + "Reset to default" button. |
| 5 | **Variables panel** | Global panel at top of Prompt Manager. All available vars from every step, grouped by source. |
| 6 | **Model picker** | Small pill per step → click opens searchable modal (reuse existing CLIProxy model picker component). |
| 7 | **Pipeline view** | Visual node diagram at top. Full and Lite shown separately. Click node → scroll to that step's card. |
| 8 | **Shared rules editable?** | Yes, from the UI, with a ⚠️ warning showing affected steps. Also saves to `prompt_overrides/`. |

---

*Approve this and I'll write the full technical implementation plan (updating 3.7.3).*
