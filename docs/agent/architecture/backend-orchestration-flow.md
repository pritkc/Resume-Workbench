# Backend Orchestration Flow

> Canonical map of the backend orchestration flow.

This file is the quickest way to understand the backend user journey from the first resume upload to the final application package.

If you want the main happy path only, read these steps in order:

`1 -> 2 -> 3 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13 -> 14`

## Core Records Created Along The Way

- `Resume`: stored by [`Database.create_resume()`](apps/backend/app/database.py#L192) and [`Database.create_resume_atomic_master()`](apps/backend/app/database.py#L228)
  What it is: the master resume, draft resume, or a confirmed tailored resume.

- `Job`: stored by [`Database.create_job()`](apps/backend/app/database.py#L289)
  What it is: the raw JD plus extracted target metadata and cached keyword analysis.

- `Application Pack`: stored by [`Database.create_application_pack()`](apps/backend/app/database.py#L321)
  What it is: the package-level container tying one base resume to one JD and, later, one confirmed tailored resume.

- `Generation Run`: stored by [`Database.create_generation_run()`](apps/backend/app/database.py#L440)
  What it is: the execution log for preview, confirm, and legacy improvement steps.

- `Artifact`: stored by [`Database.create_artifact()`](apps/backend/app/database.py#L483)
  What it is: the YAML, Typst, PDF, PNG previews, HTML debug file, and markdown render output.

- `Improvement`: stored via [`Database.create_improvement()`](apps/backend/app/database.py#L515)
  What it is: a legacy generation-run record used to remember job context and improvement suggestions for a tailored resume.

- `LLM Call`: stored by [`Database.create_llm_call()`](apps/backend/app/database.py#L540)
  What it is: per-call observability for parsing, keyword extraction, tailoring, cover letters, outreach, and enrichment.

## 1. App Startup And Router Wiring

- Entry point: [`app.main`](apps/backend/app/main.py#L44)
  What it does: creates data directories, initializes the database, and wires all API routers.

- Router registration: [`app.include_router(...)`](apps/backend/app/main.py#L88)
  What it does: exposes the backend feature areas:
  `resumes`, `jobs`, `application-packs`, `artifacts`, `llm`, `enrichment`, `themes`, `config`, `health`.

- LLM trace scoping: [`llm_trace_scope()`](apps/backend/app/llm.py#L218)
  What it does: attaches one high-level trace id to all nested LLM calls for a request.

## 2. First Resume Upload

- API entry: [`upload_resume()`](apps/backend/app/routers/resumes.py#L857)
  What it does: validates file type/size, converts the document to markdown, stores it immediately, then tries to parse it into structured JSON.

- Master-resume assignment: [`Database.create_resume_atomic_master()`](apps/backend/app/database.py#L228)
  What it does: makes the first valid resume the master resume and stores the original markdown for later recovery/reference.

- Resume storage: [`Database.create_resume()`](apps/backend/app/database.py#L192)
  What it does: persists the raw record fields like `content`, `processed_data`, `original_markdown`, `processing_status`, and links to application packs later.

## 3. Convert The Uploaded File Into Markdown

- File conversion: [`parse_document()`](apps/backend/app/services/parser.py#L119)
  What it does: writes the upload to a temp file, runs `MarkItDown`, and returns markdown text.

- Why markdown is important:
  It becomes the source material for the LLM parser and is also kept in `original_markdown` so the system can restore lost month-level dates later.

## 4. Parse Markdown Into Structured Resume JSON

- LLM parsing: [`parse_resume_to_json()`](apps/backend/app/services/parser.py#L144)
  What it does: sends the markdown resume to the LLM and asks for `ResumeData`-shaped JSON.

- Generic JSON LLM wrapper: [`complete_json()`](apps/backend/app/llm.py#L1457)
  What it does: calls the configured provider, retries malformed/truncated JSON, and records observability.

- Month restoration: [`restore_dates_from_markdown()`](apps/backend/app/services/parser.py#L40)
  What it does: patches year-only dates back to month-inclusive dates using the original markdown.

- Validation target: [`ResumeData.model_validate(...)`](apps/backend/app/services/parser.py#L177)
  What it does: ensures the parsed object matches the backend schema before the resume is marked `ready`.

## 5. Read, Normalize, Edit, And Preview The Master Resume

- Fetch one resume: [`get_resume()`](apps/backend/app/routers/resumes.py#L943)
  What it does: returns raw content, processed JSON, saved cover letter/outreach, parent linkage, and theme settings.

- List resumes: [`list_resumes()`](apps/backend/app/routers/resumes.py#L1078)
  What it does: returns the visible resume library and merges target role/company/location from application packs when available.

- Normalize a draft before saving: [`normalize_resume_draft()`](apps/backend/app/routers/resumes.py#L993)
  What it does: normalizes incoming draft data and theme settings into the backend’s canonical schema.

- Render a draft preview without saving: [`render_resume_draft_preview()`](apps/backend/app/routers/resumes.py#L1032)
  What it does: renders draft JSON into preview artifacts using RenderCV.

- Save edited structured data: [`update_resume_endpoint()`](apps/backend/app/routers/resumes.py#L1824)
  What it does: updates a resume with structured JSON from the builder.

- Save a draft plus theme settings: [`save_resume_draft()`](apps/backend/app/routers/resumes.py#L1871)
  What it does: normalizes and persists an edited draft version.

## 6. Optional: Enrich The Master Resume Before Tailoring

- Analyze weak experience/project content: [`analyze_resume()`](apps/backend/app/routers/enrichment.py#L94)
  What it does: asks the LLM which items are vague and what clarification questions should be asked.

- Generate new bullets from user answers: [`generate_enhancements()`](apps/backend/app/routers/enrichment.py#L173)
  What it does: turns the user’s answers into additional description bullets.

- Apply those bullets: [`apply_enhancements()`](apps/backend/app/routers/enrichment.py#L332)
  What it does: appends the newly generated bullets into the selected experience/project entries.

- Regenerate selected sections with instructions: [`regenerate_items()`](apps/backend/app/routers/enrichment.py#L514)
  What it does: rewrites selected experience/project/skills-group content based on direct user feedback.

- Persist regenerated content: [`apply_regenerated_items()`](apps/backend/app/routers/enrichment.py#L577)
  What it does: writes the regenerated content back into the master resume JSON.

## 7. Add The Job Description

- JD upload API: [`upload_job_descriptions()`](apps/backend/app/routers/jobs.py#L12)
  What it does: stores one or more raw job descriptions and links them to a resume if `resume_id` is supplied.

- Metadata extraction without a full LLM call: [`extract_job_target_metadata()`](apps/backend/app/services/cover_letter.py#L180)
  What it does: pulls likely role, company, and location from the JD text so the UI can show target context early.

- Read one JD: [`get_job()`](apps/backend/app/routers/jobs.py#L47)
  What it does: returns the stored raw JD record.

## 8. Start The Tailoring Journey With Application Pack Preview

- Preferred package preview endpoint: [`preview_application_pack()`](apps/backend/app/routers/application_packs.py#L51)
  What it does: thin wrapper around resume preview flow, but conceptually this is the “start package” API.

- Actual preview engine entry: [`improve_resume_preview_endpoint()`](apps/backend/app/routers/resumes.py#L1115)
  What it does: loads the resume + JD, resolves prompt mode, sets trace scope, and runs the preview pipeline with a timeout.

- Main preview flow: [`_improve_preview_flow()`](apps/backend/app/routers/resumes.py#L1179)
  What it does: fetches/caches **JD intelligence JSON** (`job_keywords`), generates the tailored resume preview, computes diffs and change-manifest metadata, creates the application pack, and renders preview artifacts.

## 9. Extract JD Intelligence And Build Tailoring Context

- JD extraction: [`extract_job_keywords()` / `extract_jd_intelligence()`](apps/backend/app/services/tailoring/analysis.py) — calls the LLM and returns a **JSON blob** persisted as `jobs.job_keywords` (shape follows **`extract_jd_intel`** prompts). [`enrich_jd_intel_blob()`](apps/backend/app/services/tailoring/jd_intel_blob.py) fills nested **`role`**, **`company`**, and **`location`** when missing. Tailoring **user** templates expand this blob via **`$extract_jd_intel_output`** (optional dot paths) before `string.Template` — see [`render_user_template`](apps/backend/app/prompts/_prompt_loader.py).

- Keyword harvesting for local checks: [`collect_job_keywords()`](apps/backend/app/services/tailoring/analysis.py) — collects deduped strings from **list nodes anywhere** in the blob (used by verification and suggestions).

- Supported-keyword filtering: [`find_supported_keywords()`](apps/backend/app/services/tailoring/analysis.py) — keyword subset already present in the source resume text.

- Tailoring handoff from router to service: [`_generate_tailored_resume_data()`](apps/backend/app/routers/resumes.py#L616)
  What it does: loads the original structured resume, finds cleanup source data, and calls the primary tailoring orchestration service.

## 10. Run The Main Tailoring LLM Call

- Main orchestration service: [`generate_tailored_resume()`](apps/backend/app/services/tailoring/orchestration.py#L34)
  What it does: resolves prompt mode, builds the LLM-facing resume payload, creates a response contract, assembles the prompt, calls the LLM for a compact addressed diff, optionally runs critique/rewrite, then restores the full resume locally.

- Tailoring response contract: [`build_response_contract()`](apps/backend/app/services/tailoring/contracts.py#L61)
  What it does: tells the LLM which top-level keys and section fields it is allowed to return.

- Prompt assembly: [`build_prompt_context()`](apps/backend/app/services/tailoring/prompting.py)
  What it does: serializes the compact resume JSON, passes **`jd_intel_blob`** so **`$extract_jd_intel_output`** placeholders (with optional dot paths) expand before **`string.Template`**, and serializes the response contract into one prompt context (`extract_jd_intel_output_json` on the context object is the compact JD JSON string for logging or reuse).

- Prompt rendering: [`render_tailoring_prompt()`](apps/backend/app/services/tailoring/prompting.py#L110)
  What it does: injects the context into the actual tailoring prompt template.

- LLM call: [`complete_json()`](apps/backend/app/llm.py#L1457)
  What it does: sends the full tailoring request as a JSON-only completion and records the attempt in `llm_calls`.

- Compact-diff validation: [`validate_compact_diff()`](apps/backend/app/services/tailoring/validation.py)
  What it does: validates the model's addressed diff against the response contract. This is currently observability-only: validation issues are logged and attached to the latest matching LLM call as `request_context.compact_diff_validation`, but P1 tailoring continues.

- Optional critique/rewrite: [`critique_resume` / `rewrite_resume`](apps/backend/app/services/tailoring/orchestration.py)
  What it does: when `prompt_id == "full"` and `/api/v1/config/critique` is enabled, the first compact diff is critiqued and rewritten before local application.

## 11. Rehydrate, Clean Up, And Verify The Tailored Resume

- Apply compact diff: [`apply_compact_diff()`](apps/backend/app/services/tailoring/preservation.py)
  What it does: applies the model's compact `summary` / `experience` / `projects` / `skills` / `bold_keywords` response to the original resume using indexed contract addresses. It preserves prefix tech-stack lines, ignores out-of-range indices, filters low-signal terms, and supports older list/string shapes where possible.

- Rebuild the full resume shape: [`rehydrate_tailoring_resume()`](apps/backend/app/services/tailoring/preservation.py#L258)
  What it does: takes the smaller tailoring payload and rebuilds a complete `ResumeData` object by reattaching `personalInfo`, `education`, and `sectionMeta`.

- Finalize the tailored payload: [`finalize_tailored_resume()`](apps/backend/app/services/tailoring/preservation.py#L282)
  What it does: preserves personal info, restores dates, restores or simplifies skills, protects custom sections, rehydrates `sectionMeta`, runs cleanup, filters low-signal terms, enforces original description counts, verifies the output, and returns the final structured resume plus warnings.

- Local cleanup: [`apply_local_resume_cleanup()`](apps/backend/app/services/tailoring/preservation.py#L225)
  What it does: removes AI-sounding phrasing and strips unsupported additions against the source resume.

- Final verification: [`verify_generated_resume_result()`](apps/backend/app/services/tailoring/verification.py#L49)
  What it does: checks for identity changes, invented metrics, size bloat, and missed supported keywords.

- Tailoring-specific models: [`TailoringExperience`](apps/backend/app/services/tailoring/models.py) and [`TailoringProject`](apps/backend/app/services/tailoring/models.py)
  What they do: isolate the LLM-facing shape from shared resume-schema aliases so `description`, `highlights`, and `techStack` do not overwrite each other during tailoring.

## 12. Compute Diff Summary And Human-Facing Improvement Hints

- Router-level diff bridge: [`_calculate_diff_from_resume()`](apps/backend/app/routers/resumes.py#L646)
  What it does: compares the original structured resume against the improved resume and returns both summary and detailed changes.

- Actual diff engine: [`calculate_resume_diff()`](apps/backend/app/services/tailoring/diffing.py#L318)
  What it does: computes structured changes across summary, work bullets, education, projects, and skills.

- Suggestion generator: [`generate_improvements()`](apps/backend/app/services/tailoring/suggestions.py#L8)
  What it does: creates simple keyword-alignment suggestions for the frontend to show.

- Change manifest: [`build_change_manifest()`](apps/backend/app/services/tailoring/change_manifest.py)
  What it does: builds indexed path-level change rows, enriches reasons from compact `why` cells, and can add unchanged-cell rationales that are useful for review/training even when the final text is retained.

- Stage breakdown: [`build_stage_breakdown()`](apps/backend/app/services/tailoring/change_manifest.py)
  What it does: accounts for declared, computed, applied, rejected, cleanup-only, skill, numeric-claim, and final-render changes plus whether location came from the JD, master resume, or neither.

## 13. Title And On-Demand Auxiliary Documents

- Title generation: [`build_job_target_title()`](apps/backend/app/services/cover_letter.py#L213)
  What it does: creates titles like `Software Engineer @ PayPal, Inc.` from JD metadata locally. Preview and confirm do this without an LLM call.

- Merged auxiliary endpoint: [`generate_auxiliary_package_endpoint()`](apps/backend/app/routers/resumes.py)
  What it does: after a tailored resume exists, generates both cover letter and outreach in one LLM call and stores both on the tailored resume.

- Cover letter generation: [`generate_cover_letter()`](apps/backend/app/services/cover_letter.py#L256)
  What it does: older helper API; current public endpoints use `generate_cover_letter_and_outreach()` so one merged call can populate both fields.

- Outreach generation: [`generate_outreach_message()`](apps/backend/app/services/cover_letter.py#L300)
  What it does: older helper API; current public endpoints use `generate_cover_letter_and_outreach()` so one merged call can populate both fields.

## 14. Create The Preview Application Pack And Render Artifacts

- Create application pack record: [`Database.create_application_pack()`](apps/backend/app/database.py#L321)
  What it does: creates the package container linking base resume + JD + target metadata.

- Create preview generation run: [`Database.create_generation_run()`](apps/backend/app/database.py#L440)
  What it does: stores preview metadata like diff summary, hash, LLM summary, warnings, change-manifest payloads, pipeline timing, target title, and any existing auxiliary content.

- Render package bundle: [`render_resume_bundle()`](apps/backend/app/rendering/rendercv_engine.py#L82)
  What it does: converts structured resume JSON into RenderCV YAML, Typst, PDF, PNGs, markdown, and HTML.

- Transform resume JSON into RenderCV schema: [`resume_to_rendercv_payload()`](apps/backend/app/rendering/rendercv_adapter.py#L477)
  What it does: maps backend `ResumeData` fields into RenderCV’s expected payload.

- Persist artifacts: [`store_rendercv_bundle()`](apps/backend/app/services/artifact_service.py#L26)
  What it does: copies generated files into the artifact directory and creates artifact rows for each file.

- Download one artifact: [`download_artifact()`](apps/backend/app/routers/artifacts.py#L13)
  What it does: serves any stored package file by `artifact_id`.

- [NOTE] Preview hash persistence is last-write-wins:
  [`_improve_preview_flow()`](apps/backend/app/routers/resumes.py#L1238)
  What it means: if multiple previews run concurrently for the same JD, the saved preview hash can race.

## 15. Confirm The Application Pack

- Preferred confirm endpoint: [`confirm_application_pack()`](apps/backend/app/routers/application_packs.py#L58)
  What it does: thin wrapper over the resume confirm flow.

- Actual confirm engine: [`improve_resume_confirm_endpoint()`](apps/backend/app/routers/resumes.py#L1395)
  What it does: validates the preview payload, recalculates diff, reuses existing auxiliary content if present, creates the final tailored resume, renders final artifacts, and marks the application pack confirmed.

- Confirm-time auxiliary behavior:
  What it does: confirm reuses any already stored `cover_letter` / `outreach_message` from the source resume, but the current Tailor page sends auxiliary flags as `false` and confirm does not generate new auxiliary text. Users generate cover letter/outreach later from the builder.

- Confirm payload validation: [`_validate_confirm_payload()`](apps/backend/app/routers/resumes.py#L668)
  What it does: makes sure the confirmed payload did not mutate protected personal info fields.

- Final tailored resume storage: [`Database.create_resume()`](apps/backend/app/database.py#L192)
  What it does: persists the confirmed tailored resume as a child of the master resume and links it to the application pack.

- Improvement/job-context storage: [`Database.create_improvement()`](apps/backend/app/database.py#L515)
  What it does: stores the suggestion list and the JD link so later builder endpoints can generate cover letters/outreach and fetch the source JD.

- [NOTE] Confirm currently trusts preview-hash validation more than server-side stored preview content:
  [`improve_resume_confirm_endpoint()`](apps/backend/app/routers/resumes.py#L1425)
  What it means: the payload must match a known preview hash, but the server does not yet store and re-hydrate the entire preview blob as the source of truth.

## 16. Final Resume Package Outputs

- Package list/read API: [`list_application_packs()`](apps/backend/app/routers/application_packs.py#L33)
  What it does: lists confirmed or preview-ready application packs for the UI.

- Saved-theme PDF generation: [`download_resume_pdf_with_config()`](apps/backend/app/routers/resumes.py#L1916)
  What it does: renders a final PDF using the rich theme payload sent by the frontend.

- Legacy query-param PDF generation: [`download_resume_pdf()`](apps/backend/app/routers/resumes.py#L1959)
  What it does: renders using the older template query params.

- Saved-theme preview generation: [`render_resume_preview_with_config()`](apps/backend/app/routers/resumes.py#L2035)
  What it does: renders preview artifacts using the rich theme config.

- Legacy preview generation: [`render_resume_preview()`](apps/backend/app/routers/resumes.py#L2080)
  What it does: renders preview artifacts using legacy query params.

- Cover letter PDF: [`download_cover_letter_pdf()`](apps/backend/app/routers/resumes.py#L2443)
  What it does: prints the stored cover letter into a PDF using the frontend print template.

## 17. Optional: Legacy One-Step Tailor Flow

- Direct tailor endpoint: [`improve_resume_endpoint()`](apps/backend/app/routers/resumes.py#L1661)
  What it does: older shortcut flow that directly creates a tailored resume without going through preview/confirm application-pack confirmation.

- Why it exists:
  It keeps older clients working, but the richer and safer package flow is now the preview/confirm application-pack path.

## 18. Optional: Post-Tailoring Support Endpoints

- Retry failed parse: [`retry_processing()`](apps/backend/app/routers/resumes.py#L2161)
  What it does: re-runs resume parsing for failed or stuck uploads.

- Manually edit generated cover letter: [`update_cover_letter()`](apps/backend/app/routers/resumes.py#L2219)
  What it does: saves edited letter text.

- Manually edit outreach message: [`update_outreach_message()`](apps/backend/app/routers/resumes.py#L2232)
  What it does: saves edited outreach text.

- Manually edit title: [`update_title()`](apps/backend/app/routers/resumes.py#L2245)
  What it does: saves the user-facing title for the tailored resume/package.

- Generate cover letter later: [`generate_cover_letter_endpoint()`](apps/backend/app/routers/resumes.py#L2257)
  What it does: generates the merged cover-letter/outreach package for an already-tailored resume, stores both fields, and returns the cover letter field.

- Generate outreach later: [`generate_outreach_endpoint()`](apps/backend/app/routers/resumes.py#L2330)
  What it does: generates the merged cover-letter/outreach package for an already-tailored resume, stores both fields, and returns the outreach field.

- Generate both later: [`generate_auxiliary_package_endpoint()`](apps/backend/app/routers/resumes.py)
  What it does: generates and returns both cover letter and outreach for an already-tailored resume.

- Fetch the JD used for a tailored resume: [`get_job_description_for_resume()`](apps/backend/app/routers/resumes.py#L2401)
  What it does: walks through the stored improvement record and returns the original JD.

## 19. LLM Observability

- List raw LLM calls: [`list_llm_calls()`](apps/backend/app/routers/llm.py#L15)
  What it does: exposes stored LLM call rows for debugging by trace id, request scope, operation, and success state.

- Summarize LLM calls: [`summarize_llm_calls()`](apps/backend/app/routers/llm.py#L37)
  What it does: returns token/cost/call counts for one trace or request scope.

- Text completion wrapper: [`complete()`](apps/backend/app/llm.py#L1080)
  What it does: handles cover letters and outreach generation.

- JSON completion wrapper: [`complete_json()`](apps/backend/app/llm.py#L1457)
  What it does: handles resume parsing, JD keyword extraction, tailoring, and enrichment flows.

## 20. Short Mental Model

1. User uploads a resume.
2. Backend converts it to markdown.
3. Backend parses markdown into `ResumeData`.
4. User optionally edits/enriches the master resume.
5. User uploads a JD.
6. Backend extracts JD keywords/metadata.
7. Backend builds a compact tailoring prompt and calls the LLM for an addressed diff.
8. Optional full-mode critique/rewrite may produce a second-pass addressed diff.
9. Backend applies the compact diff, rehydrates, cleans, and verifies a full resume.
10. Backend computes diff, change manifest, stage breakdown, suggestions, and local title.
11. Backend creates an application pack preview and renders artifacts.
12. User confirms the preview.
13. Backend creates the final tailored child resume, final artifacts, and package records.
14. User generates cover letter/outreach on demand or edits/downloads the final package outputs.

## Current Refactor Risk Points To Remember

- The active flow now uses tailoring-specific `TailoringExperience` / `TailoringProject` models plus compact-diff application to avoid the old shared-schema `description` / `highlights` aliasing bug.
- Compact-diff validation is intentionally non-fatal. Use `request_context.compact_diff_validation`, `change_manifest`, `cleanup_changes`, and `change_breakdown` together when debugging whether a model edit was applied, rejected, or later cleaned.
- Preview hashes are still persisted on the job and are last-write-wins for concurrent previews of the same JD.
