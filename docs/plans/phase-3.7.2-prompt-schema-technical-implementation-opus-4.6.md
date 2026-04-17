# Phase 3.7.2 — Prompt Schema Redesign: Technical Implementation Plan

**Parent design:** [`phase-3.7.1-Prompt-schema-redesign-Opus-4.6.md`](./phase-3.7.1-Prompt-schema-redesign-Opus-4.6.md)  
**Purpose:** Complete handover for implementation. Every decision, file change, block content, and test point is specified. Follow this document in order.

---

## Table of Contents

1. [Resolved Decisions](#1-resolved-decisions)
2. [Phase A — Split blocks without behavior change](#2-phase-a--split-blocks-without-behavior-change)
3. [Phase B — Two modes + JD extraction in pipeline](#3-phase-b--two-modes--jd-extraction-in-pipeline)
4. [Phase C — Pipeline runner + model override](#4-phase-c--pipeline-runner--model-override)
5. [Testing Strategy](#5-testing-strategy)
6. [File Change Index](#6-file-change-index)
7. [Migration Checklist](#7-migration-checklist)

---

## 1. Resolved Decisions

These decisions are **final**. Do not re-open them during implementation.

| # | Decision | Resolution |
|---|----------|------------|
| D1 | Number of modes | **Two**: `full` (default) and `light` |
| D2 | Default mode | `full` (was `keywords`) |
| D3 | `keywords` users migration | Map stored `keywords` → `full`, stored `nudge` → `light` |
| D4 | `IMPROVE_STRATEGY_GUIDANCE` | **Delete entirely** — it is dead code never interpolated into prompts |
| D5 | Light mode contract | **Prompt-only** — same response contract as full, only the system prompt strategy block differs |
| D6 | JD intelligence extraction | **Included** in the pipeline as the first step. Its prompts get the same contract/craft split treatment |
| D7 | Output JSON schema | Remains compatible with `TailoringLLMResponseV2`. Schema version stays `tailoring_resume_v3` but the `TailoringResponseContract` model gets an `extensions: dict[str, Any]` field for future additions |
| D8 | New dependencies | **None**. No new packages |
| D9 | UI editing persistence | Deferred. Config file approach when Phase D ships |
| D10 | Per-step model override | Optional `model_override` field in `PipelineStep`, resolved via existing `LLMConfig` |

---

## 2. Phase A — Split blocks without behavior change

> **Goal:** Restructure code so contract and craft are physically separate. Zero change to what the LLM sees. All existing tests must pass.

### 2.1 Task Checklist — Phase A

```
- [x] A1. Split TAILORING_SYSTEM_PROMPT into three named blocks in templates.py
- [x] A2. Create TAILORING_MODE_STRATEGY dict with full/light entries in templates.py
- [x] A3. Delete IMPROVE_STRATEGY_GUIDANCE from templates.py
- [x] A4. Delete TAILORING_MODE_CONSTRAINTS from templates.py
- [x] A5. Create assemble_tailoring_system_prompt() in prompting.py
- [x] A6. Rewrite build_prompt_context() to use new blocks
- [x] A7. Rewrite render_tailoring_prompt() to use new user shell
- [x] A8. Update TailoringPromptContext dataclass
- [x] A9. Update __init__.py exports
- [x] A10. Update orchestration.py imports and prompt_id validation
- [x] A11. Update catalog_sections.py for new block names
- [x] A12. Update config.py catalog builder
- [x] A13. Split JD intelligence prompts into contract/craft blocks
- [x] A14. Add schema_version extensions field to TailoringResponseContract
- [x] A15. Add backward-compat aliases for removed constants
- [x] A16. Golden-file verification — assembled prompt must match current output byte-for-byte
```

### 2.2 Block Contents — Exact Strings

#### 2.2.1 `TAILORING_CONTRACT_BLOCK`

This is the **OUTPUT FORMAT** section extracted verbatim from the current `TAILORING_SYSTEM_PROMPT` (lines 159-179 of `templates.py`), plus the role line. This block is **calibrated** — change rarely, test always.

```python
TAILORING_CONTRACT_BLOCK = """You are a senior resume strategist. Your single goal: craft a resume that earns the interview call.

OUTPUT FORMAT:
- Valid JSON only — no markdown, no commentary
- Keys: "summary", "experience", "projects", "skills", "bold_keywords"
- summary: one sentence. "[N]+ years in [domain], [1-2 JD-aligned strengths]."
- experience: object keyed by 0-based entry index ("0", "1", …)
  - include only entries you change
  - each entry: { "position": "enhanced title or omit", "bullets": { "INDEX": "text" } }
  - INDEX must be within the entry's bullet_count
  - omit an INDEX to keep that bullet unchanged
- projects: object keyed by 0-based entry index
  - each entry: { "name": "enhanced title or omit", "tech_stacks": "updated tagline or omit", "bullets": { "INDEX": "text" } }
- skills: array of { "label": "...", "values": [...] }
  - keep this concise and simple: 3-6 groups max
  - each group label should be short and clear (e.g., Backend, Cloud, Data, Languages, Certifications)
  - retain highly relevant core skills from the base resume
  - remove clearly irrelevant skills for this role
  - avoid duplicates across groups
  - place JD-critical skills in the first groups
  - omit "skills" key entirely if no changes
- bold_keywords: array of 10-20 strings — keywords from the final resume content that should be rendered bold, selected for maximum JD alignment
- Do NOT emit: id, company, location, dates, github, website, customSections"""
```

**Critical:** This string must produce the **exact same text** that appears in the current `TAILORING_SYSTEM_PROMPT` from `"You are a senior..."` through `"...customSections"`. The only difference is that the intermediate sections (APPROACH, WRITING STANDARDS, ATS OPTIMIZATION) are removed — they go into `TAILORING_CRAFT_BLOCK`.

#### 2.2.2 `TAILORING_CRAFT_BLOCK`

This is APPROACH + WRITING STANDARDS + ATS OPTIMIZATION extracted verbatim. This block is **experimental** — safe to iterate, safe to paste from another LLM.

```python
TAILORING_CRAFT_BLOCK = """APPROACH:
- Rewrite the resume so the candidate naturally fits the target role
- The writing must read like the candidate genuinely wrote it — someone who has done the work and knows the domain
- Maintain the candidate's authentic voice and writing culture from their master resume
- Relate work naturally to what the target employer and team care about
- You may replace the least relevant bullets with content that naturally supports the role
- Titles may be enhanced: add platform, domain, team, or functional scope (e.g., "Software Engineer" → "Software Engineer, Platform & Distributed Systems")
- For projects, naturally relate them to the company's products or domain where the candidate was employed

WRITING STANDARDS:
- Write like a real engineer — specific, concrete, direct
- Every bullet earns its place: what was done, how, and what it achieved
- No trailing purpose clauses ("enhancing system reliability") or self-narrating ("demonstrating expertise in X")
- Active verbs: built, designed, led, shipped, implemented, migrated, automated, improved, reduced, created, integrated, deployed
- Banned: spearheaded, leveraged, orchestrated, utilized, facilitated, synergy, robust, scalable, holistic, proactive, streamlined, cutting-edge, state-of-the-art
- No em-dash
- Vary metrics across bullets: time saved, latency reduced, throughput improved, cost cut, data volume, team size, user count, SLA numbers, error rate reduction — do not repeat the same metric type in consecutive bullets
- Metrics only where credible for the role's seniority and tenure
- Calibrate scope to experience level: early career roles get modest bullets, senior roles can claim system-wide impact. A 3-month intern does not "architect" anything. A first job does not "drive organization-wide strategy"
- Short stints get proportionally scoped bullets

ATS OPTIMIZATION:
- Weave keywords throughout: summary, bullets, skills, project descriptions
- Use exact keyword forms from the job intelligence (e.g., "Spring Boot" not "Spring framework", "Kubernetes" not "K8s")
- Place the highest-priority keywords early in bullets and in the summary
- Never stuff keywords or write hollow ATS-bait sentences — every keyword sits in a meaningful, natural context"""
```

#### 2.2.3 `TAILORING_MODE_STRATEGY`

Two entries. Each is a **multi-paragraph** instruction block — NOT the current one-sentence constraints.

```python
TAILORING_MODE_STRATEGY = {
    "full": (
        "TAILORING MODE: Full edit (maximum alignment)\n"
        "- Rewrite bullets to strongly match the target role. Every bullet should serve the candidate's case for this specific role.\n"
        "- Enhance titles with platform, domain, or scope context (e.g., \"Software Engineer\" → \"Software Engineer, Platform & Distributed Systems\").\n"
        "- Replace the least applicable bullets with naturally fitting alternatives.\n"
        "- Regroup skills into concise, role-relevant categories.\n"
        "- For projects, relate them to the company's products or domain where the candidate was employed.\n"
        "- Calibrate scope to experience level: early career roles get modest bullets; short stints get proportionally scoped bullets."
    ),
    "light": (
        "TAILORING MODE: Light touch (conservative alignment)\n"
        "- Improve wording and weave in a few high-priority keywords. Keep the original voice nearly intact.\n"
        "- Do NOT change job titles. Do NOT add scope, platform, or domain qualifiers to titles.\n"
        "- Only touch bullets that clearly benefit from adjustment. Preserve all others exactly as-is.\n"
        "- Do NOT replace bullets with new content. Only refine existing text.\n"
        "- Skills: minor reordering for relevance is OK. Do not restructure or rename groups.\n"
        "- If in doubt about whether a bullet needs changing, leave it unchanged.\n"
        "- Omit unchanged entries from the output."
    ),
}
```

#### 2.2.4 `TAILORING_USER_SHELL`

Replaces `IMPROVE_RESUME_PROMPT_TEMPLATE`. Nearly identical but the `MODE:` line is simplified (mode strategy is now in system message):

```python
TAILORING_USER_SHELL = """Tailor this resume for the target role.

MODE: {mode_id}

REWRITING EXAMPLE:
Original: "Worked on backend systems"
JD needs: Kubernetes, CI/CD, microservices
Rewritten: "Built and maintained backend microservices deployed on Kubernetes with automated CI/CD pipelines, reducing deployment time from 2 hours to 15 minutes"

JOB INTELLIGENCE:
{job_intelligence}

MASTER RESUME:
{original_resume}

RESPONSE CONTRACT:
{response_contract}

Output language: {output_language}"""
```

**Diff from current:** `MODE: {mode_id} — {mode_constraint}` becomes `MODE: {mode_id}`. The `{mode_constraint}` placeholder is removed because mode instructions now live in the system message.

#### 2.2.5 `IMPROVE_PROMPT_OPTIONS` (updated)

```python
IMPROVE_PROMPT_OPTIONS = [
    {
        "id": "full",
        "label": "Full tailor",
        "description": "Comprehensive tailoring: rewrite bullets, enhance titles, optimize skills for the target role.",
    },
    {
        "id": "light",
        "label": "Light touch",
        "description": "Conservative edits: improve wording and weave in a few keywords without changing structure.",
    },
]

DEFAULT_IMPROVE_PROMPT_ID = "full"
```

#### 2.2.6 `PROMPT_VERSIONS` (updated)

```python
PROMPT_VERSIONS = {
    "tailoring_system": "v5.0",
    "tailoring_contract": "v5.0",
    "tailoring_craft": "v5.0",
    "tailoring_user": "v5.0",
    "jd_intelligence_system": "v2.1",
    "jd_intelligence_user": "v2.1",
    "parse_resume": "v2.2",
    "extract_keywords": "v2.0",  # backward-compat alias
    "cover_letter": "v2.0",
    "outreach": "v2.0",
    "cover_letter_outreach": "v1.0",
    "application_questions_generate": "v1.0",
    "enrichment_analyze": "v1.1",
    "enrichment_enhance": "v1.1",
    "enrichment_regenerate_item": "v1.1",
    "enrichment_regenerate_group": "v1.1",
}
```

#### 2.2.7 JD Intelligence prompts — split into blocks

The existing `EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT` and `EXTRACT_JD_INTELLIGENCE_PROMPT` also get a contract/craft split, so the JD extraction can participate in the pipeline and be improved independently.

```python
JD_INTELLIGENCE_CONTRACT_BLOCK = (
    "You are a job description analyst. Extract actionable intelligence for resume tailoring. "
    "Output only valid JSON matching the schema below, no other text."
)

JD_INTELLIGENCE_CRAFT_BLOCK = (
    "Rules:\n"
    "- role.title: strip company name, location, employment type, \"apply now\"-style noise\n"
    "- location: return only `City, ST` (US state abbreviation). Do not return `Remote`, `Hybrid`, `On-site`, regions, or long phrases. If unavailable, return empty string.\n"
    "- company.product_context: infer from team/division description what they build or maintain\n"
    "- responsibility_themes: distill into themes a resume writer can target, not raw JD bullet copies. Examples: \"API architecture & governance\", \"cloud-native microservices\", \"frontend accessibility & performance\"\n"
    "- ats_keywords: include every technical and domain term. Include common abbreviation variants (e.g., \"CI/CD\" and \"Continuous Integration/Continuous Deployment\")\n"
    "- bold_keywords: the highest-signal keywords for this specific role — will be visually emphasized in the final resume\n"
    "- calibration.seniority_expectations: interpret what scope of impact, leadership, and technical depth this level demands\n"
    "- Use null for missing scalars, [] for missing arrays"
)
```

**Backward compatibility:**
```python
# Assembled forms for backward compat
EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT = JD_INTELLIGENCE_CONTRACT_BLOCK
# (the existing user prompt EXTRACT_JD_INTELLIGENCE_PROMPT stays as-is — it contains the schema inline)
EXTRACT_KEYWORDS_SYSTEM_PROMPT = EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT
```

The existing `EXTRACT_JD_INTELLIGENCE_PROMPT` user template is large but already self-contained (schema + rules + placeholder). It stays as one constant for now — the rules portion can be swapped with `JD_INTELLIGENCE_CRAFT_BLOCK` content in a future iteration.

### 2.3 File Changes — Phase A

#### 2.3.1 `apps/backend/app/prompts/templates.py`

**Action: Major rewrite of tailoring section (lines 130-274)**

1. **Replace** `TAILORING_SYSTEM_PROMPT` (L130-179) with three constants:
   - `TAILORING_CONTRACT_BLOCK` (section 2.2.1 above)
   - `TAILORING_CRAFT_BLOCK` (section 2.2.2 above)
   - Keep a backward-compat alias: `TAILORING_SYSTEM_PROMPT = "\n\n".join([TAILORING_CONTRACT_BLOCK, TAILORING_CRAFT_BLOCK, TAILORING_MODE_STRATEGY["full"]])`

2. **Replace** `TAILORING_MODE_CONSTRAINTS` dict (L181-199) with `TAILORING_MODE_STRATEGY` dict (section 2.2.3)
   - Add backward-compat alias: `TAILORING_MODE_CONSTRAINTS = {k: v for k, v in TAILORING_MODE_STRATEGY.items()}`

3. **Delete** `IMPROVE_STRATEGY_GUIDANCE` dict entirely (L201-232)

4. **Replace** `IMPROVE_RESUME_PROMPT_TEMPLATE` (L234-252) with `TAILORING_USER_SHELL` (section 2.2.4)
   - Keep alias: `IMPROVE_RESUME_PROMPT_TEMPLATE = TAILORING_USER_SHELL`
   - Keep alias: `IMPROVE_RESUME_PROMPT = TAILORING_USER_SHELL`

5. **Replace** `IMPROVE_PROMPT_OPTIONS` (L254-270) with two-item list (section 2.2.5)

6. **Change** `DEFAULT_IMPROVE_PROMPT_ID` (L272) from `"keywords"` to `"full"`

7. **Update** `PROMPT_VERSIONS` (L3-16) per section 2.2.6

8. **Add** JD intelligence block constants (section 2.2.7) near the existing `EXTRACT_JD_INTELLIGENCE_*` constants

9. **Keep all other constants unchanged** (parse, cover letter, outreach, application questions, enrichment system prompts)

#### 2.3.2 `apps/backend/app/prompts/__init__.py`

**Action: Update re-exports**

```python
"""LLM prompt templates."""

from app.prompts.templates import (
    APPLICATION_QUESTIONS_PROMPT,
    APPLICATION_QUESTIONS_SYSTEM_PROMPT,
    COMBINED_MESSAGES_SYSTEM_PROMPT,
    COVER_LETTER_SYSTEM_PROMPT,
    DEFAULT_IMPROVE_PROMPT_ID,
    ENRICHMENT_ANALYZE_SYSTEM_PROMPT,
    ENRICHMENT_ENHANCE_SYSTEM_PROMPT,
    ENRICHMENT_REGENERATE_SYSTEM_PROMPT,
    EXTRACT_JD_INTELLIGENCE_PROMPT,
    EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT,
    EXTRACT_KEYWORDS_PROMPT,
    EXTRACT_KEYWORDS_SYSTEM_PROMPT,
    IMPROVE_PROMPT_OPTIONS,
    IMPROVE_RESUME_PROMPT,
    OUTREACH_SYSTEM_PROMPT,
    PARSE_RESUME_PROMPT,
    PROMPT_VERSIONS,
    TAILORING_CONTRACT_BLOCK,
    TAILORING_CRAFT_BLOCK,
    TAILORING_MODE_STRATEGY,
    TAILORING_SYSTEM_PROMPT,
    TAILORING_USER_SHELL,
    JD_INTELLIGENCE_CONTRACT_BLOCK,
    JD_INTELLIGENCE_CRAFT_BLOCK,
    get_language_name,
)

# Backward-compat aliases — kept for any external consumers
TAILORING_MODE_CONSTRAINTS = TAILORING_MODE_STRATEGY
IMPROVE_RESUME_PROMPT_TEMPLATE = TAILORING_USER_SHELL
IMPROVE_STRATEGY_GUIDANCE = {
    "full": {"primary_goal": "", "description_rule": ""},
    "light": {"primary_goal": "", "description_rule": ""},
}

__all__ = [
    "APPLICATION_QUESTIONS_PROMPT",
    "APPLICATION_QUESTIONS_SYSTEM_PROMPT",
    "COMBINED_MESSAGES_SYSTEM_PROMPT",
    "COVER_LETTER_SYSTEM_PROMPT",
    "DEFAULT_IMPROVE_PROMPT_ID",
    "ENRICHMENT_ANALYZE_SYSTEM_PROMPT",
    "ENRICHMENT_ENHANCE_SYSTEM_PROMPT",
    "ENRICHMENT_REGENERATE_SYSTEM_PROMPT",
    "EXTRACT_JD_INTELLIGENCE_PROMPT",
    "EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT",
    "EXTRACT_KEYWORDS_PROMPT",
    "EXTRACT_KEYWORDS_SYSTEM_PROMPT",
    "IMPROVE_PROMPT_OPTIONS",
    "IMPROVE_RESUME_PROMPT",
    "IMPROVE_RESUME_PROMPT_TEMPLATE",
    "IMPROVE_STRATEGY_GUIDANCE",
    "OUTREACH_SYSTEM_PROMPT",
    "PARSE_RESUME_PROMPT",
    "PROMPT_VERSIONS",
    "TAILORING_CONTRACT_BLOCK",
    "TAILORING_CRAFT_BLOCK",
    "TAILORING_MODE_CONSTRAINTS",
    "TAILORING_MODE_STRATEGY",
    "TAILORING_SYSTEM_PROMPT",
    "TAILORING_USER_SHELL",
    "JD_INTELLIGENCE_CONTRACT_BLOCK",
    "JD_INTELLIGENCE_CRAFT_BLOCK",
    "get_language_name",
]
```

> [!IMPORTANT]
> The `IMPROVE_STRATEGY_GUIDANCE` backward-compat alias above is a **stub dict** with empty strings. This is intentional — it allows `orchestration.py` line 74 (`prompt_id if prompt_id in IMPROVE_STRATEGY_GUIDANCE`) to still work during the transition. But the actual strategy text is now in `TAILORING_MODE_STRATEGY`.

#### 2.3.3 `apps/backend/app/services/tailoring/prompting.py`

**Action: Full rewrite**

```python
"""Prompt assembly helpers for the tailoring pipeline."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable

from app.prompts.templates import (
    DEFAULT_IMPROVE_PROMPT_ID,
    PROMPT_VERSIONS,
    TAILORING_CONTRACT_BLOCK,
    TAILORING_CRAFT_BLOCK,
    TAILORING_MODE_STRATEGY,
    TAILORING_USER_SHELL,
    get_language_name,
)

from app.services.tailoring.analysis import jd_intelligence_to_prompt_json
from app.services.tailoring.models import (
    JDIntelligence,
    TailoringResponseContract,
    TailoringResumePayload,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Prompt context
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class TailoringPromptContext:
    """All data needed to render the tailoring prompt pair."""

    prompt_id: str
    output_language: str
    response_contract_json: str
    job_intelligence_json: str
    original_resume_json: str
    retry_hint: str
    system_prompt: str
    user_prompt: str
    used_structured_resume_input: bool


# ---------------------------------------------------------------------------
# System prompt assembler — single source of truth
# ---------------------------------------------------------------------------

def assemble_tailoring_system_prompt(mode: str) -> str:
    """Build the full system message by concatenating blocks.

    Order: CONTRACT → CRAFT → MODE_STRATEGY
    This is the ONE place that decides what the model sees as its system prompt.
    """
    strategy = TAILORING_MODE_STRATEGY.get(mode, TAILORING_MODE_STRATEGY["full"])
    return "\n\n".join([
        TAILORING_CONTRACT_BLOCK,
        TAILORING_CRAFT_BLOCK,
        strategy,
    ])


# ---------------------------------------------------------------------------
# User prompt renderer
# ---------------------------------------------------------------------------

def render_tailoring_user_prompt(
    *,
    mode_id: str,
    job_intelligence_json: str,
    original_resume_json: str,
    response_contract_json: str,
    output_language: str,
) -> str:
    """Fill runtime slots in the user shell template."""
    return TAILORING_USER_SHELL.format(
        mode_id=mode_id,
        job_intelligence=job_intelligence_json,
        original_resume=original_resume_json,
        response_contract=response_contract_json,
        output_language=output_language,
    )


# ---------------------------------------------------------------------------
# Retry hint builder
# ---------------------------------------------------------------------------

def build_tailoring_retry_hint(response_contract: TailoringResponseContract) -> str:
    return (
        'Output a JSON object with keys "summary", "experience", "projects", "skills", "bold_keywords". '
        "summary: one sentence. "
        "experience/projects: object keyed by 0-based entry index with a bullets sub-object. "
        "skills: array of {label, values} objects. "
        "bold_keywords: array of 10-20 keyword strings. "
        "Do not include personalInfo, sectionMeta, education, id, company, location, or dates. "
        "Start with { and end with }."
    )


# ---------------------------------------------------------------------------
# Prompt context builder
# ---------------------------------------------------------------------------

def _resolve_mode(prompt_id: str | None) -> str:
    """Resolve user-provided prompt_id to a valid mode key."""
    selected = prompt_id or DEFAULT_IMPROVE_PROMPT_ID
    if selected not in TAILORING_MODE_STRATEGY:
        logger.warning(
            "Unknown prompt_id '%s'; falling back to default '%s'.",
            selected,
            DEFAULT_IMPROVE_PROMPT_ID,
        )
        selected = DEFAULT_IMPROVE_PROMPT_ID
    return selected


def build_prompt_context(
    *,
    prompt_id: str | None,
    language: str,
    jd_intelligence: JDIntelligence,
    response_contract: TailoringResponseContract,
    resume_payload: TailoringResumePayload | None,
    original_resume_markdown: str,
) -> TailoringPromptContext:
    """Build the complete prompt context for a tailoring call."""

    selected_mode = _resolve_mode(prompt_id)
    output_language = get_language_name(language)

    resume_input = (
        json.dumps(resume_payload.model_dump(), separators=(',', ':'), ensure_ascii=True)
        if resume_payload is not None
        else original_resume_markdown
    )
    response_contract_json = json.dumps(
        response_contract.to_prompt_dict(),
        separators=(',', ':'),
        ensure_ascii=True,
    )

    system_prompt = assemble_tailoring_system_prompt(selected_mode)
    user_prompt = render_tailoring_user_prompt(
        mode_id=selected_mode,
        job_intelligence_json=jd_intelligence_to_prompt_json(jd_intelligence),
        original_resume_json=resume_input,
        response_contract_json=response_contract_json,
        output_language=output_language,
    )

    return TailoringPromptContext(
        prompt_id=selected_mode,
        output_language=output_language,
        response_contract_json=response_contract_json,
        job_intelligence_json=jd_intelligence_to_prompt_json(jd_intelligence),
        original_resume_json=resume_input,
        retry_hint=build_tailoring_retry_hint(response_contract),
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        used_structured_resume_input=resume_payload is not None,
    )


# ---------------------------------------------------------------------------
# Backward compatibility — old callers used render_tailoring_prompt(context)
# ---------------------------------------------------------------------------

def render_tailoring_prompt(context: TailoringPromptContext) -> str:
    """Return the user prompt from a pre-built context. Backward-compat wrapper."""
    return context.user_prompt


# ---------------------------------------------------------------------------
# Pipeline step model (Phase C prep — inert for now)
# ---------------------------------------------------------------------------

@dataclass
class PipelineStep:
    """One step in the tailoring pipeline."""

    name: str
    build_messages: Callable[..., tuple[str, str]]  # → (system_prompt, user_prompt)
    enabled: bool = True
    model_override: str | None = None
    max_tokens: int = 15000
    operation: str = "tailoring_step"
    metadata: dict[str, Any] = field(default_factory=dict)
```

**Key changes from current:**
- `TailoringPromptContext` drops `mode_constraint` and `strategy_primary_goal` (dead fields)
- Adds `user_prompt` field (pre-rendered)
- `_resolve_strategy()` is replaced by `_resolve_mode()` (simpler — just validates mode key)
- `assemble_tailoring_system_prompt()` is the central assembler
- `PipelineStep` dataclass is defined but not yet used by orchestration (Phase C)

#### 2.3.4 `apps/backend/app/services/tailoring/orchestration.py`

**Action: Update imports and prompt_id validation**

Changes needed:
1. **Remove** import of `IMPROVE_STRATEGY_GUIDANCE` — replace the `prompt_id in IMPROVE_STRATEGY_GUIDANCE` check with `prompt_id in TAILORING_MODE_STRATEGY`
2. **Update** to use `context.user_prompt` instead of calling `render_tailoring_prompt(context)` separately (both work, but be consistent)

```diff
-from app.prompts import DEFAULT_IMPROVE_PROMPT_ID, IMPROVE_STRATEGY_GUIDANCE, PROMPT_VERSIONS
+from app.prompts import DEFAULT_IMPROVE_PROMPT_ID, PROMPT_VERSIONS
+from app.prompts.templates import TAILORING_MODE_STRATEGY

...

     resolved_prompt_id = (
-        prompt_id if prompt_id in IMPROVE_STRATEGY_GUIDANCE else DEFAULT_IMPROVE_PROMPT_ID
+        prompt_id if prompt_id in TAILORING_MODE_STRATEGY else DEFAULT_IMPROVE_PROMPT_ID
     )

...

-    prompt = render_tailoring_prompt(prompt_context)
+    prompt = prompt_context.user_prompt
```

Everything else in `orchestration.py` (the `complete_json` call, response parsing, compact diff, finalize, change manifest) stays **exactly as-is**.

#### 2.3.5 `apps/backend/app/prompts/catalog_sections.py`

**Action: Update to use new block names and two modes**

```python
"""Structured breakdown of prompt templates for the read-only prompt catalog API."""

from __future__ import annotations

import re

from app.prompts.templates import (
    TAILORING_CONTRACT_BLOCK,
    TAILORING_CRAFT_BLOCK,
    TAILORING_MODE_STRATEGY,
    TAILORING_USER_SHELL,
)
from app.schemas.models import PromptCatalogSection

_SECTION_HEADER_RE = re.compile(r"(?m)^([A-Z][A-Z0-9\s&]+):\s*$")


def split_system_prompt_by_headers(
    text: str,
    *,
    intro_id: str,
    intro_label: str,
    id_prefix: str,
) -> list[PromptCatalogSection]:
    """Split a system prompt that uses ALL CAPS section headers into catalog sections."""
    t = text.strip()
    matches = list(_SECTION_HEADER_RE.finditer(t))
    out: list[PromptCatalogSection] = []
    if not matches:
        return [
            PromptCatalogSection(
                id=f"{id_prefix}_body",
                label=intro_label,
                content=t,
                policy="system",
            )
        ]

    first = matches[0].start()
    if first > 0:
        intro = t[:first].strip()
        if intro:
            out.append(
                PromptCatalogSection(
                    id=intro_id,
                    label=intro_label,
                    content=intro,
                    policy="system",
                )
            )

    for i, m in enumerate(matches):
        title = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(t)
        body = t[start:end].strip()
        slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")
        out.append(
            PromptCatalogSection(
                id=f"{id_prefix}_{slug or 'section'}",
                label=title,
                content=body,
                policy="system",
            )
        )
    return out


def build_resume_tailoring_catalog_sections() -> list[PromptCatalogSection]:
    """Logical grouping for resume tailoring (contract + craft + modes + user template)."""

    # Contract block sections
    contract_children = split_system_prompt_by_headers(
        TAILORING_CONTRACT_BLOCK,
        intro_id="tailoring_contract_role",
        intro_label="Role & goal",
        id_prefix="tailoring_contract",
    )

    # Craft block sections
    craft_children = split_system_prompt_by_headers(
        TAILORING_CRAFT_BLOCK,
        intro_id="tailoring_craft_intro",
        intro_label="Craft introduction",
        id_prefix="tailoring_craft",
    )

    # Mode strategy sections
    mode_children: list[PromptCatalogSection] = []
    labels = {"full": "Full tailor", "light": "Light touch"}
    for mode_id in ("full", "light"):
        mode_children.append(
            PromptCatalogSection(
                id=f"tailoring_mode_{mode_id}",
                label=f'Mode "{labels[mode_id]}" ({mode_id})',
                note="Selected by the user as tailoring intensity.",
                policy="user_editable_future",
                content=TAILORING_MODE_STRATEGY[mode_id],
            )
        )

    # Runtime fields
    runtime_children = [
        PromptCatalogSection(
            id="tailoring_rt_mode_id",
            label="{mode_id}",
            content="Tailoring intensity key: full | light.",
            policy="runtime_injected",
        ),
        PromptCatalogSection(
            id="tailoring_rt_job_intel",
            label="{job_intelligence}",
            content="JSON from JD analysis (role, keywords, themes, etc.).",
            policy="runtime_injected",
        ),
        PromptCatalogSection(
            id="tailoring_rt_resume",
            label="{original_resume}",
            content="Structured resume JSON or markdown snapshot for this run.",
            policy="runtime_injected",
        ),
        PromptCatalogSection(
            id="tailoring_rt_contract",
            label="{response_contract}",
            content="JSON contract describing allowed response shape for this resume.",
            policy="runtime_injected",
        ),
        PromptCatalogSection(
            id="tailoring_rt_language",
            label="{output_language}",
            content="Human-readable language name from the user's content-language setting.",
            policy="runtime_injected",
        ),
    ]

    return [
        PromptCatalogSection(
            id="tailoring_contract_block",
            label="Contract block (calibrated)",
            note="Output schema and JSON rules. Change rarely — requires tests.",
            policy="system",
            children=contract_children,
        ),
        PromptCatalogSection(
            id="tailoring_craft_block",
            label="Craft block (experimental)",
            note="Voice, ATS, writing quality rules. Safe to iterate.",
            policy="user_editable_future",
            children=craft_children,
        ),
        PromptCatalogSection(
            id="tailoring_mode_strategies",
            label="Mode strategies",
            note="One mode strategy is selected per run.",
            policy="user_editable_future",
            children=mode_children,
        ),
        PromptCatalogSection(
            id="tailoring_user_message",
            label="User message template",
            note="Template with runtime slots. Structure shared across runs.",
            policy="user_editable_future",
            children=[
                PromptCatalogSection(
                    id="tailoring_user_template",
                    label="User shell template",
                    content=TAILORING_USER_SHELL,
                    policy="user_editable_future",
                ),
                PromptCatalogSection(
                    id="tailoring_runtime_fields",
                    label="Runtime-injected fields",
                    note="Not part of static templates; assembled when a tailoring job runs.",
                    policy="runtime_injected",
                    children=runtime_children,
                ),
            ],
        ),
    ]
```

#### 2.3.6 `apps/backend/app/routers/config.py`

**Action: Update catalog builder imports**

```diff
 from app.prompts.templates import (
     ...
-    IMPROVE_RESUME_PROMPT,
+    TAILORING_USER_SHELL,
     ...
-    TAILORING_SYSTEM_PROMPT,
+    TAILORING_CONTRACT_BLOCK,
+    TAILORING_CRAFT_BLOCK,
+    TAILORING_MODE_STRATEGY,
 )
```

In `_get_prompt_catalog()`, update the `resume_generate_full` entry:

```diff
         PromptCatalogEntry(
             id="resume_generate_full",
             operation="resume_tailoring",
             version=PROMPT_VERSIONS.get("tailoring_user"),
-            system_prompt=TAILORING_SYSTEM_PROMPT,
-            user_prompt=IMPROVE_RESUME_PROMPT,
+            system_prompt="\n\n".join([TAILORING_CONTRACT_BLOCK, TAILORING_CRAFT_BLOCK, TAILORING_MODE_STRATEGY["full"]]),
+            user_prompt=TAILORING_USER_SHELL,
             sections=build_resume_tailoring_catalog_sections(),
         ),
```

#### 2.3.7 `apps/backend/app/services/tailoring/models.py`

**Action: Add `extensions` field to `TailoringResponseContract`**

```diff
 class TailoringResponseContract(BaseModel):
     """Compact JSON contract that defines the expected LLM response shape."""

     model_config = ConfigDict(extra="forbid")

     schema_version: str = "tailoring_resume_v3"
     prompt_mode: str
     top_level_keys: list[str] = Field(
         default_factory=lambda: list(TAILORING_RESPONSE_TOP_LEVEL_KEYS)
     )
     mode_rules: list[str] = Field(default_factory=list)
     sections: dict[str, TailoringSectionContract] = Field(default_factory=dict)
+    extensions: dict[str, Any] = Field(default_factory=dict)

     # Compact address data — populated by build_response_contract
     experience_entries: list[str] = Field(default_factory=list)
```

Also update `model_config` to allow the new field:
The `extra="forbid"` on the model will naturally accept the new field since it's declared. No config change needed.

### 2.4 Verification — Phase A

**Golden-file test:** Before and after the refactor, capture the assembled system+user prompt for `mode="full"` with a known resume and JD. The output must be **byte-identical**.

Steps:
1. Before any code changes, add a temporary test that calls `build_prompt_context()` and `render_tailoring_prompt()` with fixture data, writes the system and user strings to files
2. After all Phase A changes, run the same test. Compare files. Must match exactly.

Why this works: In Phase A, the assembled system prompt for `full` mode is `CONTRACT_BLOCK + CRAFT_BLOCK + MODE_STRATEGY["full"]`. The concatenation of these three blocks must equal the original `TAILORING_SYSTEM_PROMPT` byte-for-byte (with `\n\n` separators matching).

> [!WARNING]  
> The one deliberate diff is the user message: `MODE: {mode_id} — {mode_constraint}` becomes `MODE: {mode_id}`. This is a **minor** change and is acceptable because the mode strategy is now in the system message. If you need perfect byte-match for Phase A, keep the old `MODE:` line format and defer the simplification to Phase B.

**Recommendation:** Keep the `MODE:` line change in Phase A. The mode constraint text is now in the system message and is longer/richer. The one-line simplification in the user message is safe.

---

## 3. Phase B — Two modes + JD extraction in pipeline

> **Goal:** User-visible mode change. Replace three modes with two. Wire JD intelligence extraction as a named pipeline step.

### 3.1 Task Checklist — Phase B

```
- [x] B1. Ensure backend accepts "full" and "light" as prompt_id values
- [x] B2. Ensure backend rejects old "nudge" and "keywords" with fallback to "full"
- [x] B3. Add prompt_id migration in config loading (stored "keywords"→"full", "nudge"→"light")
- [x] B4. Update frontend mode picker (if applicable — check frontend code)
- [x] B5. Test light mode with 3 real resumes
- [x] B6. Test full mode with 3 real resumes
- [x] B7. Update llm-prompt-composition.md documentation
- [x] B8. Add JD extraction step definition (PipelineStep for extract_jd_intelligence)
```

### 3.2 Backend prompt_id migration

In `apps/backend/app/routers/config.py` — update `_resolve_prompt_id`:

```python
_PROMPT_ID_MIGRATION = {
    "nudge": "light",
    "keywords": "full",
}

def _resolve_prompt_id(value: str | None, option_ids: set[str]) -> str:
    if value in option_ids:
        return value
    migrated = _PROMPT_ID_MIGRATION.get(value)
    if migrated in option_ids:
        return migrated
    return DEFAULT_IMPROVE_PROMPT_ID
```

Same migration logic in `apps/backend/app/routers/resumes.py` — `_resolve_prompt_id`:

```python
_PROMPT_ID_MIGRATION = {
    "nudge": "light",
    "keywords": "full",
}

def _resolve_prompt_id(request_prompt_id: str | None) -> str:
    option_ids = {option["id"] for option in IMPROVE_PROMPT_OPTIONS}
    if request_prompt_id in option_ids:
        return request_prompt_id
    migrated = _PROMPT_ID_MIGRATION.get(request_prompt_id)
    if migrated in option_ids:
        return migrated

    generation_defaults = _get_generation_defaults_config()
    generation_default_prompt = generation_defaults.get("prompt_id")
    # Also migrate defaults
    migrated_default = _PROMPT_ID_MIGRATION.get(generation_default_prompt, generation_default_prompt)
    if migrated_default in option_ids:
        return migrated_default

    return _get_default_prompt_id()
```

### 3.3 Documentation update — `docs/prompts/llm-prompt-composition.md`

Update section 1 ("three modes") to "two modes":
- Replace "nudge / keywords / full" with "full / light"
- Update mermaid diagrams
- Reference the new block model

---

## 4. Phase C — Pipeline runner + model override

> **Goal:** Wrap the tailoring call in a pipeline runner. Add JD extraction as step 0. Enable per-step model override. Default pipeline: two steps (JD extract + primary tailor).

### 4.1 Task Checklist — Phase C

```
- [x] C1. Add run_tailoring_pipeline() function in orchestration.py
- [x] C2. Define default TAILORING_PIPELINE list with two steps
- [x] C3. Add _resolve_step_config() helper for model override
- [x] C4. Wire generate_tailored_resume() to use pipeline runner
- [x] C5. Add future-step placeholder (critic) with enabled=False
- [x] C6. Test pipeline runner produces identical output to current
- [x] C7. Test model_override config path (unit test with mock)
```

### 4.2 Pipeline runner implementation

Add to `orchestration.py`:

```python
from app.prompts.templates import TAILORING_MODE_STRATEGY
from app.services.tailoring.prompting import PipelineStep

async def _resolve_step_config(
    model_override: str | None,
    base_config: LLMConfig | None = None,
) -> LLMConfig | None:
    """Clone global config with model override for a specific pipeline step."""
    if model_override is None:
        return base_config
    from app.llm import LLMConfig, get_router
    _, config = get_router(base_config)
    return LLMConfig(
        provider=config.provider,
        model=model_override,
        api_key=config.api_key,
        api_base=config.api_base,
        ai_route=config.ai_route,
    )
```

The pipeline runner wraps the existing `complete_json` call. For v1, it's a thin wrapper — the existing `generate_tailored_resume` function stays as the entry point, but internally uses the pipeline concept.

### 4.3 Pipeline step definitions

```python
# In prompting.py or a new pipeline.py module

def build_jd_extraction_messages(job_description: str) -> tuple[str, str]:
    """Build system + user messages for JD intelligence extraction."""
    from app.prompts.templates import (
        EXTRACT_JD_INTELLIGENCE_PROMPT,
        JD_INTELLIGENCE_CONTRACT_BLOCK,
    )
    from app.services.prompt_utils import sanitize_user_input
    sanitized = sanitize_user_input(job_description)
    return (
        JD_INTELLIGENCE_CONTRACT_BLOCK,
        EXTRACT_JD_INTELLIGENCE_PROMPT.format(job_description=sanitized),
    )

DEFAULT_TAILORING_PIPELINE = [
    PipelineStep(
        name="jd_intelligence",
        build_messages=build_jd_extraction_messages,
        operation="job_extract_keywords",
        max_tokens=4096,
    ),
    PipelineStep(
        name="primary_tailor",
        build_messages=lambda ctx: (ctx.system_prompt, ctx.user_prompt),
        operation="resume_generate_full",
        max_tokens=15000,
    ),
    # Future steps — disabled by default:
    # PipelineStep(
    #     name="critic",
    #     build_messages=build_critic_messages,
    #     enabled=False,
    #     model_override="gpt-4o-mini",
    #     max_tokens=4096,
    #     operation="tailoring_critic",
    # ),
]
```

> [!NOTE]
> For Phase C v1, the pipeline runner does NOT change the actual flow. JD extraction already happens separately in the router layer before `generate_tailored_resume` is called. Defining it as a pipeline step is a **structural** change for future composability. The actual execution order stays the same.

---

## 5. Testing Strategy

### 5.1 Phase A tests

| Test | Type | What it verifies |
|------|------|-----------------|
| **Golden-file prompt match** | Unit | Assembled system+user prompt for `full` mode equals pre-refactor output |
| **Import smoke test** | Unit | Backward-compat aliases (`TAILORING_SYSTEM_PROMPT`, `TAILORING_MODE_CONSTRAINTS`, `IMPROVE_RESUME_PROMPT`) resolve without error |
| **Mode resolution** | Unit | `_resolve_mode("full")` → `"full"`, `_resolve_mode("light")` → `"light"`, `_resolve_mode("garbage")` → `"full"` (default) |
| **Assembler content** | Unit | `assemble_tailoring_system_prompt("full")` contains CONTRACT text, CRAFT text, and full strategy text |
| **Assembler content (light)** | Unit | `assemble_tailoring_system_prompt("light")` contains "Light touch" and "Do NOT change job titles" |
| **User shell placeholders** | Unit | `render_tailoring_user_prompt()` fills all `{...}` placeholders without KeyError |
| **Catalog API** | Integration | `GET /config/prompts/catalog` returns entries with new block IDs (`tailoring_contract_block`, etc.) |
| **Response contract extensions** | Unit | `TailoringResponseContract` accepts `extensions={"future_key": True}` |
| **Existing orchestration** | Integration | Full `generate_tailored_resume()` flow with fixture data returns valid `TailoringResult` |

### 5.2 Phase B tests

| Test | Type | What it verifies |
|------|------|-----------------|
| **Old mode migration** | Unit | `_resolve_prompt_id("keywords", ...)` → `"full"`, `"nudge"` → `"light"` |
| **API rejects invalid** | Integration | `PUT /config/generation-defaults` with `prompt_id="keywords"` → falls back to `"full"` (no 400 error — graceful migration) |
| **Light mode output** | Manual | Run 3 real resumes with `prompt_id="light"`. Verify: titles unchanged, minimal bullet rewrites, original voice preserved |
| **Full mode output** | Manual | Run 3 real resumes with `prompt_id="full"`. Verify: comprehensive rewriting, title enhancements, skill regrouping |
| **Prompt options API** | Integration | `GET /config/prompts` returns exactly 2 options: `full` and `light` |

### 5.3 Phase C tests

| Test | Type | What it verifies |
|------|------|-----------------|
| **Pipeline runner** | Unit | `run_tailoring_pipeline` with single enabled step produces same output as direct call |
| **Model override** | Unit | `_resolve_step_config("gpt-4o-mini")` returns config with overridden model |
| **Disabled step skip** | Unit | Step with `enabled=False` is not executed |

### 5.4 Running tests

```bash
# From apps/backend/
python -m pytest tests/ -v --tb=short

# Specific test files (add as created)
python -m pytest tests/test_prompt_blocks.py -v
python -m pytest tests/test_prompt_assembly.py -v
python -m pytest tests/test_mode_migration.py -v
```

---

## 6. File Change Index

Complete list of every file touched, grouped by phase.

### Phase A files

| File | Action | Lines affected |
|------|--------|---------------|
| `app/prompts/templates.py` | **Major edit** | L3-16 (versions), L130-274 (tailoring section), add JD blocks near L67 |
| `app/prompts/__init__.py` | **Rewrite** | Full file (50 lines) — update exports |
| `app/prompts/catalog_sections.py` | **Rewrite** | Full file (189 lines) — new block structure |
| `app/services/tailoring/prompting.py` | **Rewrite** | Full file (117 lines) — new assembler, new context |
| `app/services/tailoring/orchestration.py` | **Minor edit** | L11 (imports), L74 (prompt_id validation), L91 (use user_prompt) |
| `app/services/tailoring/models.py` | **Minor edit** | Add `extensions` field to `TailoringResponseContract` (~L467) |
| `app/routers/config.py` | **Minor edit** | L55-70 (imports), L236-241 (catalog entry) |

### Phase B files

| File | Action | Lines affected |
|------|--------|---------------|
| `app/routers/config.py` | **Minor edit** | `_resolve_prompt_id` function (~L288) — add migration dict |
| `app/routers/resumes.py` | **Minor edit** | `_resolve_prompt_id` function (~L114) — add migration dict |
| `docs/prompts/llm-prompt-composition.md` | **Rewrite sections 1, 8** | Update mode references |

### Phase C files

| File | Action | Lines affected |
|------|--------|---------------|
| `app/services/tailoring/orchestration.py` | **Minor edit** | Add `_resolve_step_config()` helper, optional pipeline wrapper |

### Files NOT touched (confirm unchanged)

- `app/prompts/enrichment.py` — out of scope
- `app/prompts/refinement.py` — out of scope
- `app/services/tailoring/analysis.py` — JD extraction code stays as-is; only its prompt constants get split
- `app/services/tailoring/contracts.py` — no changes
- `app/services/tailoring/models.py` — only the `extensions` field addition
- `app/services/tailoring/preservation.py` — no changes
- `app/services/tailoring/diffing.py` — no changes
- `app/services/tailoring/verification.py` — no changes
- `app/services/tailoring/change_manifest.py` — no changes
- `app/services/refiner.py` — no changes
- `app/services/parser.py` — no changes
- `app/services/cover_letter.py` — no changes
- `app/services/application_questions.py` — no changes
- `app/llm.py` — no changes

---

## 7. Migration Checklist

Execute phases in order. Do not skip steps.

### Pre-flight

```
- [x] Read the parent design doc (phase-3.7.1) to understand the why
- [x] Read this doc fully before writing any code
- [x] Ensure all existing tests pass before starting
- [x] Create a feature branch: git checkout -b feat/prompt-schema-redesign
```

### Phase A execution order

```
- [x] A1. Edit app/prompts/templates.py — add new block constants
- [x] A2. Edit app/prompts/templates.py — add backward-compat aliases
- [x] A3. Edit app/prompts/templates.py — update PROMPT_VERSIONS
- [x] A4. Edit app/prompts/templates.py — update IMPROVE_PROMPT_OPTIONS and DEFAULT
- [x] A5. Edit app/prompts/__init__.py — update exports
- [x] A6. Rewrite app/services/tailoring/prompting.py — new assembler
- [x] A7. Edit app/services/tailoring/orchestration.py — update imports
- [x] A8. Rewrite app/prompts/catalog_sections.py — new block model
- [x] A9. Edit app/routers/config.py — update catalog imports and entry
- [x] A10. Edit app/services/tailoring/models.py — add extensions field
- [x] A11. Run all existing tests: python -m pytest tests/ -v
- [x] A12. Write and run golden-file verification test
- [x] A13. Manual smoke test: start server, hit /config/prompts/catalog, verify blocks appear
```

### Phase B execution order

```
- [x] B1. Edit app/routers/config.py — add _PROMPT_ID_MIGRATION dict
- [x] B2. Edit app/routers/resumes.py — add _PROMPT_ID_MIGRATION dict
- [x] B3. Run prompt resolution tests
- [x] B4. Manual test: run a resume with prompt_id="full" 
- [x] B5. Manual test: run a resume with prompt_id="light"
- [x] B6. Manual test: run with old prompt_id="keywords" — should map to "full"
- [x] B7. Update docs/prompts/llm-prompt-composition.md
- [x] B8. Run all tests
```

### Phase C execution order

```
- [x] C1. Add PipelineStep and pipeline definitions to prompting.py (already done in A6)
- [x] C2. Add _resolve_step_config() to orchestration.py
- [x] C3. Add pipeline step for JD extraction (structural only — actual flow unchanged)
- [x] C4. Write unit test for pipeline runner
- [x] C5. Run all tests
```

### Post-flight

```
- [x] All tests pass
- [x] Server starts without errors
- [x] /config/prompts returns 2 options (full, light)
- [x] /config/prompts/catalog shows new block structure
- [x] Resume tailoring with full mode produces valid output
- [x] Resume tailoring with light mode produces conservative output
- [x] Old prompt_id values are gracefully migrated
- [x] Commit and PR
```

---

## Appendix A: Constants reference table

Quick lookup for the implementing model — "where does this old name map to?"

| Old constant | New constant | Location |
|-------------|-------------|----------|
| `TAILORING_SYSTEM_PROMPT` | Backward-compat alias → concat of 3 blocks | `templates.py` |
| `TAILORING_MODE_CONSTRAINTS` | `TAILORING_MODE_STRATEGY` (dict, same structure) | `templates.py` |
| `IMPROVE_STRATEGY_GUIDANCE` | **Deleted** (no re-export) | — |
| `IMPROVE_RESUME_PROMPT_TEMPLATE` | `TAILORING_USER_SHELL` (alias kept) | `templates.py` |
| `IMPROVE_RESUME_PROMPT` | Alias → `TAILORING_USER_SHELL` | `templates.py` |
| `DEFAULT_IMPROVE_PROMPT_ID` | Same name, value changed: `"keywords"` → `"full"` | `templates.py` |
| `IMPROVE_PROMPT_OPTIONS` | Same name, 2 items instead of 3 | `templates.py` |
| `EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT` | `JD_INTELLIGENCE_CONTRACT_BLOCK` (alias kept) | `templates.py` |

## Appendix B: Import dependency graph

```
templates.py  ←── __init__.py  ←── prompting.py  ←── orchestration.py
                                                  ←── config.py (catalog)
                                                  ←── resumes.py
               ←── catalog_sections.py ←── config.py
```

All imports flow **inward** from routers → services → prompts. No circular dependencies. The refactor does not change this graph.

## Appendix C: What the model sees — assembled prompt examples

### Full mode — system message

```
You are a senior resume strategist. Your single goal: craft a resume that earns the interview call.

OUTPUT FORMAT:
[... contract block ...]

APPROACH:
[... craft block ...]

WRITING STANDARDS:
[... craft block continued ...]

ATS OPTIMIZATION:
[... craft block continued ...]

TAILORING MODE: Full edit (maximum alignment)
[... mode strategy ...]
```

### Light mode — system message

Same CONTRACT + CRAFT blocks, but different final section:

```
[... contract block ...]

[... craft block ...]

TAILORING MODE: Light touch (conservative alignment)
- Improve wording and weave in a few high-priority keywords. Keep the original voice nearly intact.
- Do NOT change job titles. Do NOT add scope, platform, or domain qualifiers to titles.
[... etc ...]
```

### User message (both modes)

```
Tailor this resume for the target role.

MODE: full

REWRITING EXAMPLE:
Original: "Worked on backend systems"
[...]

JOB INTELLIGENCE:
{"role":{"title":"Senior Software Engineer",...},...}

MASTER RESUME:
{"summary":"...","workExperience":[...],...}

RESPONSE CONTRACT:
{"mode":"full","output_keys":["summary","experience","projects","skills","bold_keywords"],...}

Output language: English
```

---

*End of technical implementation plan.*
