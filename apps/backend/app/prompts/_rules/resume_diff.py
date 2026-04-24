"""Shared rules for resume diff JSON output shape.

Used by: tailor_resume_full, tailor_resume_lite, rewrite_resume (via bundle where applicable).

Shipped body: ``text/fragments/resume_diff_output.txt``. Narrative tailoring instructions live in
``text/fragments/tailoring_*.txt`` (loaded via ``tailoring_blocks``).
"""

from app.prompts._text_prompts import read_shipped_txt

RESUME_DIFF_RULES = read_shipped_txt("fragments/resume_diff_output.txt")

RULES_NAME = "resume_diff"
RULES_LABEL = "Resume Diff Output"
USED_BY = ["tailor_resume_full", "tailor_resume_lite", "rewrite_resume"]
