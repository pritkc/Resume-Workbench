"""LLM prompt templates for AI-powered resume enrichment."""

from app.prompts._text_prompts import read_shipped_txt

ANALYZE_RESUME_PROMPT = read_shipped_txt("enrichment/analyze_user.txt")
ENHANCE_DESCRIPTION_PROMPT = read_shipped_txt("enrichment/enhance_user.txt")
REGENERATE_ITEM_PROMPT = read_shipped_txt("enrichment/regenerate_item_user.txt")
REGENERATE_ADDITIONAL_GROUP_PROMPT = read_shipped_txt("enrichment/regenerate_group_user.txt")

ENRICHMENT_ANALYZE_SYSTEM_PROMPT = read_shipped_txt("enrichment/analyze_system.txt").strip()
ENRICHMENT_ENHANCE_SYSTEM_PROMPT = read_shipped_txt("enrichment/enhance_system.txt").strip()
ENRICHMENT_REGENERATE_SYSTEM_PROMPT = read_shipped_txt("enrichment/regenerate_system.txt").strip()
