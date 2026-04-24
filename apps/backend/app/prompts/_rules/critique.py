"""Critique step output schema.

Shipped body: ``text/fragments/critique_rules.txt``.
"""

from app.prompts._text_prompts import read_shipped_txt

CRITIQUE_RULES = read_shipped_txt("fragments/critique_rules.txt")

RULES_NAME = "critique"
RULES_LABEL = "Critique Output"
USED_BY = ["critique_resume"]
