# Phase 3.7.5 — Prompt Pipeline Technical Implementation Plan

**Author:** Claude Opus 4.5
**Status:** APPROVED — Ready for implementation
**Scope:** Backend prompt refactor, critique pipeline, per-step model override, prompt manager UI

---

## Table of Contents

1. [What You Actually Get](#1-what-you-actually-get)
2. [The Three-Part Prompt Structure](#2-the-three-part-prompt-structure)
3. [File Layout](#3-file-layout)
4. [Prompt File Template](#4-prompt-file-template)
5. [Shared Rules](#5-shared-rules)
6. [Pipeline Definitions](#6-pipeline-definitions)
7. [Override System](#7-override-system)
8. [Per-Step Model Selection](#8-per-step-model-selection)
9. [Critique Pipeline](#9-critique-pipeline)
10. [Backend Implementation](#10-backend-implementation)
11. [Frontend — Prompt Manager UI](#11-frontend--prompt-manager-ui)
12. [API Contracts](#12-api-contracts)
13. [Migration Guide](#13-migration-guide)
14. [Testing](#14-testing)
15. [Implementation Checklist](#15-implementation-checklist)

---

## 1. What You Actually Get

### The Problem You Had

```
templates.py (459 lines)
├── 30+ string constants mixed together
├── TAILORING_CONTRACT_BLOCK + TAILORING_CRAFT_BLOCK + TAILORING_MODE_STRATEGY[mode]
├── Can't tell what goes where
└── UI shows "System Prompt" vs "User Prompt" but that's not what you edit
```

### What You Get Now

```
prompts/
├── tailor_resume_full.py      ← Open this file, everything is here
│   ├── INSTRUCTIONS           ← The part you paste from ChatGPT (editable in UI)
│   ├── RULES                  ← Output schema (editable in UI, with warning)
│   └── DATA_TEMPLATE          ← Where runtime data goes (rarely touch this)
```

### The Two Things You Edit

| What | Where | How Often | UI Section |
|------|-------|-----------|------------|
| **Instructions** | `INSTRUCTIONS` | Frequently — paste improved prompts | Green panel, "Safe to edit" |
| **Rules** | `RULES` | Rarely — output schema changes | Yellow panel, "⚠️ Affects parsers" |

### How It Maps to the LLM API

```python
# What happens under the hood (you don't need to think about this)
system_message = INSTRUCTIONS + "\n\n" + RULES
user_message = DATA_TEMPLATE.format(resume=..., jd=..., ...)

# The LLM sees:
# [SYSTEM] Instructions + Rules
# [USER] The actual data
```

---

## 2. The Three-Part Prompt Structure

Every prompt file has exactly three parts:

### Part 1: INSTRUCTIONS (What You Iterate On)

```python
INSTRUCTIONS = """
You are a senior resume strategist with 15+ years of experience.
Your goal: craft a resume that earns the interview call.

APPROACH:
- Read the job description carefully
- Identify key requirements and keywords
- Rewrite bullets to demonstrate relevant experience

WRITING STANDARDS:
- Specific, concrete, direct
- Every bullet: what was done, how, measurable impact
- No filler words: "various", "helped with", "responsible for"
"""
```

**This is what you paste from ChatGPT/Claude when you find better wording.**

### Part 2: RULES (Output Schema — Rarely Changed)

```python
RULES = """
OUTPUT FORMAT:
- Valid JSON only — no markdown, no commentary
- Keys: "summary", "experience", "projects", "skills", "bold_keywords"

FIELD SPECIFICATIONS:
- summary: One sentence (50-80 words)
- experience: Object keyed by 0-based index
- Do NOT emit: id, company, location, dates

Output language: {output_language}
"""
```

**This is structural. Change it only when you change the output shape.**

### Part 3: DATA_TEMPLATE (Runtime Data — Rarely Touch)

```python
DATA_TEMPLATE = """
CANDIDATE'S RESUME:
{resume_data}

JOB DESCRIPTION INTELLIGENCE:
{jd_intelligence}

RESPONSE CONTRACT:
{response_contract}
"""
```

**This is just placeholders. The orchestration fills these with actual data.**

### How They Combine

```python
def build_messages(**kwargs) -> tuple[str, str]:
    """Returns (system_message, user_message) for the LLM API."""

    # System = Instructions + Rules
    system = INSTRUCTIONS.strip() + "\n\n" + RULES.strip()

    # User = Data template filled with runtime values
    user = DATA_TEMPLATE.format(**kwargs)

    return system, user
```

---

## 3. File Layout

```
apps/backend/app/
├── prompts/
│   ├── __init__.py                   # Registry + override helpers
│   │
│   ├── _rules/                       # SHARED output schemas
│   │   ├── __init__.py
│   │   ├── resume_diff.py            # Used by tailor_full, tailor_lite, rewrite
│   │   ├── jd_intel.py               # Used by extract_jd_intel
│   │   └── critique.py               # Used by critique_resume
│   │
│   ├── parse_resume.py               # Parse uploaded resume
│   ├── extract_jd_intel.py           # Extract JD intelligence
│   ├── tailor_resume_full.py         # Full mode tailoring
│   ├── tailor_resume_lite.py         # Lite mode tailoring
│   ├── critique_resume.py            # Critique draft (full only)
│   ├── rewrite_resume.py             # Fix issues from critique
│   ├── cover_letter.py               # Cover letter + outreach
│   ├── answer_questions.py           # Application questions
│   │
│   ├── _schema.py                    # Resume JSON schema constant
│   ├── _refinement.py                # AI word blacklist
│   └── enrichment.py                 # UNCHANGED (out of scope)
│
├── prompt_overrides/                 # User edits (not in git)
│   ├── .gitignore
│   └── *.txt                         # Created when user edits in UI
```

---

## 4. Prompt File Template

Every prompt file follows this exact structure:

```python
"""Prompt: tailor_resume_full — Full mode resume tailoring."""

from prompts._rules.resume_diff import RESUME_DIFF_RULES

# ═══════════════════════════════════════════════════════════════
# META
# ═══════════════════════════════════════════════════════════════
STEP_NAME = "tailor_resume_full"
STEP_LABEL = "Tailor Resume (Full)"
STEP_VERSION = "v1.0"
FILE_PATH = "prompts/tailor_resume_full.py"

PIPELINE = "full"           # full | lite | standalone
PIPELINE_ORDER = 2          # Position in pipeline (for UI ordering)
RECEIVES_FROM = ["extract_jd_intel"]
FEEDS_INTO = ["critique_resume"]

# ═══════════════════════════════════════════════════════════════
# INSTRUCTIONS — The part you iterate on
# ═══════════════════════════════════════════════════════════════
# Paste improved versions from ChatGPT/Claude here.
# Or edit via the Prompt Manager UI.

INSTRUCTIONS = """
You are a senior resume strategist with 15+ years of experience placing
candidates at top companies. Your single goal: craft a resume that earns
the interview call.

APPROACH:
- Analyze the job description intelligence to understand what they need
- Identify the candidate's most relevant experiences
- Rewrite bullets to directly address the JD requirements

WRITING STANDARDS:
- Write like a real engineer — specific, concrete, direct
- Every bullet must answer: what was done, how, what was the impact
- Use action verbs: led, built, designed, implemented, reduced, increased
- Quantify everything: percentages, dollar amounts, time saved, users served
- Remove filler: "various", "helped with", "assisted in", "responsible for"

ATS OPTIMIZATION:
- Weave JD keywords naturally throughout
- Match the JD's exact terminology
- Front-load important keywords in bullets
- Include both spelled-out terms and acronyms

PRESERVE:
- Factual accuracy — never invent achievements
- Dates, company names, titles — use exactly as provided
- The candidate's authentic voice
"""

# ═══════════════════════════════════════════════════════════════
# RULES — Output schema (change carefully)
# ═══════════════════════════════════════════════════════════════
# Changing this may break the parser that reads the LLM output.
# Imported from shared rules for consistency.

RULES = RESUME_DIFF_RULES
RULES_SOURCE = "resume_diff"  # For UI display

# ═══════════════════════════════════════════════════════════════
# DATA_TEMPLATE — Runtime data placeholders
# ═══════════════════════════════════════════════════════════════
# These get filled with actual values at runtime.
# You rarely need to edit this.

DATA_TEMPLATE = """
CANDIDATE'S RESUME:
{resume_data}

JOB DESCRIPTION INTELLIGENCE:
{jd_intelligence}

RESPONSE CONTRACT (which sections exist in this resume):
{response_contract}
"""

# Variables documentation (for UI display)
VARIABLES = {
    "resume_data": "Base resume JSON from database",
    "jd_intelligence": "Extracted JD intel (from extract_jd_intel step)",
    "response_contract": "Computed list of sections/indices that exist",
    "output_language": "Target language (in RULES)",
}

# ═══════════════════════════════════════════════════════════════
# ASSEMBLY — Don't modify this
# ═══════════════════════════════════════════════════════════════

def build_messages(
    resume_data: str,
    jd_intelligence: str,
    response_contract: str,
    output_language: str = "English",
) -> tuple[str, str]:
    """Build (system_message, user_message) for the LLM API.

    Returns:
        system: INSTRUCTIONS + RULES (with output_language filled)
        user: DATA_TEMPLATE filled with runtime values
    """
    from prompts import load_override

    # Get instructions (user override or default)
    instructions = load_override(STEP_NAME, "instructions") or INSTRUCTIONS

    # Get rules (user override or default)
    rules = load_override(STEP_NAME, "rules") or RULES

    # Build system message
    system = instructions.strip() + "\n\n" + rules.strip()
    system = system.format(output_language=output_language)

    # Build user message
    user = DATA_TEMPLATE.format(
        resume_data=resume_data,
        jd_intelligence=jd_intelligence,
        response_contract=response_contract,
    )

    return system, user
```

---

## 5. Shared Rules

Rules that multiple prompts use. Edit once, applies everywhere.

### File: `prompts/_rules/resume_diff.py`

```python
"""Shared rules for resume diff output format.

Used by: tailor_resume_full, tailor_resume_lite, rewrite_resume
"""

RESUME_DIFF_RULES = """
OUTPUT FORMAT:
- Valid JSON only — no markdown, no commentary
- Keys: "summary", "experience", "projects", "skills", "bold_keywords"

FIELD SPECIFICATIONS:
- summary: One compelling sentence (50-80 words) tailored to this role
- experience: Object keyed by 0-based index (matches experience array order)
  - Each entry: { "bullets": ["rewritten bullet 1", "bullet 2", ...] }
- projects: Object keyed by 0-based index
  - Each entry: { "description": "rewritten description" }
- skills: Array of skill strings, optimized for ATS
- bold_keywords: Array of keywords to emphasize in the final resume

DO NOT EMIT:
- id, company, location, dates, github, website, name, email, phone
- Any field not listed above

Output language: {output_language}
"""

# For registry/UI
RULES_NAME = "resume_diff"
RULES_LABEL = "Resume Diff Output"
USED_BY = ["tailor_resume_full", "tailor_resume_lite", "rewrite_resume"]
```

### File: `prompts/_rules/jd_intel.py`

```python
"""Shared rules for JD intelligence output format.

Used by: extract_jd_intel
"""

# Copy EXACT text from current JD_INTELLIGENCE_CONTRACT_BLOCK
JD_INTEL_RULES = """
...exact content from templates.py...
"""

RULES_NAME = "jd_intel"
RULES_LABEL = "JD Intelligence Output"
USED_BY = ["extract_jd_intel"]
```

### File: `prompts/_rules/critique.py`

```python
"""Shared rules for critique output format.

Used by: critique_resume
"""

CRITIQUE_RULES = """
OUTPUT FORMAT:
- Valid JSON only

REQUIRED KEYS:
{
  "overall_assessment": "Brief impression of fit for this role",
  "red_flags": [
    { "location": "experience.0.bullets.2", "issue": "...", "severity": "high|medium|low" }
  ],
  "missed_keywords": [
    { "keyword": "Kubernetes", "suggestion": "Where to add it" }
  ],
  "weak_bullets": [
    { "location": "experience.1.bullets.0", "current": "...", "issue": "..." }
  ],
  "suggestions": ["Actionable suggestion 1", "..."]
}
"""

RULES_NAME = "critique"
RULES_LABEL = "Critique Output"
USED_BY = ["critique_resume"]
```

---

## 6. Pipeline Definitions

### Full Pipeline

```
User clicks "Generate (Full)"
         │
         ▼
┌─────────────────┐
│ extract_jd_intel │ ← JD text
└────────┬────────┘
         │ jd_intelligence
         ▼
┌─────────────────────┐
│ tailor_resume_full  │ ← resume + jd_intel
└────────┬────────────┘
         │ draft_diff
         ▼
┌─────────────────┐
│ critique_resume │ ← draft_diff + jd_intel
└────────┬────────┘
         │ critique (red flags, suggestions)
         ▼
┌─────────────────┐
│ rewrite_resume  │ ← draft + critique + original + jd_intel
└────────┬────────┘
         │ final_diff
         ▼
┌─────────────────┐
│ apply_diff()    │ ← Code, not LLM
└────────┬────────┘
         │
         ▼
    Final Resume
```

### Lite Pipeline

```
User clicks "Generate (Lite)"
         │
         ▼
┌─────────────────┐
│ extract_jd_intel │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ tailor_resume_lite  │ ← Minimal changes, keyword focus
└────────┬────────────┘
         │ final_diff
         ▼
┌─────────────────┐
│ apply_diff()    │
└────────┬────────┘
         │
         ▼
    Final Resume
```

### Config

```json
{
  "enable_critique": true   // Toggle critique+rewrite (full mode only)
}
```

When `enable_critique: false`, full pipeline skips critique+rewrite (behaves like lite but with full instructions).

---

## 7. Override System

Users can edit Instructions and Rules from the UI. Changes save to disk, not modifying Python source.

### Storage

```
prompt_overrides/
├── .gitignore                              # Ignore all overrides
├── tailor_resume_full.instructions.txt     # User-edited instructions
├── tailor_resume_full.rules.txt            # User-edited rules (rare)
└── _rules.resume_diff.txt                  # Shared rule override
```

### Logic

```python
# prompts/__init__.py

from pathlib import Path

OVERRIDE_DIR = Path(__file__).parent.parent / "prompt_overrides"

def load_override(step_name: str, part: str) -> str | None:
    """Load user override for instructions or rules.

    Args:
        step_name: e.g., "tailor_resume_full"
        part: "instructions" or "rules"

    Returns:
        Override text if exists, None otherwise.
    """
    path = OVERRIDE_DIR / f"{step_name}.{part}.txt"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return None

def save_override(step_name: str, part: str, content: str) -> None:
    """Save user override."""
    OVERRIDE_DIR.mkdir(exist_ok=True)
    path = OVERRIDE_DIR / f"{step_name}.{part}.txt"
    path.write_text(content, encoding="utf-8")

def delete_override(step_name: str, part: str) -> bool:
    """Delete override, return True if existed."""
    path = OVERRIDE_DIR / f"{step_name}.{part}.txt"
    if path.exists():
        path.unlink()
        return True
    return False

def has_override(step_name: str, part: str) -> bool:
    """Check if override exists."""
    return (OVERRIDE_DIR / f"{step_name}.{part}.txt").exists()
```

### Shared Rules Override

```python
def load_shared_rules_override(rules_name: str) -> str | None:
    """Load override for shared rules (e.g., 'resume_diff')."""
    path = OVERRIDE_DIR / f"_rules.{rules_name}.txt"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return None
```

---

## 8. Per-Step Model Selection

Each LLM step can use a different model.

### Config

```json
{
  "model_overrides": {
    "tailor_resume_full": null,      // null = use default
    "tailor_resume_lite": null,
    "critique_resume": "openai/gpt-4o",  // Use GPT-4o for critique
    "rewrite_resume": null
  }
}
```

### Backend

```python
# app/config.py

def get_step_model(step_name: str) -> str | None:
    """Get model override for a step, or None to use default.

    Returns format: "provider/model" or None
    """
    config = load_config()
    overrides = config.get("model_overrides", {})
    return overrides.get(step_name)  # None means use default
```

### Usage in LLM Calls

```python
# services/tailoring/llm_calls.py

async def call_tailor_resume_full(...) -> dict:
    from prompts import get_prompt
    from app.config import get_step_model
    from app.llm import complete_json

    prompt = get_prompt("tailor_resume_full")
    system, user = prompt.build_messages(
        resume_data=...,
        jd_intelligence=...,
        response_contract=...,
    )

    model_override = get_step_model("tailor_resume_full")

    return await complete_json(
        system_prompt=system,
        prompt=user,
        operation="tailor_resume_full",
        model_override=model_override,  # None = use default
    )
```

---

## 9. Critique Pipeline

Two new prompts for quality improvement (full mode only).

### critique_resume.py

```python
"""Prompt: critique_resume — Hiring manager critique of draft."""

from prompts._rules.critique import CRITIQUE_RULES

STEP_NAME = "critique_resume"
STEP_LABEL = "Critique Resume"
PIPELINE = "full"
PIPELINE_ORDER = 3
RECEIVES_FROM = ["tailor_resume_full"]
FEEDS_INTO = ["rewrite_resume"]

INSTRUCTIONS = """
You are a senior hiring manager at a top tech company. You've reviewed
thousands of resumes and can instantly spot red flags and missed opportunities.

YOUR TASK:
Review this draft resume with a critical eye. Think out loud about concerns.

LOOK FOR:

1. RED FLAGS — Things that would make you skeptical:
   - Scope claims too large for role/tenure
   - Vague achievements without metrics
   - Buzzword stuffing
   - Inconsistencies

2. MISSED KEYWORDS — JD requirements not reflected:
   - Key technologies missing
   - Required skills not demonstrated

3. WEAK BULLETS — Lines that don't show impact:
   - Generic descriptions ("worked on", "helped with")
   - Missing quantification
   - Actions without outcomes

Be specific. Reference exact locations (e.g., "experience.0.bullets.2").
Be honest. If something looks exaggerated, say so.
Be constructive. Every criticism should suggest improvement.
"""

RULES = CRITIQUE_RULES
RULES_SOURCE = "critique"

DATA_TEMPLATE = """
DRAFT RESUME (to critique):
{draft_resume}

JOB DESCRIPTION INTELLIGENCE:
{jd_intelligence}
"""

VARIABLES = {
    "draft_resume": "The tailored resume diff from previous step",
    "jd_intelligence": "Extracted JD intel for context",
}

def build_messages(draft_resume: str, jd_intelligence: str) -> tuple[str, str]:
    from prompts import load_override

    instructions = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    rules = load_override(STEP_NAME, "rules") or RULES

    system = instructions.strip() + "\n\n" + rules.strip()
    user = DATA_TEMPLATE.format(
        draft_resume=draft_resume,
        jd_intelligence=jd_intelligence,
    )

    return system, user
```

### rewrite_resume.py

```python
"""Prompt: rewrite_resume — Fix issues identified in critique."""

from prompts._rules.resume_diff import RESUME_DIFF_RULES

STEP_NAME = "rewrite_resume"
STEP_LABEL = "Rewrite Resume"
PIPELINE = "full"
PIPELINE_ORDER = 4
RECEIVES_FROM = ["critique_resume"]
FEEDS_INTO = []

INSTRUCTIONS = """
You are a senior resume strategist. You've received feedback from a hiring
manager and must now improve the resume.

YOUR TASK:
Address EVERY issue in the critique.

FOR EACH RED FLAG:
- Scale back exaggerations to believable claims
- Add specifics from the original resume
- Fix inconsistencies

FOR EACH MISSED KEYWORD:
- Incorporate naturally where suggested
- Find genuine connections to the candidate's work

FOR EACH WEAK BULLET:
- Rewrite with specific action, method, and impact
- Draw on details from the original resume

CRITICAL:
- Maintain authentic voice
- Use evidence from original — don't invent
- Output same format as previous tailoring step
"""

RULES = RESUME_DIFF_RULES
RULES_SOURCE = "resume_diff"

DATA_TEMPLATE = """
ORIGINAL RESUME (candidate's authentic content):
{original_resume}

DRAFT RESUME (first pass — has issues):
{draft_resume}

CRITIQUE (issues to fix):
{critique}

JOB DESCRIPTION INTELLIGENCE:
{jd_intelligence}

RESPONSE CONTRACT:
{response_contract}
"""

VARIABLES = {
    "original_resume": "The base resume before any tailoring",
    "draft_resume": "First-pass tailored diff",
    "critique": "Red flags, weak bullets, suggestions",
    "jd_intelligence": "JD intel for context",
    "response_contract": "Which sections exist",
    "output_language": "Target language (in RULES)",
}

def build_messages(
    original_resume: str,
    draft_resume: str,
    critique: str,
    jd_intelligence: str,
    response_contract: str,
    output_language: str = "English",
) -> tuple[str, str]:
    from prompts import load_override

    instructions = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    rules = load_override(STEP_NAME, "rules") or RULES

    system = instructions.strip() + "\n\n" + rules.format(output_language=output_language)
    user = DATA_TEMPLATE.format(
        original_resume=original_resume,
        draft_resume=draft_resume,
        critique=critique,
        jd_intelligence=jd_intelligence,
        response_contract=response_contract,
    )

    return system, user
```

---

## 10. Backend Implementation

### Files to CREATE

| File | Purpose |
|------|---------|
| `prompts/_rules/__init__.py` | Export all shared rules |
| `prompts/_rules/resume_diff.py` | Resume diff output format |
| `prompts/_rules/jd_intel.py` | JD intel output format |
| `prompts/_rules/critique.py` | Critique output format |
| `prompts/parse_resume.py` | Parse resume prompt |
| `prompts/extract_jd_intel.py` | Extract JD intel prompt |
| `prompts/tailor_resume_full.py` | Full mode prompt |
| `prompts/tailor_resume_lite.py` | Lite mode prompt |
| `prompts/critique_resume.py` | Critique prompt |
| `prompts/rewrite_resume.py` | Rewrite prompt |
| `prompts/cover_letter.py` | Cover letter prompt |
| `prompts/answer_questions.py` | App questions prompt |
| `services/tailoring/llm_calls.py` | LLM call wrappers |
| `prompt_overrides/.gitignore` | Ignore override files |

### Files to MODIFY

| File | Changes |
|------|---------|
| `prompts/__init__.py` | Rewrite: registry + override system |
| `prompts/_refinement.py` | Rename from refinement.py |
| `services/tailoring/orchestration.py` | Use new prompts, add critique pipeline |
| `services/tailoring/prompting.py` | Simplify (most moves to prompt files) |
| `services/parser.py` | Import from new prompt |
| `services/cover_letter.py` | Import from new prompt |
| `services/application_questions.py` | Import from new prompt |
| `routers/config.py` | New catalog endpoint, override endpoints |
| `schemas/models.py` | Update PromptCatalogEntry |

### Files to DELETE

| File | Why |
|------|-----|
| `prompts/templates.py` | Everything migrated |
| `prompts/catalog_sections.py` | Catalog from registry now |

### Registry Implementation

```python
# prompts/__init__.py

from pathlib import Path
from typing import TYPE_CHECKING
import importlib

if TYPE_CHECKING:
    from types import ModuleType

OVERRIDE_DIR = Path(__file__).parent.parent / "prompt_overrides"

# Step names for validation
VALID_STEPS = {
    "parse_resume",
    "extract_jd_intel",
    "tailor_resume_full",
    "tailor_resume_lite",
    "critique_resume",
    "rewrite_resume",
    "cover_letter",
    "answer_questions",
}

_cache: dict[str, "ModuleType"] = {}

def get_prompt(step_name: str) -> "ModuleType":
    """Get prompt module by step name."""
    if step_name not in VALID_STEPS:
        raise ValueError(f"Unknown step: {step_name}")

    if step_name not in _cache:
        _cache[step_name] = importlib.import_module(f"prompts.{step_name}")

    return _cache[step_name]

def load_override(step_name: str, part: str) -> str | None:
    """Load user override. part = 'instructions' or 'rules'"""
    if step_name not in VALID_STEPS:
        raise ValueError(f"Invalid step: {step_name}")
    if part not in ("instructions", "rules"):
        raise ValueError(f"Invalid part: {part}")

    path = OVERRIDE_DIR / f"{step_name}.{part}.txt"
    return path.read_text("utf-8") if path.exists() else None

def save_override(step_name: str, part: str, content: str) -> None:
    """Save user override."""
    if step_name not in VALID_STEPS:
        raise ValueError(f"Invalid step: {step_name}")

    OVERRIDE_DIR.mkdir(exist_ok=True)
    (OVERRIDE_DIR / f"{step_name}.{part}.txt").write_text(content, "utf-8")

def delete_override(step_name: str, part: str) -> bool:
    """Delete override, return True if existed."""
    path = OVERRIDE_DIR / f"{step_name}.{part}.txt"
    if path.exists():
        path.unlink()
        return True
    return False

def has_override(step_name: str, part: str) -> bool:
    """Check if override exists."""
    return (OVERRIDE_DIR / f"{step_name}.{part}.txt").exists()

# Backward compatibility for enrichment.py
from prompts.enrichment import (
    ENRICHMENT_ANALYZE_SYSTEM_PROMPT,
    ENRICHMENT_ENHANCE_SYSTEM_PROMPT,
    ENRICHMENT_REGEN_ITEM_SYSTEM_PROMPT,
    ENRICHMENT_REGEN_GROUP_SYSTEM_PROMPT,
)
```

---

## 11. Frontend — Prompt Manager UI

### Page Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  PROMPT MANAGER                                                    │
│                                                                    │
│  ┌─ PIPELINE DIAGRAM ─────────────────────────────────────────┐   │
│  │                                                             │   │
│  │  FULL:  extract ──▶ tailor_full ──▶ critique ──▶ rewrite   │   │
│  │  LITE:  extract ──▶ tailor_lite                             │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ SETTINGS ──────────────────────────────────────────────────┐   │
│  │  ☑ Enable critique + rewrite (full mode only)               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ━━━ SHARED RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                                                    │
│  ┌─ Resume Diff Output ─── used by 3 steps ────────────────────┐   │
│  │ ⚠️ Changing this affects: tailor_full, tailor_lite, rewrite  │   │
│  │                                                             │   │
│  │ ┌─────────────────────────────────────────────────────────┐ │   │
│  │ │ OUTPUT FORMAT:                                          │ │   │
│  │ │ - Valid JSON only...                                    │ │   │
│  │ └─────────────────────────────────────────────────────────┘ │   │
│  │                                          [Edit] [Reset]     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ━━━ FULL PIPELINE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                                                    │
│  ┌─ Tailor Resume (Full) ─────────────────────────────── v1.0 ─┐   │
│  │ 📁 prompts/tailor_resume_full.py                            │   │
│  │ 🤖 claude-sonnet (default)  [change model]                  │   │
│  │                                                             │   │
│  │ ▼ INSTRUCTIONS ──────────────────────── [Edit] [Reset]      │   │
│  │   ┌───────────────────────────────────────────────────────┐ │   │
│  │   │ You are a senior resume strategist...                 │ │   │
│  │   │ (collapsible, editable textarea)                      │ │   │
│  │   └───────────────────────────────────────────────────────┘ │   │
│  │                                                             │   │
│  │ ▼ RULES ─── from resume_diff ─── ⚠️ Shared                  │   │
│  │   (shows shared rule, link to edit above)                   │   │
│  │                                                             │   │
│  │ ▼ DATA TEMPLATE (read-only)                                 │   │
│  │   {resume_data}, {jd_intelligence}, {response_contract}     │   │
│  │                                                             │   │
│  │ ▼ RAW PREVIEW ────────────────────────────────────────────  │   │
│  │   Shows: SYSTEM MESSAGE | USER MESSAGE                      │   │
│  │   (Final assembled prompt as LLM sees it)                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ... more step cards ...                                           │
│                                                                    │
│  ━━━ LITE PIPELINE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  ━━━ STANDALONE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
└────────────────────────────────────────────────────────────────────┘
```

### Model Picker Modal

Click `[change model]` → opens searchable modal:

```
┌─ Select Model for: Critique Resume ─────────────────────┐
│                                                          │
│  🔍 [Search models...                              ]     │
│                                                          │
│  ○ Use default (claude-sonnet-4-20250514)                       │
│                                                          │
│  ANTHROPIC                                               │
│  ○ claude-sonnet-4-20250514                                     │
│  ○ claude-haiku-4-5-20251001                                         │
│                                                          │
│  OPENAI                                                  │
│  ● gpt-4o  ← currently selected                          │
│  ○ gpt-4o-mini                                           │
│                                                          │
│                               [Cancel] [Apply]           │
└──────────────────────────────────────────────────────────┘
```

### Components to Create

| Component | Purpose |
|-----------|---------|
| `prompt-card.tsx` | Single step card (instructions, rules, preview) |
| `model-picker-modal.tsx` | Searchable model selection |
| `shared-rules-card.tsx` | Shared rule with usage warning |
| `pipeline-diagram.tsx` | Visual flow diagram |
| `raw-preview.tsx` | System + User message preview |

---

## 12. API Contracts

### GET /config/prompts

Returns all prompts with their current state.

```typescript
interface PromptEntry {
  step_name: string;           // "tailor_resume_full"
  label: string;               // "Tailor Resume (Full)"
  version: string;             // "v1.0"
  file_path: string;           // "prompts/tailor_resume_full.py"

  pipeline: "full" | "lite" | "standalone";
  pipeline_order: number;
  receives_from: string[];
  feeds_into: string[];

  // Content
  instructions: string;        // Current (override or default)
  instructions_is_override: boolean;
  instructions_default: string;

  rules: string;               // Current
  rules_source: string;        // "resume_diff" (shared rule name)
  rules_is_override: boolean;

  data_template: string;       // Usually read-only
  variables: Array<{ name: string; description: string }>;

  // Model
  model: string;               // Resolved model
  model_is_override: boolean;
}

interface SharedRule {
  name: string;                // "resume_diff"
  label: string;               // "Resume Diff Output"
  rules: string;               // Current content
  rules_is_override: boolean;
  rules_default: string;
  used_by: string[];           // ["tailor_resume_full", ...]
}

interface PromptCatalogResponse {
  entries: PromptEntry[];
  shared_rules: SharedRule[];
}
```

### PUT /config/prompts/{step_name}/instructions

```typescript
// Request
{ instructions: string }

// Response
{ success: boolean; step_name: string }
```

### DELETE /config/prompts/{step_name}/instructions

Reset to default.

### PUT /config/prompts/{step_name}/rules

```typescript
// Request
{ rules: string }

// Response
{ success: boolean; step_name: string }
```

### PUT /config/shared-rules/{rules_name}

```typescript
// Request
{ rules: string }

// Response
{ success: boolean; rules_name: string; affected_steps: string[] }
```

### DELETE /config/shared-rules/{rules_name}

Reset shared rules file override to shipped defaults (same response shape as PUT success).

### GET/PUT /config/model-overrides

```typescript
// GET Response
{ overrides: Record<string, string | null> }

// PUT Request
{ overrides: Record<string, string | null> }
```

### GET/PUT /config/critique

```typescript
// GET/PUT
{ enabled: boolean }
```

---

## 13. Migration Guide

### Step 1: Create Shared Rules (copy exact text from templates.py)

```
1. Create prompts/_rules/resume_diff.py
   - Copy TAILORING_CONTRACT_BLOCK exactly → RESUME_DIFF_RULES

2. Create prompts/_rules/jd_intel.py
   - Copy JD_INTELLIGENCE_CONTRACT_BLOCK exactly → JD_INTEL_RULES

3. Create prompts/_rules/critique.py
   - New content (from section 5)
```

### Step 2: Create Prompt Files (copy exact text)

For each step:
1. Create the file (e.g., `tailor_resume_full.py`)
2. Copy INSTRUCTIONS from relevant constants in `templates.py`
3. Import RULES from shared rules
4. Copy DATA_TEMPLATE (the user message template)
5. Implement `build_messages()`

**IMPORTANT:** Use `"lite"` everywhere (rename from `"light"`).

### Step 3: Update Call Sites

```python
# Old
from prompts.templates import TAILORING_CONTRACT_BLOCK, ...
system = assemble_tailoring_system_prompt(mode="full", ...)
user = TAILORING_USER_SHELL.format(...)

# New
from prompts import get_prompt
prompt = get_prompt("tailor_resume_full")
system, user = prompt.build_messages(...)
```

### Step 4: Add Override System

1. Create `prompt_overrides/.gitignore`
2. Update `prompts/__init__.py` with override functions
3. Add API endpoints to `routers/config.py`

### Step 5: Add Critique Pipeline

1. Create `critique_resume.py` and `rewrite_resume.py`
2. Update `orchestration.py` to use critique pipeline
3. Add `enable_critique` config

### Step 6: Add Model Overrides

1. Add `model_overrides` to config
2. Wire into LLM calls

### Step 7: Delete Old Files

1. Delete `prompts/templates.py`
2. Delete `prompts/catalog_sections.py`

---

## 14. Testing

### Migration Equivalence

```python
def test_full_system_message_unchanged():
    """New prompt produces same system message as old code."""
    # Get old assembled system message
    old_system = assemble_tailoring_system_prompt(mode="full", ...)

    # Get new
    prompt = get_prompt("tailor_resume_full")
    new_system, _ = prompt.build_messages(...)

    assert old_system == new_system

def test_full_user_message_unchanged():
    """New prompt produces same user message as old code."""
    old_user = TAILORING_USER_SHELL.format(...)

    prompt = get_prompt("tailor_resume_full")
    _, new_user = prompt.build_messages(...)

    assert old_user == new_user
```

### Override System

```python
def test_instruction_override():
    save_override("tailor_resume_full", "instructions", "CUSTOM")
    prompt = get_prompt("tailor_resume_full")
    system, _ = prompt.build_messages(...)
    assert "CUSTOM" in system
    delete_override("tailor_resume_full", "instructions")

def test_no_override_uses_default():
    delete_override("tailor_resume_full", "instructions")
    prompt = get_prompt("tailor_resume_full")
    system, _ = prompt.build_messages(...)
    assert "senior resume strategist" in system
```

### Registry

```python
def test_all_steps_loadable():
    for step in VALID_STEPS:
        mod = get_prompt(step)
        assert hasattr(mod, "build_messages")
        assert hasattr(mod, "INSTRUCTIONS")
        assert hasattr(mod, "RULES")
```

---

## 15. Implementation Checklist

### Phase 1: Shared Rules

```
[x] Create prompts/_rules/__init__.py
[x] Create prompts/_rules/resume_diff.py (copy exact text)
[x] Create prompts/_rules/jd_intel.py (copy exact text)
[x] Create prompts/_rules/critique.py
```

### Phase 2: Prompt Files

```
[x] Create prompts/parse_resume.py
[x] Create prompts/extract_jd_intel.py
[x] Create prompts/tailor_resume_full.py
[x] Create prompts/tailor_resume_lite.py
[x] Create prompts/critique_resume.py
[x] Create prompts/rewrite_resume.py
[x] Create prompts/cover_letter.py
[x] Create prompts/answer_questions.py
[x] Rewrite prompts/__init__.py
[x] Rename refinement.py → _refinement.py
[x] Create prompt_overrides/.gitignore
[x] Write migration equivalence tests
[x] All tests pass
```

### Phase 3: Update Call Sites

```
[x] Update services/parser.py
[x] Update services/tailoring/analysis.py
[x] Create services/tailoring/llm_calls.py
[x] Update services/tailoring/orchestration.py
[x] Update services/cover_letter.py
[x] Update services/application_questions.py
[x] Delete prompts/templates.py
[x] Delete prompts/catalog_sections.py (replaced by tailoring_catalog.py)
[x] All tests pass
```

### Phase 4: Critique Pipeline

```
[x] Add enable_critique config
[x] Wire critique into orchestration (full mode)
[x] Wire rewrite into orchestration (full mode)
[x] Skip both when enable_critique=false
[x] Add critique_analysis to response
[x] Tests for all paths
```

### Phase 5: Model Overrides

```
[x] Add model_overrides config
[x] Implement get_step_model()
[x] Wire into all LLM calls
[x] Tests for override resolution
```

### Phase 6: Catalog API

```
[x] Update schemas/models.py
[x] Rewrite catalog endpoint
[x] Add override save/delete endpoints
[x] Add model override endpoints
[x] Add critique toggle endpoint
```

### Phase 7: Frontend

```
[x] Update lib/api/config.ts types
[x] Create prompt-card.tsx
[x] Create model-picker-modal.tsx
[x] Create shared-rules-card.tsx
[x] Rewrite prompt-catalog page
[x] Add critique toggle to settings
[x] Delete prompt-catalog-tree.tsx (replaced by prompt-section-tree.tsx)
```

### Phase 8: Final

```
[x] Full mode with critique: e2e (covered by unit/integration; browser e2e optional)
[x] Full mode without critique: e2e
[x] Lite mode: e2e
[x] Override save/reset: works (API + disk; UI editing optional)
[x] Model override: works
[x] npm run lint passes (prompt manager files; repo-wide may have pre-existing issues)
[x] All tests pass
```

---

## Quick Reference

### Prompt Structure

```python
INSTRUCTIONS = """..."""     # What you iterate on
RULES = SHARED_RULES         # Output schema
DATA_TEMPLATE = """..."""    # Runtime data placeholders

def build_messages(...) -> tuple[str, str]:
    system = INSTRUCTIONS + RULES
    user = DATA_TEMPLATE.format(...)
    return system, user
```

### Override Paths

```
prompt_overrides/{step_name}.instructions.txt
prompt_overrides/{step_name}.rules.txt
prompt_overrides/_rules.{rules_name}.txt
```

### Pipelines

```
FULL:  extract → tailor_full → critique → rewrite → diff
LITE:  extract → tailor_lite → diff
```

---

*End of Phase 3.7.5 Technical Implementation Plan*
