# OpenRouter Model Selection Brief

Use this as context for an OpenRouter model/advisor LLM. Goal: pick the best model/provider setup for this resume-generation app.

## Project Goal

We generate tailored job-application materials from:

- a structured master resume
- a pasted job description
- prompt rules that protect truthfulness, ATS fit, and resume quality

Main product need: fast resume generation with very low hallucination risk. Quality matters more than tiny cost savings, but the budget is still small.

## Current Architecture

- Backend: Python/FastAPI.
- LLM wrapper: LiteLLM-style unified client.
- Current external route can use OpenRouter or CLIProxy/OpenAI-compatible routing.
- Per-step model overrides exist for: `parse_resume`, `extract_jd_intel`, `tailor_resume_full`, `tailor_resume_lite`, `critique_resume`, `rewrite_resume`, `cover_letter`, `answer_questions`.
- Most important path: `extract_jd_intel` -> `tailor_resume_full`.
- Critique/rewrite is currently disabled for fast preview.
- Resume output now uses a compact section-header text format, then backend parses it into a structured diff.
- Streaming is enabled, but the biggest issue is time-to-first-token.

## Latest Measured Run

Latest reviewed run:

- Job: Pickle Robot Company - DevOps Engineer
- Model route: `openai/gemini-3-flash-preview`
- Total LLM time: about `42.6s`
- JD extraction: about `8.2s`
- Main resume generation: about `34.5s`
- Main prompt size: about `16.4k chars / 4.1k estimated tokens`
- Main response size: about `2.9k chars / 730 estimated tokens`
- Time to first token for main generation: about `31.0s`

Interpretation: output size is no longer huge. The remaining latency is mostly provider/model startup, hidden reasoning, or routing delay.

## LLM Use Cases

| Step | What it does | Format | Importance | Ideal model traits |
|---|---|---|---|---|
| `extract_jd_intel` | Converts a job description into compact role/company/keyword signals | JSON/text-like structured | High | Fast, good extraction, low cost |
| `tailor_resume_full` | Rewrites selected resume cells for the job | Section-header text parsed by backend | Critical | Best instruction following, low hallucination, fast first token |
| `tailor_resume_lite` | Smaller/faster tailoring mode | Section-header text | Medium | Very fast, reliable |
| `parse_resume` | Converts uploaded resume text into structured resume JSON | JSON | Medium | Strong JSON, handles messy input |
| `critique_resume` | Reviews generated diff for problems | JSON | Optional | Careful evaluator, can be slower |
| `rewrite_resume` | Fixes generation using critique | Section/diff output | Optional | High quality, strict format |
| `cover_letter` | Generates cover letter + outreach message | Plain text | Medium | Natural writing, company-specific, fast |
| `answer_questions` | Answers application questions from resume/JD | JSON | Medium | Accurate, concise, avoids unsupported claims |
| enrichment steps | Improves one resume bullet/section from user Q&A | JSON | Low/medium | Good writing, cheap |

## Hard Requirements

- Must avoid inventing tools, metrics, employers, certifications, domains, or responsibilities.
- Must preserve the candidate's real career identity; do not blindly copy the job title.
- Must follow structured output formats reliably.
- Must be good with resume writing, ATS keywords, and technical roles.
- Must avoid keyword stuffing and JD phrase copying.
- Must support prompts around 4k-8k tokens today, with room for larger resumes later.
- Must have low time-to-first-token because streaming only helps after first token arrives.

## Current Quality Risks To Optimize Against

Recent warnings included:

- unsupported additions removed after generation
- title/identity changes that were too aggressive
- possible invented metric
- repeated JD keyword families
- low-signal/basic tools leaking into final resume

The best model should reduce these warnings, not just run faster.

## Budget And Volume

Approximate expected usage:

- Tailored resume previews: `20-30/day`
- JD extraction: `20-30/day`, often cacheable
- Cover/outreach: `10-20/day`
- Application questions: `20-25/day`
- Resume parse: rare
- Monthly LLM budget target: about `$5`, flexible if quality is clearly better

## What We Need OpenRouter To Recommend

Please recommend:

1. Best default model for `tailor_resume_full`.
2. Best fast/cheap model for `extract_jd_intel`.
3. Best model for `cover_letter` and `answer_questions`.
4. Whether one model can handle all steps well enough, or whether per-step models are better.
5. Models to avoid because of slow first token, hidden reasoning, weak JSON/format following, or hallucination risk.
6. Expected latency and cost for our prompt sizes.
7. Whether the recommended models support reliable structured output or JSON mode through OpenRouter.

Preferred answer format:

| Step | Recommended OpenRouter model | Why | Expected speed | Expected cost | Risk |
|---|---|---|---|---|---|

## Current Hypothesis To Validate

Likely good candidates to compare:

- Claude Haiku-class model for main resume generation if it gives fast first token and low hallucination.
- DeepSeek chat-class model for cheap structured extraction and possibly main generation.
- GPT mini-class model if it is faster and reliable enough.
- Gemini Flash-class model only if OpenRouter route has low first-token delay and no unwanted hidden thinking overhead.

Please override this hypothesis if newer OpenRouter data suggests a better model.
