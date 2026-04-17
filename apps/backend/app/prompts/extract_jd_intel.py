"""Prompt: extract_jd_intel — structured intelligence from a job description."""

from app.prompts._constants import PROMPT_VERSIONS
from app.prompts._rules.jd_intel import (
    JD_INTELLIGENCE_CONTRACT_BLOCK,
    JD_INTELLIGENCE_CRAFT_BLOCK,
)

STEP_NAME = "extract_jd_intel"
STEP_LABEL = "Extract JD intelligence"
STEP_VERSION = PROMPT_VERSIONS["extract_keywords"]
FILE_PATH = "prompts/extract_jd_intel.py"
PIPELINE = "standalone"
PIPELINE_ORDER = 1
RECEIVES_FROM: list[str] = []
FEEDS_INTO = ["tailor_resume_full", "tailor_resume_lite"]

USER_TEMPLATE = """Analyze this job description and extract comprehensive intelligence for resume tailoring.

Output JSON matching this schema:

{
  "role": {
    "title": "core role title — no company name, location, or qualifiers",
    "seniority": "junior | mid | senior | staff | principal | lead",
    "function": "primary function (full-stack, backend, data engineering, devops, etc.)",
    "scope": "expected scope of work (team-level delivery, org-wide standardization, cross-functional initiatives, etc.)"
  },
  "company": {
    "name": "company name or null",
    "team": "specific team or division or null",
    "domain": "industry and domain context (fintech, healthtech, enterprise SaaS, e-commerce, etc.)",
    "product_context": "what the team builds — infer from the description",
    "scale_signals": ["any mentions of scale: user counts, transaction volumes, data volume, global reach"]
  },
  "location": "strict location in `City, ST` format (e.g., `Mountain View, CA`) or empty string when not explicitly present",
  "technical_requirements": {
    "primary_stack": ["hard-required technologies in the order the JD emphasizes"],
    "secondary_stack": ["preferred or nice-to-have technologies"],
    "infrastructure": ["cloud platforms, devops, infra tools"],
    "paradigms": ["architectural patterns and methodologies: microservices, event-driven, agile, CI/CD, etc."]
  },
  "requirements": {
    "years": 5,
    "must_have": ["hard requirements as stated in the JD"],
    "preferred": ["nice-to-have qualifications"],
    "education": "education requirement or null"
  },
  "responsibility_themes": [
    "distill responsibilities into 5-8 actionable themes for resume writing — not raw JD copies"
  ],
  "ats_keywords": [
    "every technical term, tool, methodology, and domain keyword an ATS would scan for — be thorough"
  ],
  "bold_keywords": [
    "the 10-15 most impactful keywords that should appear prominently in the resume"
  ],
  "calibration": {
    "seniority_expectations": "what this level is expected to demonstrate — ownership scope, leadership, depth",
    "team_context": "IC, tech lead, cross-team, org-wide, etc."
  }
}

Rules:
- role.title: strip company name, location, employment type, "apply now"-style noise
- location: return only `City, ST` (US state abbreviation). Do not return `Remote`, `Hybrid`, `On-site`, regions, or long phrases. If unavailable, return empty string.
- company.product_context: infer from team/division description what they build or maintain
- responsibility_themes: distill into themes a resume writer can target, not raw JD bullet copies. Examples: "API architecture & governance", "cloud-native microservices", "frontend accessibility & performance"
- ats_keywords: include every technical and domain term. Include common abbreviation variants (e.g., "CI/CD" and "Continuous Integration/Continuous Deployment")
- bold_keywords: the highest-signal keywords for this specific role — will be visually emphasized in the final resume
- calibration.seniority_expectations: interpret what scope of impact, leadership, and technical depth this level demands
- Use null for missing scalars, [] for missing arrays

Job description:
$job_description"""

EXTRACT_JD_INTELLIGENCE_PROMPT = USER_TEMPLATE
EXTRACT_KEYWORDS_PROMPT = USER_TEMPLATE

EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT = JD_INTELLIGENCE_CONTRACT_BLOCK
EXTRACT_KEYWORDS_SYSTEM_PROMPT = EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT

INSTRUCTIONS = JD_INTELLIGENCE_CONTRACT_BLOCK
RULES = JD_INTELLIGENCE_CRAFT_BLOCK
DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip() + "\n\n" + RULES.strip()
VARIABLES = {
    "job_description": "Full or trimmed job description text",
}


def build_messages(job_description: str) -> tuple[str, str]:
    from app.prompts import load_override, load_shared_rules_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(comp["user"], job_description=job_description)

    instructions = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    rules = (
        load_override(STEP_NAME, "rules")
        or load_shared_rules_override("jd_intel")
        or RULES
    )
    system = instructions.strip() + "\n\n" + rules.strip()
    user = render_user_template(USER_TEMPLATE, job_description=job_description)
    return system, user
