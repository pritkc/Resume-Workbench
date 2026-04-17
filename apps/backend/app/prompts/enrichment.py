"""LLM prompt templates for AI-powered resume enrichment."""

ANALYZE_RESUME_PROMPT = """Analyze this resume to find Experience and Projects items with weak or vague descriptions.

Generate ALL output text in {output_language}.

RESUME (JSON):
{resume_json}

WEAKNESS SIGNALS: generic phrasing ("responsible for", "worked on"), missing metrics/impact, unclear scope, no specific tech/tools, passive voice, too brief.

TASK:
- Review each Experience and Project item's description
- Identify items that need more detail
- Generate max 6 questions total (not per item), prioritizing highest-impact improvements
- Questions should extract: metrics, technologies, scope, impact, ownership

OUTPUT (JSON only):
{{"items_to_enrich":[{{"item_id":"exp_0","item_type":"experience","title":"...","subtitle":"...","current_description":["..."],"weakness_reason":"..."}}],"questions":[{{"question_id":"q_0","item_id":"exp_0","question":"...","placeholder":"e.g., ..."}}],"analysis_summary":"..."}}

RULES:
- Hard limit: 6 questions max (q_0 through q_5)
- IDs: "exp_0","exp_1" for experience, "proj_0","proj_1" for projects (array index)
- If resume is already strong, return empty arrays with a positive summary
- Questions: specific to role/project context, conversational, with concrete placeholder examples
- Quality over quantity"""

ENHANCE_DESCRIPTION_PROMPT = """ADD new bullet points to this resume item using the candidate's additional context. Do NOT rewrite existing bullets.

Generate ALL output in {output_language}.

ITEM: {item_type} — {title} at {subtitle}
CURRENT BULLETS (keep as-is):
{current_description}

CANDIDATE CONTEXT:
{answers}

OUTPUT (JSON only):
{{"additional_bullets":["New bullet 1","New bullet 2"]}}

RULES:
- 2-4 new bullets only — no replacements, no repeats of existing content
- Action verbs: Led, Built, Designed, Implemented, Optimized
- Include metrics/numbers only when candidate provided them — never invent
- Mention specific technologies and tools from the answers
- Past tense for past roles, present for current
- Concise (1-2 lines each), specific, no buzzwords"""


REGENERATE_ITEM_PROMPT = """REWRITE this resume item's description based on user feedback.

Generate ALL output in {output_language}.

ITEM: {item_type} — {title} at {subtitle}
CURRENT DESCRIPTION (user wants this rewritten):
{current_description}

USER FEEDBACK:
{user_instruction}

OUTPUT (JSON only):
{{"new_bullets":["Rewritten bullet 1","Rewritten bullet 2"],"change_summary":"Brief explanation of changes"}}

RULES:
- 2-5 replacement bullets addressing the user's feedback
- Action verbs, specific technologies, clear ownership
- Only use facts from CURRENT DESCRIPTION or USER FEEDBACK — never invent metrics, dates, companies, or titles
- If user asks for metrics but none exist, emphasize scope/impact qualitatively
- Concise (1-2 lines each), past tense for past roles, present for current"""


REGENERATE_ADDITIONAL_GROUP_PROMPT = """Rewrite this resume group based on user feedback.

Generate ALL output in {output_language}.

GROUP: {group_label}
CURRENT VALUES: {current_values}

USER FEEDBACK:
{user_instruction}

OUTPUT (JSON only):
{{"group_label":"Updated label","new_values":["Value 1","Value 2"],"change_summary":"Brief explanation"}}

RULES:
- Concise, resume-friendly values
- May rename label if feedback requests clearer grouping
- Only include values from CURRENT VALUES or explicitly from USER FEEDBACK — never invent facts or certifications
- Preserve overall item set unless user explicitly asks to remove/regroup
- Order by relevance per feedback"""

ENRICHMENT_ANALYZE_SYSTEM_PROMPT = "You are a professional resume analyst. Output only valid JSON."
ENRICHMENT_ENHANCE_SYSTEM_PROMPT = "You are a professional resume writer. Output only valid JSON."
ENRICHMENT_REGENERATE_SYSTEM_PROMPT = "You are a professional resume writer. Output only valid JSON."
