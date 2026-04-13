from app.services.resume_codes import build_resume_pdf_filename, derive_resume_code


def test_derive_resume_code_is_stable_and_uppercase() -> None:
    code = derive_resume_code("123e4567-e89b-12d3-a456-426614174000")
    assert len(code) == 6
    assert code.isalnum()
    assert code == code.upper()
    assert code == derive_resume_code("123e4567-e89b-12d3-a456-426614174000")


def test_build_resume_pdf_filename_uses_first_last_and_code() -> None:
    filename = build_resume_pdf_filename(
        full_name="Jane Doe",
        resume_code="Q7K2MW",
        fallback_resume_id="res-123",
    )
    assert filename == "jane_doe_Q7K2MW.pdf"


def test_build_resume_pdf_filename_normalizes_name_and_fallbacks() -> None:
    filename = build_resume_pdf_filename(
        full_name="María García-López",
        resume_code=None,
        fallback_resume_id="res-123",
    )
    assert filename.startswith("maria_lopez_")
    assert filename.endswith(".pdf")
