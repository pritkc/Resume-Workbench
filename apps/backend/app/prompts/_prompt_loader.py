"""Load composer overrides and render user templates ($placeholders; safe for JSON braces and literal $)."""

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


def _substitute_declared_placeholders(template: str, mapping: dict[str, str]) -> str:
    """Replace only ``$name`` / ``${name}`` for keys in ``mapping``; ``$$`` → ``$``.

    Unlike ``string.Template.substitute``, arbitrary ``$`` (e.g. currency in inlined JSON)
    is left as a literal when it is not a declared placeholder.
    """
    out: list[str] = []
    i = 0
    n = len(template)
    while i < n:
        if i + 1 < n and template[i : i + 2] == "$$":
            out.append("$")
            i += 2
            continue
        if template[i] != "$":
            out.append(template[i])
            i += 1
            continue
        if i + 1 >= n:
            out.append("$")
            i += 1
            continue
        if template[i + 1] == "{":
            end = template.find("}", i + 2)
            if end == -1:
                out.append("$")
                i += 1
                continue
            inner = template[i + 2 : end]
            if inner not in mapping:
                raise ValueError(f"Missing template variable: {inner}") from None
            out.append(mapping[inner])
            i = end + 1
            continue
        j = i + 1
        if j < n and (template[j].isascii() and (template[j].isalpha() or template[j] == "_")):
            j += 1
            while j < n and (template[j].isascii() and (template[j].isalnum() or template[j] == "_")):
                j += 1
            ident = template[i + 1 : j]
            if ident in mapping:
                out.append(mapping[ident])
                i = j
                continue
            raise ValueError(f"Missing template variable: {ident}") from None
        out.append("$")
        i += 1
    return "".join(out)


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
    str_kwargs = {k: v for k, v in kwargs.items() if isinstance(v, str)}
    out = _substitute_declared_placeholders(text, str_kwargs)
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
