"""Shared JD intelligence extraction context (system-side).

Shipped bodies: ``text/fragments/jd_intel_contract.txt``, ``text/fragments/jd_intel_craft.txt``.
"""

from app.prompts._text_prompts import read_shipped_txt

JD_INTELLIGENCE_CONTRACT_BLOCK = read_shipped_txt("fragments/jd_intel_contract.txt").strip()
JD_INTELLIGENCE_CRAFT_BLOCK = read_shipped_txt("fragments/jd_intel_craft.txt")

JD_INTEL_RULES = JD_INTELLIGENCE_CONTRACT_BLOCK

RULES_NAME = "jd_intel"
RULES_LABEL = "JD Intelligence Output"
USED_BY = ["extract_jd_intel"]
