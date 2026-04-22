"""Shared tailoring blocks: craft text, per-mode strategy, and user shell."""

from app.prompts._rules.resume_diff import RESUME_DIFF_RULES

TAILORING_CONTRACT_BLOCK = RESUME_DIFF_RULES

TAILORING_CRAFT_BLOCK = """APPROACH:
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
- Weave keywords throughout: profile summary, per-role tech stack lines, bullets, skills, project descriptions
- Use exact keyword forms from the job intelligence (e.g., "Spring Boot" not "Spring framework", "Kubernetes" not "K8s")
- Place the highest-priority keywords early in bullets and in the profile summary
- Never stuff keywords or write hollow ATS-bait sentences — every keyword sits in a meaningful, natural context"""

TAILORING_MODE_STRATEGY = {
    "full": (
        "TAILORING MODE: Full edit (maximum alignment)\n"
        "- Rewrite bullets to strongly match the target role. Every bullet should serve the candidate's case for this specific role.\n"
        '- Enhance titles with platform, domain, or scope context (e.g., "Software Engineer" → "Software Engineer, Platform & Distributed Systems").\n'
        "- Replace the least applicable bullets with naturally fitting alternatives.\n"
        "- Regroup skills into concise, role-relevant categories.\n"
        "- For projects, relate them to the company's products or domain where the candidate was employed.\n"
        "- Calibrate scope to experience level: early career roles get modest bullets; short stints get proportionally scoped bullets."
    ),
    "lite": (
        "TAILORING MODE: Light touch (conservative alignment)\n"
        "- Improve wording and weave in a few high-priority keywords. Keep the original voice nearly intact.\n"
        "- Do NOT change job titles. Do NOT add scope, platform, or domain qualifiers to titles.\n"
        "- Only touch bullets that clearly benefit from adjustment. Preserve all others exactly as-is.\n"
        "- Do NOT replace bullets with new content. Only refine existing text.\n"
        "- Skills: minor reordering for relevance is OK. Do not restructure or rename groups.\n"
        "- If in doubt about whether a bullet needs changing, leave it unchanged.\n"
        "- Omit unchanged entries from the output."
    ),
}

TAILORING_USER_SHELL = """Tailor this resume for the target role.

MODE: $mode_id

REWRITING EXAMPLE:
Original: "Worked on backend systems"
JD needs: Kubernetes, CI/CD, microservices
Rewritten: "Built and maintained backend microservices deployed on Kubernetes with automated CI/CD pipelines, reducing deployment time from 2 hours to 15 minutes"

JOB INTELLIGENCE:
$job_intelligence

MASTER RESUME:
$original_resume

RESPONSE CONTRACT:
$response_contract

Output language: $output_language"""

TAILORING_SYSTEM_PROMPT = "\n\n".join(
    [TAILORING_CONTRACT_BLOCK, TAILORING_CRAFT_BLOCK, TAILORING_MODE_STRATEGY["full"]]
)

TAILORING_MODE_CONSTRAINTS = {k: v for k, v in TAILORING_MODE_STRATEGY.items()}

IMPROVE_RESUME_PROMPT_TEMPLATE = TAILORING_USER_SHELL
IMPROVE_RESUME_PROMPT = TAILORING_USER_SHELL

REWRITE_RULES_BUNDLE = "\n\n".join(
    [RESUME_DIFF_RULES, TAILORING_CRAFT_BLOCK, TAILORING_MODE_STRATEGY["full"]]
)
