"""Unit tests for app-only CV metadata YAML."""

import pytest

from app.rendering.rendercv_adapter import RenderCVYamlValidationError
from app.services.cv_metadata import (
    DEFAULT_METADATA_YAML,
    CvMetadataFields,
    apply_cv_metadata_to_theme,
    parse_cv_metadata_yaml,
    serialize_cv_metadata_yaml,
)
from app.rendering.theme_profiles import RenderThemeSettings


def test_parse_cv_metadata_yaml_defaults() -> None:
    f = parse_cv_metadata_yaml("")
    assert f == CvMetadataFields(role="", company="", location="", bold_keywords=[])


def test_parse_cv_metadata_yaml_round_trip() -> None:
    raw = """metadata:
  role: "Senior BE"
  company: "Acme"
  location: "Remote"
  bold_keywords:
    - FastAPI
    - PostgreSQL
"""
    f = parse_cv_metadata_yaml(raw)
    assert f.role == "Senior BE"
    assert f.company == "Acme"
    assert f.location == "Remote"
    assert "FastAPI" in f.bold_keywords
    assert "PostgreSQL" in f.bold_keywords
    out = serialize_cv_metadata_yaml(f)
    f2 = parse_cv_metadata_yaml(out)
    assert f2.role == f.role
    assert f2.bold_keywords == f.bold_keywords


def test_parse_rejects_missing_metadata_root() -> None:
    with pytest.raises(RenderCVYamlValidationError) as exc:
        parse_cv_metadata_yaml("role: x\n")
    assert exc.value.section == "metadata"


def test_apply_cv_metadata_to_theme_empty_list_disables_bold() -> None:
    theme = RenderThemeSettings(
        theme_id="classic",
        bold_keywords=True,
        settings={"bold_keywords": ["Python"]},
    )
    next_theme = apply_cv_metadata_to_theme(theme, [])
    assert next_theme.bold_keywords is False
    assert next_theme.settings.get("bold_keywords") == []


def test_default_metadata_yaml_loads() -> None:
    f = parse_cv_metadata_yaml(DEFAULT_METADATA_YAML)
    assert f.bold_keywords == []
