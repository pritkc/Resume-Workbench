"""Shared rules for resume diff JSON output shape."""

from app.prompts._text_prompts import read_shipped_txt

RESUME_DIFF_RULES = read_shipped_txt("output_file_schema_rules/resume_diff_output.txt")
RULES_NAME = "resume_diff"
RULES_LABEL = "Resume diff (JSON output)"
USED_BY = ["tailor_resume_full", "tailor_resume_lite"]
