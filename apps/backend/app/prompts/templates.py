"""LLM prompt templates for resume processing."""

PROMPT_VERSIONS = {
    "tailoring_system": "v2.0",
    "tailoring_user": "v2.0",
    "parse_resume": "v2.2",
    "extract_keywords": "v1.0",
    "cover_letter": "v1.3",
    "outreach": "v1.3",
    "enrichment_analyze": "v1.1",
    "enrichment_enhance": "v1.1",
    "enrichment_regenerate_item": "v1.1",
    "enrichment_regenerate_group": "v1.1",
}

# Language code to full name mapping
LANGUAGE_NAMES = {
    "en": "English",
    "es": "Spanish",
    "zh": "Chinese (Simplified)",
    "ja": "Japanese",
    "pt": "Brazilian Portuguese",
}


def get_language_name(code: str) -> str:
    """Get full language name from code."""
    return LANGUAGE_NAMES.get(code, "English")


RESUME_SCHEMA_COMPACT = """{
  "personalInfo":{"name":"...","headline":"...","email":"...","phone":"...","location":"...","website":"...or null","linkedin":"...or null","github":"...or null","photo":"...or null","profileLinks":[{"label":"Portfolio","url":"https://example.com","fontawesome_icon":"link"}],"socialNetworks":[{"network":"LinkedIn","username":"..."}],"customConnections":[{"placeholder":"Portfolio","url":"...or null","fontawesome_icon":"...or null"}]},
  "summary":"string",
  "workExperience":[{"id":1,"position":"...","company":"...","location":"...or null","date":"Jan 2020 - Present","start_date":"2020-01 or null","end_date":"present or 2023-12 or null","summary":"...or null","highlights":["bullet1","bullet2"]}],
  "education":[{"id":1,"institution":"...","area":"...or null","degree":"...or null","location":"...or null","date":"2014 - 2018","start_date":"2014 or null","end_date":"2018 or null","summary":"string or null","highlights":["bullet1"]}],
  "personalProjects":[{"id":1,"name":"...","summary":"...or null","date":"Mar 2021 - Present","github":"...or null","website":"...or null","highlights":["bullet1"]}],
  "skills":{"groups":[{"id":"technicalSkills","label":"Technical Skills","values":["Python","AWS"]},{"id":"languages","label":"Languages","values":["English (Native)"]}]},
  "customSections":{"publications":{"sectionType":"itemList","items":[{"id":1,"title":"...","subtitle":"...","years":"Jun 2023","description":["..."]}]},"volunteer_work":{"sectionType":"text","text":"..."}}
}"""

RESUME_SCHEMA_EXAMPLE = RESUME_SCHEMA_COMPACT

PARSE_RESUME_PROMPT = """Parse this resume into JSON. Output ONLY the JSON object.

Schema:
{schema}

SECTIONS: Map to standard keys when possible. Non-standard sections → customSections with sectionType "text" (single block), "itemList" (title/subtitle/years/description entries), or "stringList" (simple list).

RULES:
- "" for missing text, [] for missing arrays, null for optional fields
- IDs start from 1
- skills.groups: use natural category labels from the resume (e.g., Backend, ML, Infra, Languages, Certifications)
- Custom section keys: snake_case (e.g., "volunteer_work", "publications")
- Overlapping dates (concurrent roles): preserve both, don't merge

DATES (critical — never discard month precision):
- Copy months exactly when present: "Jan 2020 - Dec 2023", "May 2021 - Present"
- "YYYY - YYYY" only when source truly has no months
- Normalize separators: "2020-2021" → "2020 - 2021", "Current"/"Ongoing" → "Present"
- Ambiguous durations ("3 years experience"): infer approximate years or use "~YYYY"

Resume:
{resume_text}"""

