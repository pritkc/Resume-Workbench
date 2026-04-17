"""Assemble Prompt Manager catalog rows (entries + shared rules)."""

from __future__ import annotations

from types import ModuleType

from app.config import get_step_model
from app.llm import get_llm_config
from app.prompts import (
    VALID_STEPS,
    get_prompt,
    has_override,
    has_shared_rules_override,
    load_override,
    load_shared_rules_override,
)
from app.prompts._prompt_loader import has_composer_override, load_composer_override
from app.prompts._rules import resume_diff as resume_diff_mod
from app.schemas.models import PromptComposerResponse, PromptManagerEntry, PromptVariable, SharedRuleEntry


def _pipeline_value(mod: ModuleType) -> str:
    raw = getattr(mod, "PIPELINE", "standalone")
    if raw in ("full", "lite", "standalone"):
        return raw
    return "standalone"


def _probe_system_message(step_name: str) -> str:
    """Effective system string (respects composer, legacy overrides, shared rules)."""
    mod = get_prompt(step_name)
    if step_name == "parse_resume":
        s, _ = mod.build_messages("probe", schema="{}")
        return s
    if step_name == "extract_jd_intel":
        s, _ = mod.build_messages("probe")
        return s
    if step_name in ("tailor_resume_full", "tailor_resume_lite"):
        s, _ = mod.build_messages(
            original_resume="{}",
            job_intelligence="{}",
            response_contract="{}",
            output_language="English",
        )
        return s
    if step_name == "critique_resume":
        s, _ = mod.build_messages("{}", "{}")
        return s
    if step_name == "rewrite_resume":
        s, _ = mod.build_messages(
            original_resume="{}",
            draft_resume="{}",
            critique="{}",
            jd_intelligence="{}",
            response_contract="{}",
        )
        return s
    if step_name == "cover_letter":
        s, _ = mod.build_messages(
            job_target="{}",
            job_description="probe",
            resume_profile="{}",
            output_language="English",
        )
        return s
    if step_name == "answer_questions":
        s, _ = mod.build_messages(
            job_target="{}",
            job_description="probe",
            resume_profile="{}",
            tailored_resume_context="{}",
            questions="[]",
        )
        return s
    raise ValueError(f"Unknown step for probe: {step_name}")


def _user_template_shipped(mod: ModuleType) -> str:
    return str(getattr(mod, "USER_TEMPLATE", getattr(mod, "DATA_TEMPLATE", "")))


def _resolved_rules(step_name: str, mod: ModuleType) -> tuple[str, bool, str | None]:
    """Rules body, whether any override applies, and shared-adapter name when used in UI."""
    rules_def = str(getattr(mod, "RULES", ""))
    rules_src = getattr(mod, "RULES_SOURCE", None)
    step_rules = load_override(step_name, "rules")

    if rules_src:
        rs = str(rules_src)
        cur = step_rules or load_shared_rules_override(rs) or rules_def
        ov = bool(step_rules) or has_shared_rules_override(rs)
        return cur, ov, rs

    legacy = {"extract_jd_intel": "jd_intel", "critique_resume": "critique"}
    if step_name in legacy:
        ln = legacy[step_name]
        leg = load_shared_rules_override(ln)
        cur = step_rules or leg or rules_def
        ov = bool(step_rules) or has_shared_rules_override(ln)
        return cur, ov, None

    cur = step_rules or rules_def
    ov = bool(step_rules)
    return cur, ov, None


def _system_shipped(mod: ModuleType) -> str:
    return str(getattr(mod, "SYSTEM_DEFAULT", ""))


def _resolved_user_template(step_name: str, mod: ModuleType) -> str:
    if has_composer_override(step_name):
        comp = load_composer_override(step_name)
        if comp:
            return comp["user"]
    return _user_template_shipped(mod)


