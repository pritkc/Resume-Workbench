"""Prompts: cover letter, outreach, and combined generation."""

from app.prompts._constants import PROMPT_VERSIONS

STEP_NAME = "cover_letter"
STEP_LABEL = "Cover letter and outreach"
STEP_VERSION = PROMPT_VERSIONS["cover_letter_outreach"]
FILE_PATH = "prompts/cover_letter.py"
PIPELINE = "standalone"
PIPELINE_ORDER = 10
RECEIVES_FROM: list[str] = []
FEEDS_INTO: list[str] = []

COVER_LETTER_PROMPT = """Write one cover letter the candidate could send as-is. It should read like they typed it themselves: clear, calm, and short. No template voice, no performance.

IMPORTANT:
- Write in $output_language
- Plain text only, one letter only
- Do NOT use em dash ("—") anywhere in the output

JOB TARGET (JSON):
$job_target

JOB DESCRIPTION EXCERPT:
$job_description

CANDIDATE PROFILE (JSON):
$resume_profile

VOICE (match the resume tailoring standard):
- Sound human: direct sentences, normal words, one thought per sentence
- Confidence without selling: state fit and proof; do not hype, flatter the company, or pad with adjectives
- Respect their time: no throat-clearing, no repeating the posting back to them, no "I am writing to apply"
- Specific over generic: tie the opening to one concrete detail from the JD (product, stack, problem, team mandate), not generic interest
- Banned tone and vocabulary: spearheaded, leveraged, orchestrated, utilized, facilitated, synergy, robust, scalable, holistic, proactive, streamlined, cutting-edge, state-of-the-art, thrilled, passionate, excited to, game-changer, delve, tapestry, landscape (when buzzwordy)
- No rhetorical questions, no clichés ("perfect fit", "dream role"), no emojis

STRUCTURE:
- About 95-165 words in 3 tight paragraphs (use 4 only if needed for a career pivot)
- Paragraph 1: why this role, anchored in one JD-specific detail
- Paragraph 2: 1-2 relevant facts from the profile only (role, scope, tech, or outcome). No invented metrics or employers
- Paragraph 3: brief, neutral close (open to a conversation). No desperation, no oversharing

FACTS:
- Do NOT invent facts, metrics, titles, or names
- Do NOT use placeholder text, brackets, or "Hiring Manager" style fake names
- If the candidate is changing direction, one honest line is enough; stay relevant

FORMAT:
- No letterhead, no markdown, no bullet lists in the body, no signature block with address blocks
- Return the final letter only, not a draft or plan
"""

OUTREACH_MESSAGE_PROMPT = """Write one short personal message (LinkedIn or email body) about this opportunity. It should feel like a busy professional sent it between meetings: brief, specific, not mass-blast.

IMPORTANT:
- Write in $output_language
- Plain text only, one message only
- Do NOT use em dash ("—") anywhere in the output

JOB TARGET (JSON):
$job_target

JOB DESCRIPTION EXCERPT:
$job_description

CANDIDATE PROFILE (JSON):
$resume_profile

VOICE (match the resume tailoring standard):
- Peer tone: confident, not salesy; warm enough to be civil, never eager or ingratiating
- No template openers: do not start with "I'm reaching out", "I hope this finds you well", "I came across your posting", or "I wanted to touch base"
- No hype: avoid excited, passionate, thrilled, amazing, incredible, synergy, leverage, circle back, pick your brain
- Respect their time: about 50-95 words, 3-4 short sentences unless a fifth is needed for clarity
- First sentence: one concrete anchor from the role or company (from the JD), not a self-introduction
- One sentence: strongest relevant credential with a concrete detail only if it is in the profile
- Last sentence: one low-friction ask (e.g., short call, right person to speak with). No pressure, no fake urgency

FACTS:
- Do NOT invent facts, metrics, or names
- If the recipient's name is not in JOB TARGET, do not invent a name or use "Dear [Name]" placeholders
- Do NOT add a subject line, signature block, or markdown

Return the final message only, not a draft or plan
"""

COVER_LETTER_OUTREACH_PROMPT = """Generate both outputs in one pass using the same context:
1) a cover letter
2) a short outreach message

IMPORTANT:
- Write both outputs in $output_language
- Return plain text only using this exact wrapper format:
<<COVER_LETTER>>
[cover letter body]
<<END_COVER_LETTER>>
<<OUTREACH_MESSAGE>>
[outreach message body]
<<END_OUTREACH_MESSAGE>>
- Do NOT use markdown, JSON, or any extra commentary outside those wrappers
- Do NOT use em dash ("—") anywhere in either message

JOB TARGET (JSON):
$job_target

JOB DESCRIPTION EXCERPT:
$job_description

CANDIDATE PROFILE (JSON):
$resume_profile

COVER LETTER REQUIREMENTS:
- 95-165 words, 3 tight paragraphs (4 only for a genuine pivot)
- Human, direct, specific, no template voice, no hype
- Anchor paragraph 1 in one concrete JD detail
- Paragraph 2 includes 1-2 profile-grounded facts only (no invented metrics/facts)
- Paragraph 3 ends with a clean, neutral closing
- Plain text body only (no letterhead, markdown, signature block)

OUTREACH MESSAGE REQUIREMENTS:
- 50-95 words, 3-4 short sentences
- Peer-professional tone: concise, confident, not salesy
- Start with one concrete role/company anchor from JD
- Include one strongest relevant credential from profile
- End with one low-friction ask
- Plain text only (no subject line, no signature block, no markdown)

FACTS:
- Use only information from provided JSON/context
- Do not invent names, metrics, employers, dates, or credentials
- If recipient name is unknown, do not invent one
"""

COVER_LETTER_SYSTEM_PROMPT = (
    "You write concise job application letters in the candidate's own voice: human, direct, and credible. "
    "Output one final cover letter in plain text only. "
    "No planning steps, no alternatives, no placeholders, no markdown."
)
OUTREACH_SYSTEM_PROMPT = (
    "You write short professional outreach notes that sound personally composed, not generated. "
    "Output one final message in plain text only. "
    "No planning steps, no alternatives, no placeholders, no markdown."
)
COMBINED_MESSAGES_SYSTEM_PROMPT = (
    "You write concise, professional cover letters and outreach messages grounded only in provided context. "
    "Output plain text only using the exact wrapper tags for the cover letter and outreach message. "
    "No markdown, no placeholders, no extra commentary."
)

INSTRUCTIONS = COMBINED_MESSAGES_SYSTEM_PROMPT
RULES = ""
USER_TEMPLATE = COVER_LETTER_OUTREACH_PROMPT
DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip() + ("\n\n" + RULES.strip() if RULES.strip() else "")
VARIABLES = {
    "output_language": "Target language",
    "job_target": "Role/company JSON",
    "job_description": "JD excerpt",
    "resume_profile": "Candidate profile JSON",
}


def build_messages(
    *,
    job_target: str,
    job_description: str,
    resume_profile: str,
    output_language: str,
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
            output_language=output_language,
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
        output_language=output_language,
    )
    return system, user
