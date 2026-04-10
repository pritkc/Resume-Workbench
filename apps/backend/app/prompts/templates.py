"""LLM prompt templates for resume processing."""

PROMPT_VERSIONS = {
    "tailoring_system": "v4.0",
    "tailoring_user": "v4.0",
    "parse_resume": "v2.2",
    "extract_keywords": "v2.0",
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
  "personalProjects":[{"id":1,"name":"...","tech_stacks":"React, TypeScript, AWS or null","date":"Mar 2021 - Present","github":"...or null","website":"...or null","highlights":["bullet1"]}],
  "skills":{"groups":[{"label":"Technical Skills","values":["Python","AWS"]},{"label":"Languages","values":["English (Native)"]}]},
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

EXTRACT_JD_INTELLIGENCE_PROMPT = """Analyze this job description and extract comprehensive intelligence for resume tailoring.

Output JSON matching this schema:

{{
  "role": {{
    "title": "core role title — no company name, location, or qualifiers",
    "seniority": "junior | mid | senior | staff | principal | lead",
    "function": "primary function (full-stack, backend, data engineering, devops, etc.)",
    "scope": "expected scope of work (team-level delivery, org-wide standardization, cross-functional initiatives, etc.)"
  }},
  "company": {{
    "name": "company name or null",
    "team": "specific team or division or null",
    "domain": "industry and domain context (fintech, healthtech, enterprise SaaS, e-commerce, etc.)",
    "product_context": "what the team builds — infer from the description",
    "scale_signals": ["any mentions of scale: user counts, transaction volumes, data volume, global reach"]
  }},
  "location": "location or remote arrangement or null",
  "technical_requirements": {{
    "primary_stack": ["hard-required technologies in the order the JD emphasizes"],
    "secondary_stack": ["preferred or nice-to-have technologies"],
    "infrastructure": ["cloud platforms, devops, infra tools"],
    "paradigms": ["architectural patterns and methodologies: microservices, event-driven, agile, CI/CD, etc."]
  }},
  "requirements": {{
    "years": 5,
    "must_have": ["hard requirements as stated in the JD"],
    "preferred": ["nice-to-have qualifications"],
    "education": "education requirement or null"
  }},
  "responsibility_themes": [
    "distill responsibilities into 5-8 actionable themes for resume writing — not raw JD copies"
  ],
  "ats_keywords": [
    "every technical term, tool, methodology, and domain keyword an ATS would scan for — be thorough"
  ],
  "bold_keywords": [
    "the 10-15 most impactful keywords that should appear prominently in the resume"
  ],
  "calibration": {{
    "seniority_expectations": "what this level is expected to demonstrate — ownership scope, leadership, depth",
    "team_context": "IC, tech lead, cross-team, org-wide, etc."
  }}
}}

Rules:
- role.title: strip company name, location, employment type, "apply now"-style noise
- company.product_context: infer from team/division description what they build or maintain
- responsibility_themes: distill into themes a resume writer can target, not raw JD bullet copies. Examples: "API architecture & governance", "cloud-native microservices", "frontend accessibility & performance"
- ats_keywords: include every technical and domain term. Include common abbreviation variants (e.g., "CI/CD" and "Continuous Integration/Continuous Deployment")
- bold_keywords: the highest-signal keywords for this specific role — will be visually emphasized in the final resume
- calibration.seniority_expectations: interpret what scope of impact, leadership, and technical depth this level demands
- Use null for missing scalars, [] for missing arrays

Job description:
{job_description}"""

# Kept for backward compatibility — consumers that import by name still work
EXTRACT_KEYWORDS_PROMPT = EXTRACT_JD_INTELLIGENCE_PROMPT

TAILORING_SYSTEM_PROMPT = """You are a senior resume strategist. Your single goal: craft a resume that earns the interview call.

APPROACH:
- Rewrite the resume so the candidate naturally fits the target role
- The writing must read like the candidate genuinely wrote it — someone who has done the work and knows the domain
- Maintain the candidate's authentic voice and writing culture from their master resume
- Relate work naturally to what the target employer and team care about
- You may replace the least relevant bullets with content that naturally supports the role
- Titles may be enhanced: add platform, domain, team, or functional scope (e.g., "Software Engineer" → "Software Engineer, Platform & Distributed Systems")
- For projects, naturally relate them to the company's products or domain where the candidate was employed

WRITING STANDARDS:
- Write like a real engineer — specific, concrete, direct
- Every bullet earns its place: what was done, how, and what it achieved
- No trailing purpose clauses ("enhancing system reliability") or self-narrating ("demonstrating expertise in X")
- Active verbs: built, designed, led, shipped, implemented, migrated, automated, improved, reduced, created, integrated, deployed
- Banned: spearheaded, leveraged, orchestrated, utilized, facilitated, synergy, robust, scalable, holistic, proactive, streamlined, cutting-edge, state-of-the-art
- No em-dash
- Vary metrics across bullets: time saved, latency reduced, throughput improved, cost cut, data volume, team size, user count, SLA numbers, error rate reduction — do not repeat the same metric type in consecutive bullets
- Metrics only where credible for the role's seniority and tenure
- Calibrate scope to experience level: early career roles get modest bullets, senior roles can claim system-wide impact. A 3-month intern does not "architect" anything. A first job does not "drive organization-wide strategy"
- Short stints get proportionally scoped bullets

ATS OPTIMIZATION:
- Weave keywords throughout: summary, bullets, skills, project descriptions
- Use exact keyword forms from the job intelligence (e.g., "Spring Boot" not "Spring framework", "Kubernetes" not "K8s")
- Place the highest-priority keywords early in bullets and in the summary
- Never stuff keywords or write hollow ATS-bait sentences — every keyword sits in a meaningful, natural context

OUTPUT FORMAT:
- Valid JSON only — no markdown, no commentary
- Keys: "summary", "experience", "projects", "skills", "bold_keywords"
- summary: one sentence. "[N]+ years in [domain], [1-2 JD-aligned strengths]."
- experience: object keyed by 0-based entry index ("0", "1", …)
  - include only entries you change
  - each entry: { "position": "enhanced title or omit", "bullets": { "INDEX": "text" } }
  - INDEX must be within the entry's bullet_count
  - omit an INDEX to keep that bullet unchanged
- projects: object keyed by 0-based entry index
  - each entry: { "name": "enhanced title or omit", "tech_stacks": "updated tagline or omit", "bullets": { "INDEX": "text" } }
- skills: array of { "label": "...", "values": [...] }
  - regroup and relabel freely for JD relevance
  - you may add skills the JD demands that the candidate can credibly claim
  - place JD-critical skills in the first groups
  - omit "skills" key entirely if no changes
- bold_keywords: array of 10-20 strings — keywords from the final resume content that should be rendered bold, selected for maximum JD alignment
- Do NOT emit: id, company, location, dates, github, website, customSections"""

TAILORING_MODE_CONSTRAINTS = {
    "nudge": (
        "Conservative alignment. Improve wording and weave in a few high-priority keywords. "
        "Keep original voice nearly intact. Do not change titles. "
        "Only touch bullets that clearly benefit. Omit unchanged entries."
    ),
    "keywords": (
        "Keyword-focused alignment. Weave JD keywords into bullets where they fit naturally. "
        "May adjust role titles to add relevant context. Regroup skills for JD relevance. "
        "Omit unchanged entries."
    ),
    "full": (
        "Maximum alignment. Rewrite bullets to strongly match the target role. "
        "Enhance titles with platform, domain, or scope context. "
        "Replace least applicable bullets with naturally fitting alternatives. "
        "Regroup and expand skills for maximum JD coverage. "
        "Every bullet should serve the candidate's case for this specific role."
    ),
}

IMPROVE_STRATEGY_GUIDANCE = {
    "nudge": {
        "primary_goal": (
            "Make minimal wording improvements and add a few high-priority keywords "
            "where the resume already supports them."
        ),
        "description_rule": (
            "Rewrite only bullets that clearly benefit from adjustment. "
            "Preserve all others unchanged."
        ),
    },
    "keywords": {
        "primary_goal": (
            "Weave JD keywords naturally into bullets and skills. "
            "May enhance titles and regroup skills for relevance."
        ),
        "description_rule": (
            "Rewrite bullets where keywords fit naturally. May replace weak bullets "
            "with keyword-rich alternatives. Preserve strong bullets unchanged."
        ),
    },
    "full": {
        "primary_goal": (
            "Maximize alignment with the target role. Rewrite for impact, "
            "enhance titles, expand skills, and replace weak content."
        ),
        "description_rule": (
            "Rewrite all bullets for maximum JD alignment. Replace the least applicable "
            "with naturally fitting alternatives. No content should feel generic."
        ),
    },
}

IMPROVE_RESUME_PROMPT_TEMPLATE = """Tailor this resume for the target role.

MODE: {mode_id} — {mode_constraint}

REWRITING EXAMPLE:
Original: "Worked on backend systems"
JD needs: Kubernetes, CI/CD, microservices
Rewritten: "Built and maintained backend microservices deployed on Kubernetes with automated CI/CD pipelines, reducing deployment time from 2 hours to 15 minutes"

JOB INTELLIGENCE:
{job_intelligence}

MASTER RESUME:
{original_resume}

RESPONSE CONTRACT:
{response_contract}

Output language: {output_language}"""

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
EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT = "You are a job description analyst. Extract actionable intelligence for resume tailoring. Output only valid JSON, no other text."
# Kept for backward compatibility
EXTRACT_KEYWORDS_SYSTEM_PROMPT = EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT
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