EXTRACT_KEYWORDS_PROMPT = """Extract job requirements as JSON. Output ONLY the JSON object, no other text.

Example format:
{{
  "core_title": "Backend Engineer",
  "company_name": "TechCorp",
  "location": "Remote",
  "required_skills": ["Python", "AWS"],
  "preferred_skills": ["Kubernetes"],
  "experience_requirements": ["5+ years"],
  "education_requirements": ["Bachelor's in CS"],
  "key_responsibilities": ["Lead team"],
  "keywords": ["microservices", "agile"],
  "experience_years": 5,
  "seniority_level": "senior"
}}

Rules:
- `core_title`: return the core role title only, without company name, location, employment type, or extra qualifiers like "apply now"
- `company_name`: return the employer/company name when present, else null
- `location`: return the location/work arrangement when clearly stated (for example "Remote", "Hybrid in Seattle, WA", "New York, NY"), else null
- Extract numeric years (e.g., "5+ years" → 5) and infer seniority level
- Use null for missing scalar values and [] for missing arrays

Job description:
{job_description}"""

TAILORING_SYSTEM_PROMPT = """You are an expert resume editor. Output only valid JSON.

TRUTHFULNESS (violation = interview harm):
- Never invent skills, tools, certifications, metrics, companies, or dates not in the original resume
- Never upgrade experience level or add new employers
- Copy date ranges exactly including months
- Every original skill value must appear exactly once in output

STRUCTURE:
- One complete JSON object, no markdown fences, no commentary
- Double-quoted keys and strings, no trailing commas
- Follow the response contract: respect entry counts, immutable fields, and editable fields
- Do not add extra top-level keys beyond what the contract specifies
- Populate the `changes` array with indexed paths for each actual edit you made
- Keep `skills` editable and grounded: regroup/relabel is allowed, inventing skill values is not

VOICE:
- Direct, specific, active verbs matching the candidate's original register
- Avoid: spearheaded, leveraged, orchestrated, utilized, facilitated, synergy, robust, scalable, holistic, proactive
- Prefer: led, built, designed, ran, managed, improved, reduced, created
- Never use em-dash characters"""

TAILORING_MODE_CONSTRAINTS = {
    "nudge": "Rephrase only. Do not add or remove bullets. Keep every description array the same length.",
    "keywords": "Integrate supported JD keywords into existing bullet phrasing. Do not add or remove bullets. Each keyword should appear in context that demonstrates concrete experience.",
    "full": "Make targeted, high-signal tailoring edits. You may add at most one bullet per entry, elaborating on evidence already present. Do not invent new responsibilities.",
}

IMPROVE_STRATEGY_GUIDANCE = {
    "nudge": {
        "primary_goal": (
            "Make minimal, conservative wording adjustments only where the resume "
            "already strongly supports the job."
        ),
        "description_rule": (
            "Keep every description array the same length and preserve bullet ordering."
        ),
    },
    "keywords": {
        "primary_goal": (
            "Weave in supported job keywords naturally while keeping the original "
            "scope, voice, and structure."
        ),
        "description_rule": (
            "Keep every description array the same length and preserve bullet ordering."
        ),
    },
    "full": {
        "primary_goal": (
            "Make targeted, high-signal tailoring adjustments while staying fully "
            "grounded in the original resume."
        ),
        "description_rule": (
            "Keep description arrays close to the original size. You may add at most "
            "one supported bullet within an existing work or project entry when it "
            "directly elaborates on evidence already present in that same entry."
        ),
    },
}

IMPROVE_RESUME_PROMPT_TEMPLATE = """Tailor this resume for the target job.

MODE: {mode_id} — {mode_constraint}

EXAMPLE:
Original: "Worked on backend systems"
For JD mentioning "Kubernetes, CI/CD":
Tailored: "Built and maintained backend services deployed across Kubernetes clusters with automated CI/CD pipelines"

SUMMARY GUIDANCE: Open with "[N]+ years in [relevant domain]". Reference 1-2 JD-matching strengths. Max 3 sentences.

Generate all rewritten text in {output_language}.

JOB ANALYSIS:
{job_analysis}

JOB DESCRIPTION:
{job_description}

RESUME:
{original_resume}

RESPONSE CONTRACT:
{response_contract}

CHANGES ARRAY RULES:
- Each change path must point to the exact edited field or bullet index
- Use `replace` for edited strings, `append` for newly added bullets, and `regroup` for `skills.groups`
- `original` must match the pre-edit text at that path when available
- If you edit nothing, return an empty `changes` array"""