def build_composer_snapshot(step_name: str) -> PromptComposerResponse:
    """Current composer-facing system + user template (merged legacy when composer file absent)."""
    if step_name not in VALID_STEPS:
        raise ValueError("Invalid step_name")
    mod = get_prompt(step_name)
    sys_ship = _system_shipped(mod)
    user_ship = _user_template_shipped(mod)
    if has_composer_override(step_name):
        comp = load_composer_override(step_name)
        if comp:
            return PromptComposerResponse(
                step_name=step_name,
                composer_override_active=True,
                system=comp["system"],
                user=comp["user"],
                system_shipped=sys_ship,
                user_template_shipped=user_ship,
            )
    return PromptComposerResponse(
        step_name=step_name,
        composer_override_active=False,
        system=_probe_system_message(step_name),
        user=user_ship,
        system_shipped=sys_ship,
        user_template_shipped=user_ship,
    )


def build_prompt_manager_entries() -> list[PromptManagerEntry]:
    base = get_llm_config()
    default_model = f"{base.provider}/{base.model}"

    ordered: list[tuple[int, str, ModuleType]] = []
    for name in VALID_STEPS:
        mod = get_prompt(name)
        ordered.append((int(getattr(mod, "PIPELINE_ORDER", 99)), name, mod))
    ordered.sort(key=lambda x: (x[0], x[1]))

    out: list[PromptManagerEntry] = []
    for _ord, name, mod in ordered:
        inst_def = str(getattr(mod, "INSTRUCTIONS", ""))
        rules_def = str(getattr(mod, "RULES", ""))
        inst_cur = load_override(name, "instructions") or inst_def
        rules_cur, rules_ov, rules_src_out = _resolved_rules(name, mod)

        ov = get_step_model(name)
        model_display = ov if ov else default_model

        pv: list[PromptVariable] = []
        raw_vars = getattr(mod, "VARIABLES", None)
        if isinstance(raw_vars, dict):
            for k, v in raw_vars.items():
                pv.append(PromptVariable(name=str(k), description=str(v)))

        composer_on = has_composer_override(name)
        sys_ship = _system_shipped(mod)
        user_ship = _user_template_shipped(mod)
        user_res = _resolved_user_template(name, mod)
        sys_res = _probe_system_message(name)

        out.append(
            PromptManagerEntry(
                step_name=name,
                label=str(getattr(mod, "STEP_LABEL", name)),
                version=str(getattr(mod, "STEP_VERSION", "")),
                file_path=str(getattr(mod, "FILE_PATH", f"prompts/{name}.py")),
                pipeline=_pipeline_value(mod),
                pipeline_order=int(getattr(mod, "PIPELINE_ORDER", 0)),
                receives_from=list(getattr(mod, "RECEIVES_FROM", [])),
                feeds_into=list(getattr(mod, "FEEDS_INTO", [])),
                instructions=inst_cur,
                instructions_is_override=has_override(name, "instructions"),
                instructions_default=inst_def,
                rules=rules_cur,
                rules_source=rules_src_out,
                rules_is_override=rules_ov,
                rules_default=rules_def,
                data_template=user_res,
                variables=pv,
                model=model_display,
                model_is_override=bool(ov),
                composer_override_active=composer_on,
                system_shipped=sys_ship,
                user_template_shipped=user_ship,
                system_resolved=sys_res,
                user_template_resolved=user_res,
            )
        )
    return out


def build_shared_rule_entries() -> list[SharedRuleEntry]:
    """Only resume_diff is a true cross-step shared adapter; other rules live on their step modules."""
    return [
        SharedRuleEntry(
            name=resume_diff_mod.RULES_NAME,
            label=resume_diff_mod.RULES_LABEL,
            rules=load_shared_rules_override("resume_diff") or resume_diff_mod.RESUME_DIFF_RULES,
            rules_is_override=has_shared_rules_override("resume_diff"),
            rules_default=resume_diff_mod.RESUME_DIFF_RULES,
            used_by=list(resume_diff_mod.USED_BY),
        ),
    ]
