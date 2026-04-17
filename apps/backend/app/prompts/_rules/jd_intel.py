"""Shared JD intelligence extraction context (system-side)."""

JD_INTELLIGENCE_CONTRACT_BLOCK = (
    "You are a job description analyst. Extract actionable intelligence for resume tailoring. "
    "Output only valid JSON matching the schema below, no other text."
)

JD_INTELLIGENCE_CRAFT_BLOCK = (
    "Rules:\n"
    "- role.title: strip company name, location, employment type, \"apply now\"-style noise\n"
    "- location: return only `City, ST` (US state abbreviation). Do not return `Remote`, `Hybrid`, `On-site`, regions, or long phrases. If unavailable, return empty string.\n"
    "- company.product_context: infer from team/division description what they build or maintain\n"
    "- responsibility_themes: distill into themes a resume writer can target, not raw JD bullet copies. Examples: \"API architecture & governance\", \"cloud-native microservices\", \"frontend accessibility & performance\"\n"
    "- ats_keywords: include every technical and domain term. Include common abbreviation variants (e.g., \"CI/CD\" and \"Continuous Integration/Continuous Deployment\")\n"
    "- bold_keywords: the highest-signal keywords for this specific role — will be visually emphasized in the final resume\n"
    "- calibration.seniority_expectations: interpret what scope of impact, leadership, and technical depth this level demands\n"
    "- Use null for missing scalars, [] for missing arrays"
)

JD_INTEL_RULES = JD_INTELLIGENCE_CONTRACT_BLOCK

RULES_NAME = "jd_intel"
RULES_LABEL = "JD Intelligence Output"
USED_BY = ["extract_jd_intel"]
