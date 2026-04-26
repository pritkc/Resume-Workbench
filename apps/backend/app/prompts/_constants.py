"""Version and option constants for LLM prompts."""

PROMPT_VERSIONS = {
    "tailoring_system": "v5.0",
    "tailoring_contract": "v5.0",
    "tailoring_craft": "v5.0",
    "tailoring_user": "v5.0",
    "jd_intelligence_system": "v2.1",
    "jd_intelligence_user": "v2.1",
    "parse_resume": "v2.2",
    "extract_keywords": "v2.0",
    "cover_letter_outreach": "v1.0",
    "application_questions_generate": "v1.0",
    "critique_resume": "v1.0",
    "rewrite_resume": "v1.0",
    "enrichment_analyze": "v1.1",
    "enrichment_enhance": "v1.1",
    "enrichment_regenerate_item": "v1.1",
    "enrichment_regenerate_group": "v1.1",
}

LANGUAGE_NAMES = {
    "en": "English",
    "es": "Spanish",
    "zh": "Chinese (Simplified)",
    "ja": "Japanese",
    "pt": "Brazilian Portuguese",
}


def get_language_name(code: str) -> str:
    return LANGUAGE_NAMES.get(code, "English")


IMPROVE_PROMPT_OPTIONS = [
    {
        "id": "full",
        "label": "Full tailor",
        "description": (
            "Comprehensive tailoring: rewrite bullets, enhance titles, optimize skills for the target role."
        ),
    },
    {
        "id": "lite",
        "label": "Light touch",
        "description": "Conservative edits: improve wording and weave in a few keywords without changing structure.",
    },
]

DEFAULT_IMPROVE_PROMPT_ID = "full"
