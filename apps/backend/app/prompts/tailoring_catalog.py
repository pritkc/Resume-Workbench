"""Structured breakdown of tailoring prompts for the prompt catalog API."""

from __future__ import annotations

import re

from app.prompts.tailoring_blocks import (
    TAILORING_CONTENT_RULES_BLOCK,
    TAILORING_CONTRACT_BLOCK,
    TAILORING_CRAFT_BLOCK,
    TAILORING_MODE_STRATEGY,
    TAILORING_USER_SHELL_FULL,
    TAILORING_USER_SHELL_LITE,
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
    contract_children = split_system_prompt_by_headers(
        TAILORING_CONTRACT_BLOCK,
        intro_id="tailoring_contract_role",
        intro_label="Role & goal",
        id_prefix="tailoring_contract",
    )

    craft_children = split_system_prompt_by_headers(
        TAILORING_CRAFT_BLOCK,
        intro_id="tailoring_craft_intro",
        intro_label="Craft introduction",
        id_prefix="tailoring_craft",
    )

    mode_children: list[PromptCatalogSection] = []
    labels = {"full": "Full tailor", "lite": "Light touch"}
    for mode_id in ("full", "lite"):
        mode_children.append(
            PromptCatalogSection(
                id=f"tailoring_mode_{mode_id}",
                label=f'Mode "{labels[mode_id]}" ({mode_id})',
                note="Selected by the user as tailoring intensity.",
                policy="user_editable_future",
                content=TAILORING_MODE_STRATEGY[mode_id],
            )
        )

    runtime_children = [
        PromptCatalogSection(
            id="tailoring_rt_job_intel",
            label="{jd_intel}",
            content="Section-header JD INTEL text, or compact legacy JSON text for older cached rows.",
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
            label="{output_template}",
            content="Section-header output template generated from the current resume contract.",
            policy="runtime_injected",
        ),
        PromptCatalogSection(
            id="tailoring_rt_content_rules",
            label="{content_rules}",
            content="Section-header-compatible resume content rules: locks, ATS, skills, writing policy, claim calibration, and banned patterns.",
            policy="runtime_injected",
        ),
        PromptCatalogSection(
            id="tailoring_rt_resume_diff_rules",
            label="{resume_diff_rules}",
            content="Legacy compact JSON schema still used by critique/rewrite fallback prompts.",
            policy="runtime_injected",
        ),
    ]

    return [
        PromptCatalogSection(
            id="tailoring_craft_block",
            label="Craft block (role, voice, ATS, tailoring approach)",
            note="PRIMARY RUN RULES — full tailor only. Primary tailoring fills a section-header output template.",
            policy="user_editable_future",
            children=craft_children,
        ),
        PromptCatalogSection(
            id="tailoring_mode_strategies",
            label="Mode strategies",
            note='Full mode has no "TAILORING MODE:" slice in shipped system.txt (empty here). Lite: text/tailor_resume_lite/system.txt from TAILORING MODE: onward.',
            policy="user_editable_future",
            children=mode_children,
        ),
        PromptCatalogSection(
            id="tailoring_contract_block",
            label="Resume output template",
            note="Injected at runtime as $output_template. The model returns section-header text, which the backend parses into the compact diff.",
            policy="user_editable_future",
            children=contract_children,
        ),
        PromptCatalogSection(
            id="tailoring_content_rules_block",
            label="Resume content rules",
            note="Injected at runtime as $content_rules. Restores the original non-JSON writing, ATS, locks, calibration, and banned-pattern guidance for section-header output.",
            policy="user_editable_future",
            content=TAILORING_CONTENT_RULES_BLOCK,
        ),
        PromptCatalogSection(
            id="tailoring_user_message",
            label="User message templates",
            note="Full vs lite use different shipped shells. Full: text/tailor_resume_full/user.txt · Lite: text/tailor_resume_lite/user.txt",
            policy="user_editable_future",
            children=[
                PromptCatalogSection(
                    id="tailoring_user_template_full",
                    label="User shell (full tailor)",
                    content=TAILORING_USER_SHELL_FULL,
                    policy="user_editable_future",
                ),
                PromptCatalogSection(
                    id="tailoring_user_template_lite",
                    label="User shell (lite tailor)",
                    content=TAILORING_USER_SHELL_LITE,
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
