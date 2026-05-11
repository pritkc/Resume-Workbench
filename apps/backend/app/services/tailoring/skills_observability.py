"""Deterministic skills diff metadata for UI, QA, and training (not stored on RenderCV payloads)."""

from __future__ import annotations

from typing import Any


SKILLS_OBSERVABILITY_VERSION = 1


def _norm_groups_lookup(resume: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Normalize skills block and return (group_by_id, ordered_ids)."""

    from app.services.additional_groups import normalize_skill_groups

    block = resume.get("skills") or resume.get("additional") or {}
    normalized = normalize_skill_groups(block, seed_defaults_if_empty=False)
    groups = normalized.get("groups") or []
    by_id: dict[str, dict[str, Any]] = {}
    ordered: list[str] = []
    if not isinstance(groups, list):
        return by_id, ordered
    for g in groups:
        if not isinstance(g, dict):
            continue
        gid = str(g.get("id") or "").strip()
        if not gid:
            continue
        by_id[gid] = g
        ordered.append(gid)
    return by_id, ordered


def _string_values(raw: Any) -> list[str]:
    from app.services.additional_groups import coerce_string_list

    return [str(v).strip() for v in coerce_string_list(raw or []) if str(v).strip()]


def _tag_applied_vs_baseline(
    baseline_vals: list[str],
    applied_vals: list[str],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Return per-applied-slot tags and removed baseline texts (unmatched).

    Matching prefers same-index pairs, then greedy first-available same-text remainder.
    """
    base_used = [False] * len(baseline_vals)
    applied_rows: list[dict[str, Any]] = []

    for ai, text in enumerate(applied_vals):
        cf = text.casefold()
        matched = False
        if ai < len(baseline_vals) and not base_used[ai] and baseline_vals[ai].casefold() == cf:
            base_used[ai] = True
            applied_rows.append({"text": text, "change_tag": "unchanged"})
            matched = True
        if matched:
            continue
        pick: int | None = None
        for bi, btxt in enumerate(baseline_vals):
            if base_used[bi]:
                continue
            if btxt.casefold() == cf:
                pick = bi
                break
        if pick is None:
            applied_rows.append({"text": text, "change_tag": "added"})
        else:
            base_used[pick] = True
            applied_rows.append({"text": text, "change_tag": "moved"})

    removed = [baseline_vals[j] for j in range(len(baseline_vals)) if not base_used[j]]
    return applied_rows, removed


def build_skills_observability_v1(
    baseline_resume: dict[str, Any] | None,
    tailored_resume: dict[str, Any] | None,
    llm_skill_groups: list[Any] | None,
    *,
    ordered_group_ids: list[str],
) -> dict[str, Any] | None:
    """Produce a sparse skills observability projection.

    Groups align with ``ordered_group_ids`` (response-contract order). LLM ``why`` fields
    are merged when present on the compact skills grid.
    """
    if not ordered_group_ids:
        return None
    if baseline_resume is None and tailored_resume is None:
        return None

    base_by, _ = _norm_groups_lookup(baseline_resume or {})
    app_by, _ = _norm_groups_lookup(tailored_resume or {})

    out_groups: list[dict[str, Any]] = []

    for gi, group_id in enumerate(ordered_group_ids):
        gid = str(group_id or "").strip()
        if not gid:
            continue

        base_g = base_by.get(gid) or {}
        app_g = app_by.get(gid) or {}

        baseline_vals = _string_values(base_g.get("values"))
        applied_vals = _string_values(app_g.get("values"))

        tagged, removed_txt = _tag_applied_vs_baseline(baseline_vals, applied_vals)

        group_why: str | None = None
        if llm_skill_groups and gi < len(llm_skill_groups):
            raw_g = llm_skill_groups[gi]
            lw = getattr(getattr(raw_g, "label", None), "why", None)
            if isinstance(lw, str) and lw.strip():
                group_why = lw.strip()

        value_rows: list[dict[str, Any]] = [dict(row) for row in tagged]

        removed_rows = [{"text": t, "change_tag": "removed"} for t in removed_txt]

        group_label = str(app_g.get("label") or base_g.get("label") or "").strip()

        out_groups.append(
            {
                "group_id": gid,
                "group_label": group_label or gid,
                "group_why": group_why,
                "values": value_rows,
                "removed": removed_rows,
            }
        )

    if not out_groups:
        return None

    return {"version": SKILLS_OBSERVABILITY_VERSION, "groups": out_groups}
