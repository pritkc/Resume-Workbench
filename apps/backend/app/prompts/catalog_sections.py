"""Structured breakdown of prompt templates for the read-only prompt catalog API."""

from __future__ import annotations

import re

from app.prompts.templates import (
    IMPROVE_RESUME_PROMPT_TEMPLATE,
    IMPROVE_STRATEGY_GUIDANCE,
    TAILORING_MODE_CONSTRAINTS,
    TAILORING_SYSTEM_PROMPT,
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
    """Logical grouping for resume tailoring (system + user template + mode bundles + runtime)."""
    system_children = split_system_prompt_by_headers(
        TAILORING_SYSTEM_PROMPT,
        intro_id="tailoring_role_goal",
        intro_label="Role & goal",
        id_prefix="tailoring_system",
    )

    mode_children: list[PromptCatalogSection] = []
    labels = {"nudge": "Light nudge", "keywords": "Keyword enhance", "full": "Full tailor"}
    for mode_id in ("nudge", "keywords", "full"):
        g = IMPROVE_STRATEGY_GUIDANCE[mode_id]
        mode_children.append(
            PromptCatalogSection(
                id=f"tailoring_mode_{mode_id}",
                label=f'Mode "{labels[mode_id]}" ({mode_id})',
                note="Selected by the user as tailoring intensity; MODE line picks this bundle.",
                policy="user_choice",
                children=[
                    PromptCatalogSection(
                        id=f"tailoring_mode_{mode_id}_intensity",
                        label="Intensity constraint (MODE line)",
                        content=TAILORING_MODE_CONSTRAINTS[mode_id],
                        policy="system",
                    ),
                    PromptCatalogSection(
                        id=f"tailoring_mode_{mode_id}_primary_goal",
                        label="Strategy — primary goal",
                        content=g["primary_goal"],
                        policy="system",
                    ),
                    PromptCatalogSection(
                        id=f"tailoring_mode_{mode_id}_description_rule",
                        label="Strategy — bullet rewrite rule",
                        content=g["description_rule"],
                        policy="system",
                    ),
                ],
            )
        )

    user_children = [
        PromptCatalogSection(
            id="tailoring_user_template",
            label="User message template",
            note="Placeholders are filled per request; structure is shared across runs.",
            policy="user_editable_future",
            content=IMPROVE_RESUME_PROMPT_TEMPLATE,
        ),
        PromptCatalogSection(
            id="tailoring_mode_bundles",
            label="Per-mode sub-prompts",
            note="Exactly one mode bundle is woven into the template for each run.",
            policy="user_choice",
            children=mode_children,
        ),
        PromptCatalogSection(
            id="tailoring_runtime_fields",
            label="Runtime-injected fields",
            note="Not part of static templates; assembled when a tailoring job runs.",
            policy="runtime_injected",
            children=[
                PromptCatalogSection(
                    id="tailoring_rt_mode_id",
                    label="{mode_id}",
                    content="Tailoring intensity key: nudge | keywords | full.",
                    policy="runtime_injected",
                ),
                PromptCatalogSection(
                    id="tailoring_rt_mode_constraint",
                    label="{mode_constraint}",
                    content="Resolved from TAILORING_MODE_CONSTRAINTS for the selected mode.",
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
                    content="Human-readable language name from the user’s content-language setting.",
                    policy="runtime_injected",
                ),
            ],
        ),
    ]

    return [
        PromptCatalogSection(
            id="tailoring_system_message",
            label="System message",
            note="Single system prompt for all tailoring modes.",
            policy="system",
            children=system_children,
        ),
        PromptCatalogSection(
            id="tailoring_user_message",
            label="User message",
            note="Template plus mode-specific copy and runtime data.",
            policy="user_editable_future",
            children=user_children,
        ),
    ]

