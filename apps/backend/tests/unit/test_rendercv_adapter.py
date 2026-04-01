"""RenderCV adapter tests."""

from app.rendering.rendercv_adapter import resume_to_rendercv_payload
from app.rendering.theme_profiles import RenderThemeSettings


def test_rendercv_adapter_supports_classic_and_moderncv(sample_resume: dict) -> None:
    classic = resume_to_rendercv_payload(
        sample_resume,
        RenderThemeSettings(theme_id="classic"),
    )
    modern = resume_to_rendercv_payload(
        sample_resume,
        RenderThemeSettings(theme_id="moderncv", show_contact_icons=True),
    )

    assert classic["design"]["theme"] == "classic"
    assert modern["design"]["theme"] == "moderncv"
    assert classic["cv"]["name"] == sample_resume["personalInfo"]["name"]
    assert "experience" in classic["cv"]["sections"]
    assert modern["design"]["header"]["connections"]["show_icons"] is True
