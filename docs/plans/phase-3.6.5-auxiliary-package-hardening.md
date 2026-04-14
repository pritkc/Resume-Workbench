# Phase 3.6.5: Auxiliary Package Hardening

## Goal

Keep cover letter + outreach generation as one shared LLM request, while making the flow resilient enough that malformed JSON or partial wrapper issues do not break the tailoring pipeline.

## Final Architecture

1. One shared generator
   - All package generation now goes through `generate_cover_letter_and_outreach(...)`.
   - Preview, confirm backfill, and the on-demand cover-letter/outreach endpoints all use that same shared generator.
   - We no longer branch into separate cover-letter and outreach prompts for normal recovery.

2. Wrapper-tag response format instead of strict JSON
   - The merged prompt now asks for plain text with exact wrappers:
   - `<<COVER_LETTER>> ... <<END_COVER_LETTER>>`
   - `<<OUTREACH_MESSAGE>> ... <<END_OUTREACH_MESSAGE>>`
   - This avoids the brittle failure mode where a valid-looking response is unusable only because of broken JSON punctuation.

3. Multi-layer parsing
   - Primary parse path: exact wrapper tags.
   - Fallback parse path: JSON object with `cover_letter` and `outreach_message`.
   - Final fallback parse path: labeled headings such as `Cover Letter:` and `Outreach Message:`.
   - This lets us salvage older or slightly off-format model responses without adding a second feature call.

4. Graceful degradation
   - If the auxiliary package fails, resume preview/confirm still proceeds.
   - The package is treated as an auxiliary artifact, not a reason to fail the full tailoring result.
   - The response includes a warning so the UI and logs make the failure visible.

5. One UI boolean
   - The tailor page now exposes one toggle: `CL + message package`.
   - The stored defaults still persist through the existing config API using:
   - `include_cover_letter`
   - `include_outreach_message`
   - Both values are kept in sync from the single UI toggle, which avoids a schema migration and keeps the existing endpoints compatible.

## Why this is more stable

- One prompt, one logical package, one parsing contract.
- No dependency on strict JSON correctness for success.
- No duplicated prompt/context construction.
- No silent mismatch between UI intent and backend generation flags.
- No extra LLM feature call when the user wants the full package.
