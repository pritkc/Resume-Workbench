"""LLM prompt templates for AI-powered resume enrichment."""

from app.prompts._text_prompts import read_shipped_txt

ANALYZE_RESUME_PROMPT = read_shipped_txt("enrichment/analyze/user.txt")
ENHANCE_DESCRIPTION_PROMPT = read_shipped_txt("enrichment/enhance/user.txt")
REGENERATE_ITEM_PROMPT = read_shipped_txt("enrichment/regenerate_item/user.txt")
REGENERATE_ADDITIONAL_GROUP_PROMPT = read_shipped_txt("enrichment/regenerate_group/user.txt")

ENRICHMENT_ANALYZE_SYSTEM_PROMPT = read_shipped_txt("enrichment/analyze/system.txt").strip()
ENRICHMENT_ENHANCE_SYSTEM_PROMPT = read_shipped_txt("enrichment/enhance/system.txt").strip()
ENRICHMENT_REGENERATE_SYSTEM_PROMPT = read_shipped_txt("enrichment/regenerate_item/system.txt").strip()
