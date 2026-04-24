"""Structured breakdown of tailoring prompts for the prompt catalog API."""

from __future__ import annotations

import re

from app.prompts.tailoring_blocks import (
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
            id="tailoring_rt_mode_id",
            label="{mode_id}",
            content="Tailoring intensity key: full | lite.",
            policy="runtime_injected",
        ),
        PromptCatalogSection(
            id="tailoring_rt_job_intel",
            label="{extract_jd_intel_output}",
            content="JSON from extract_jd_intel (role, keywords, themes, etc.).",
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
    ]

    return [
        PromptCatalogSection(
            id="tailoring_craft_block",
            label="Craft block (role, voice, ATS, tailoring approach)",
            note="Narrative instructions and writing standards. Shipped: apps/backend/app/prompts/text/fragments/tailoring_craft.txt",
            policy="user_editable_future",
            children=craft_children,
        ),
        PromptCatalogSection(
            id="tailoring_mode_strategies",
            label="Mode strategies",
            note="One mode strategy is selected per run. Shipped: text/fragments/tailoring_mode_full.txt and tailoring_mode_lite.txt",
            policy="user_editable_future",
            children=mode_children,
        ),
        PromptCatalogSection(
            id="tailoring_contract_block",
            label="Resume diff output (strict JSON schema)",
            note="Keys and shapes only. Shipped: apps/backend/app/prompts/text/fragments/resume_diff_output.txt — change rarely; requires tests.",
            policy="system",
            children=contract_children,
        ),
        PromptCatalogSection(
            id="tailoring_user_message",
            label="User message template",
            note="Template with runtime slots. Shipped: apps/backend/app/prompts/text/fragments/tailoring_user_shell.txt",
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