IMPROVE_PROMPT_OPTIONS = [
    {
        "id": "nudge",
        "label": "Light nudge",
        "description": "Minimal edits to better align existing experience.",
    },
    {
        "id": "keywords",
        "label": "Keyword enhance",
        "description": "Blend in relevant keywords without changing role or scope.",
    },
    {
        "id": "full",
        "label": "Full tailor",
        "description": "Comprehensive tailoring using the job description.",
    },
]

DEFAULT_IMPROVE_PROMPT_ID = "keywords"

IMPROVE_RESUME_PROMPT = IMPROVE_RESUME_PROMPT_TEMPLATE

COVER_LETTER_PROMPT = """Write one finished cover letter for this job application.

IMPORTANT:
- Write in {output_language}
- Output plain text only
- Return exactly one finished cover letter
- Do NOT use em dash ("—") anywhere in the output

JOB TARGET (JSON):
{job_target}

JOB DESCRIPTION EXCERPT:
{job_description}

CANDIDATE PROFILE (JSON):
{resume_profile}

RULES:
- 120-180 words
- 3 to 4 short paragraphs
- Opening: reference one specific job detail (product, team, stack, or problem), not generic excitement
- Body: highlight 1-2 directly relevant qualifications grounded in the candidate profile
- Closing: simple availability to talk, no desperate enthusiasm
- If the candidate is pivoting, frame the move as intentional and relevant
- Do NOT invent facts, metrics, or names
- Do NOT use placeholder text or bracketed names
- Do NOT add a signature block, heading, or markdown formatting
- Return the final answer immediately, not a draft
"""

OUTREACH_MESSAGE_PROMPT = """Write one finished cold outreach message for LinkedIn or email about this job opportunity.

IMPORTANT:
- Write in {output_language}
- Output plain text only
- Return exactly one finished outreach message
- Do NOT use em dash ("—") anywhere in the output

JOB TARGET (JSON):
{job_target}

JOB DESCRIPTION EXCERPT:
{job_description}

CANDIDATE PROFILE (JSON):
{resume_profile}

RULES:
- 65-110 words total
- 3 to 5 short sentences
- Open with one specific job detail, never with "I'm reaching out" or "I saw your posting"
- Mention the strongest relevant qualification with one concrete detail if supported
- End with one low-friction ask
- Tone: warm, confident peer; not stiff, not overly eager
- If the recipient name is unknown, do not invent one and do not use a greeting placeholder
- Do NOT use phrases like "excited about" or "passionate about"
- Do NOT invent facts, metrics, or names
- Do NOT add a subject line, signature block, or markdown formatting
- Return the final answer immediately, not a draft
"""

# Alias for backward compatibility
RESUME_SCHEMA = RESUME_SCHEMA_EXAMPLE

PARSE_SYSTEM_PROMPT = "You are a JSON extraction engine. Output only valid JSON, no explanations."
EXTRACT_KEYWORDS_SYSTEM_PROMPT = "You are an expert job description analyzer. Output only valid JSON."
COVER_LETTER_SYSTEM_PROMPT = (
    "You are a professional career coach and resume writer. "
    "Write one strong, personalized final cover letter only. "
    "Do not show planning, analysis, alternatives, placeholders, or scaffolding."
)
OUTREACH_SYSTEM_PROMPT = (
    "You are a professional networking coach. "
    "Write one genuine, polished final outreach message only. "
    "Do not show planning, analysis, alternatives, placeholders, or scaffolding."
)
ENRICHMENT_ANALYZE_SYSTEM_PROMPT = "You are a professional resume analyst. Output only valid JSON."
ENRICHMENT_ENHANCE_SYSTEM_PROMPT = "You are a professional resume writer. Output only valid JSON."
ENRICHMENT_REGENERATE_SYSTEM_PROMPT = "You are a professional resume writer. Output only valid JSON."
