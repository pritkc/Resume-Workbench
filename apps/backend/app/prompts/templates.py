"""LLM prompt templates for resume processing."""

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


# Schema with example values - used for prompts to show LLM expected format
RESUME_SCHEMA_EXAMPLE = """{
  "personalInfo": {
    "name": "John Doe",
    "title": "Software Engineer",
    "email": "john@example.com",
    "phone": "+1-555-0100",
    "location": "San Francisco, CA",
    "website": "https://johndoe.dev",
    "linkedin": "linkedin.com/in/johndoe",
    "github": "github.com/johndoe"
  },
  "summary": "Experienced software engineer with 5+ years...",
  "workExperience": [
    {
      "id": 1,
      "title": "Senior Software Engineer",
      "company": "Tech Corp",
      "location": "San Francisco, CA",
      "years": "Jan 2020 - Present",
      "description": [
        "Led development of microservices architecture",
        "Improved system performance by 40%"
      ]
    }
  ],
  "education": [
    {
      "id": 1,
      "institution": "University of California",
      "degree": "B.S. Computer Science",
      "years": "2014 - 2018",
      "description": "Graduated with honors"
    }
  ],
  "personalProjects": [
    {
      "id": 1,
      "name": "Open Source Tool",
      "role": "Creator & Maintainer",
      "years": "Mar 2021 - Present",
      "description": [
        "Built CLI tool with 1000+ GitHub stars",
        "Used by 50+ companies worldwide"
      ]
    }
  ],
  "additional": {
    "groups": [
      {
        "id": "technicalSkills",
        "label": "Technical Skills",
        "items": ["Python", "JavaScript", "AWS", "Docker"]
      },
      {
        "id": "languages",
        "label": "Languages",
        "items": ["English (Native)", "Spanish (Conversational)"]
      },
      {
        "id": "certificationsTraining",
        "label": "Training & Certifications",
        "items": ["AWS Solutions Architect"]
      },
      {
        "id": "awards",
        "label": "Awards",
        "items": ["Employee of the Year 2022"]
      }
    ]
  },
  "customSections": {
    "publications": {
      "sectionType": "itemList",
      "items": [
        {
          "id": 1,
          "title": "Paper Title",
          "subtitle": "Journal Name",
          "years": "Jun 2023",
          "description": ["Brief description of the publication"]
        }
      ]
    },
    "volunteer_work": {
      "sectionType": "text",
      "text": "Description of volunteer activities..."
    }
  }
}"""

PARSE_RESUME_PROMPT = """Parse this resume into JSON. Output ONLY the JSON object, no other text.

Map content to standard sections when possible. For non-standard sections (like Publications, Volunteer Work, Research, Hobbies), add them to customSections with an appropriate type.

Example output format:
{schema}

Custom section types:
- "text": Single text block (e.g., objective, statement)
- "itemList": List of items with title, subtitle, years, description (e.g., publications, research)
- "stringList": Simple list of strings (e.g., hobbies, interests)

Rules:
- Use "" for missing text fields, [] for missing arrays, null for optional fields
- Number IDs starting from 1
- For `additional.groups`, use the most natural category labels you find in the resume (for example: Backend, ML, Infra, Languages, Certifications)
- Format dates preserving the original precision. Keep months when present: "Jan 2020 - Dec 2023", "May 2021 - Present". Use "YYYY - YYYY" only when the source has no months.
- Use snake_case for custom section keys (e.g., "volunteer_work", "publications")
- Preserve the original section name as a descriptive key
- Normalize date separators: "2020-2021" → "2020 - 2021", "Current"/"Ongoing" → "Present". Do NOT discard months.
- For ambiguous dates like "3 years experience", infer approximate years from context or use "~YYYY"
- Flag overlapping dates (concurrent roles) by preserving both, don't merge

Resume to parse:
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

CRITICAL_TRUTHFULNESS_RULES_TEMPLATE = """CRITICAL TRUTHFULNESS RULES - NEVER VIOLATE:
1. DO NOT add any skill, tool, technology, or certification that is not explicitly mentioned in the original resume
2. DO NOT invent numeric achievements (e.g., "increased by 30%") unless they exist in original
3. DO NOT add company names, product names, or technical terms not in the original
4. DO NOT upgrade experience level (e.g., "Junior" -> "Senior")
5. DO NOT add languages, frameworks, or platforms the candidate hasn't used
6. DO NOT extend employment dates or change timelines. Copy date ranges exactly as they appear, including months.
7. {rule_7}
8. Preserve factual accuracy - only use information provided by the candidate
9. NEVER remove existing additional-group items. You may regroup or relabel them by relevance, but every original item must remain.

Violation of these rules could cause serious problems for the candidate in job interviews.
"""


def _build_truthfulness_rules(rule_7: str) -> str:
    return CRITICAL_TRUTHFULNESS_RULES_TEMPLATE.format(rule_7=rule_7)


CRITICAL_TRUTHFULNESS_RULES = {
    "nudge": _build_truthfulness_rules(
        "DO NOT add new bullet points or content - only rephrase existing content"
    ),
    "keywords": _build_truthfulness_rules(
        "You may rephrase existing bullet points to include keywords, but do NOT add new bullet points"
    ),
    "full": _build_truthfulness_rules(
        "You may expand existing bullet points or add new ones that elaborate on existing work, but DO NOT invent entirely new responsibilities"
    ),
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

IMPROVE_RESUME_PROMPT_TEMPLATE = """Tailor this resume for the target job. Output ONLY one complete JSON object.

{critical_truthfulness_rules}

PRIMARY STRATEGY:
{strategy_primary_goal}

IMPORTANT:
- Generate all rewritten text in {output_language}
- Return one complete JSON object that follows the response contract exactly
- Do NOT return personalInfo or sectionMeta
- Keep proper nouns and identity fields unchanged
- Do NOT use em dash ("—") anywhere in the output

HARD STRUCTURE RULES:
- Copy every top-level key shown in the response contract
- Do not add extra top-level keys
- Follow the immutable_fields, editable_fields, entry_count, and rules in the response contract JSON
- Keep section counts unchanged unless the response contract explicitly allows otherwise
- If a field is unchanged, copy it through unchanged
- Output valid JSON only with double-quoted keys and strings
- No markdown fences, comments, explanations, or trailing commas

JOB ANALYSIS:
{job_analysis}

JOB DESCRIPTION EXCERPT:
{job_description}

TAILORING RESUME JSON:
{original_resume}

RESPONSE CONTRACT (JSON):
{response_contract}"""

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
- 110-140 words
- At most 3 short paragraphs
- Opening: reference one specific job detail (product, team, stack, or problem), not generic excitement
- Body: highlight 1-2 directly relevant qualifications grounded in the candidate profile
- Closing: simple availability to talk, no desperate enthusiasm
- If the candidate is pivoting, frame the move as intentional and relevant
- Do NOT invent facts, metrics, or names
- Do NOT use placeholder text or bracketed names
- Do NOT add a signature block, heading, or markdown formatting
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
- 55-85 words total
- 3 to 4 short sentences
- Open with one specific job detail, never with "I'm reaching out" or "I saw your posting"
- Mention the strongest relevant qualification with one concrete detail if supported
- End with one low-friction ask
- Tone: warm, confident peer; not stiff, not overly eager
- If the recipient name is unknown, do not invent one and do not use a greeting placeholder
- Do NOT use phrases like "excited about" or "passionate about"
- Do NOT invent facts, metrics, or names
- Do NOT add a subject line, signature block, or markdown formatting
"""

# Alias for backward compatibility
RESUME_SCHEMA = RESUME_SCHEMA_EXAMPLE
