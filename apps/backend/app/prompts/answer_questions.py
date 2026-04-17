"""Prompt: answer_questions — job application custom question answers."""

from app.prompts._constants import PROMPT_VERSIONS

STEP_NAME = "answer_questions"
STEP_LABEL = "Application questions"
STEP_VERSION = PROMPT_VERSIONS["application_questions_generate"]
FILE_PATH = "prompts/answer_questions.py"
PIPELINE = "standalone"
PIPELINE_ORDER = 11
RECEIVES_FROM: list[str] = []
FEEDS_INTO: list[str] = []

APPLICATION_QUESTIONS_PROMPT = """Write personalized answers for job-application custom questions using only the provided resume/JD context.

STYLE:
- Fixed default style: professional, concise, confident
- Directly answer each question in plain text
- Keep each answer compact (typically 2-5 sentences) unless the question requires more detail

GROUNDING RULES:
- Use only facts supported by candidate profile, tailored resume context, and job context
- Do not invent employers, dates, certifications, credentials, metrics, or legal claims
- If context is weak, provide the best truthful answer and include a short warning

FORMAT:
- Return valid JSON only with this exact shape:
{
  "answers": [
    {
      "question_id": "q_0",
      "answer": "string",
      "confidence": "high|medium|low",
      "warnings": ["optional warning"]
    }
  ]
}
- Return one answer object for every input question_id
- Do not include markdown or extra keys

JOB TARGET (JSON):
$job_target

JOB DESCRIPTION EXCERPT:
$job_description

CANDIDATE PROFILE (JSON):
$resume_profile

TAILORED RESUME CONTEXT (JSON):
$tailored_resume_context

QUESTIONS (JSON):
$questions
"""

APPLICATION_QUESTIONS_SYSTEM_PROMPT = (
    "You answer job-application custom questions using only supplied context. "
    "Output JSON only. No markdown."
)

INSTRUCTIONS = APPLICATION_QUESTIONS_SYSTEM_PROMPT
RULES = ""
USER_TEMPLATE = APPLICATION_QUESTIONS_PROMPT
DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip()
VARIABLES = {
    "job_target": "Role/company JSON",
    "job_description": "JD excerpt",
    "resume_profile": "Candidate profile JSON",
    "tailored_resume_context": "Tailored resume JSON",
    "questions": "Questions list JSON",
}


def build_messages(
    *,
    job_target: str,
    job_description: str,
    resume_profile: str,
    tailored_resume_context: str,
    questions: str,
) -> tuple[str, str]:
    from app.prompts import load_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(
            comp["user"],
            job_target=job_target,
            job_description=job_description,
            resume_profile=resume_profile,
            tailored_resume_context=tailored_resume_context,
            questions=questions,
        )

    instructions = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    rules = load_override(STEP_NAME, "rules") or RULES
    system = instructions.strip()
    if rules.strip():
        system = system + "\n\n" + rules.strip()
    user = render_user_template(
        USER_TEMPLATE,
        job_target=job_target,
        job_description=job_description,
        resume_profile=resume_profile,
        tailored_resume_context=tailored_resume_context,
        questions=questions,
    )
    return system, user
