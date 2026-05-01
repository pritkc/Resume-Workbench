"""Load composer overrides and render user templates with string.Template (safe for JSON braces)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from string import Template
from typing import Any

_OVERRIDE_DIR = Path(__file__).resolve().parent.parent / "prompt_overrides"
_STEP_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")

# Unfilled $placeholders after substitute (not $$ escape)
_UNFILLED = re.compile(r"(?<!\$)\$(?:\{([_a-z][a-z0-9_]*)\}|([_a-z][a-z0-9_]*))")


def _composer_path(step_name: str) -> Path:
    return _OVERRIDE_DIR / f"{step_name}.composer.json"


def load_composer_override(step_name: str) -> dict[str, str] | None:
    """Load {system, user} from prompt_overrides/{step}.composer.json if present."""
    from app.prompts import VALID_STEPS

    if step_name not in VALID_STEPS:
        raise ValueError("Invalid step_name")
    if not _STEP_NAME_RE.fullmatch(step_name):
        raise ValueError("Invalid step_name")
    path = _composer_path(step_name)
    if not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"Invalid composer JSON for {step_name}")
    system = raw.get("system")
    user = raw.get("user")
    if not isinstance(system, str) or not isinstance(user, str):
        raise ValueError(f"Composer override for {step_name} requires string 'system' and 'user'")
    return {"system": system, "user": user}


def has_composer_override(step_name: str) -> bool:
    from app.prompts import VALID_STEPS

    if step_name not in VALID_STEPS:
        raise ValueError("Invalid step_name")
    return _composer_path(step_name).exists()


def save_composer_override(step_name: str, system: str, user: str) -> None:
    from app.prompts import VALID_STEPS

    if step_name not in VALID_STEPS:
        raise ValueError("Invalid step_name")
    if not _STEP_NAME_RE.fullmatch(step_name):
        raise ValueError("Invalid step_name")
    _OVERRIDE_DIR.mkdir(parents=True, exist_ok=True)
    path = _composer_path(step_name)
    path.write_text(
        json.dumps({"system": system, "user": user}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def delete_composer_override(step_name: str) -> bool:
    from app.prompts import VALID_STEPS

    if step_name not in VALID_STEPS:
        raise ValueError("Invalid step_name")
    path = _composer_path(step_name)
    if path.exists():
        path.unlink()
        return True
    return False


def render_user_template(
    template: str,
    *,
    jd_intel_blob: dict[str, Any] | None = None,
    **kwargs: str,
) -> str:
    """Substitute ``$placeholders``; optional JD blob replaces ``$extract_jd_intel_output`` dot paths."""
    from app.services.tailoring.jd_intel_blob import substitute_jd_intel_placeholders

    text = template
    blob = jd_intel_blob
    if blob is None and "extract_jd_intel_output" in kwargs:
        raw = kwargs.get("extract_jd_intel_output", "")
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                blob = parsed
        except (json.JSONDecodeError, TypeError):
            blob = None
    if blob is not None:
        text = substitute_jd_intel_placeholders(text, blob)
    try:
        out = Template(text).substitute(**kwargs)
    except KeyError as e:
        raise ValueError(f"Missing template variable: {e.args[0]}") from e
    for m in _UNFILLED.finditer(out):
        name = m.group(1) or m.group(2)
        raise ValueError(f"Unfilled or invalid template placeholder: ${name}")
    return out


def validate_user_template_against_variables(template: str, variable_keys: frozenset[str]) -> None:
    """Ensure USER template only uses placeholders declared in VARIABLES."""
    ids = frozenset(Template(template).get_identifiers())
    unknown = ids - variable_keys
    if unknown:
        raise ValueError(f"Template uses unknown placeholders: {sorted(unknown)}")
