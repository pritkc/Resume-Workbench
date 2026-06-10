# Frontend API Client

> Current client modules under `apps/frontend/lib/api/`.

## Base Client

`client.ts` exports:

- `API_URL`
- `API_BASE`
- `apiFetch`
- `apiPost`
- `apiPatch`
- `apiPut`
- `apiDelete`
- `getUploadUrl`

## Resume API

`resume.ts` now covers:

- job upload
- direct improve
- application-pack preview
- application-pack confirm
- resume fetch/list/update/delete
- draft normalize/save/render-preview
- RenderCV PDF and preview calls
- retry-processing
- cover-letter and outreach updates
- title rename
- merged cover-letter/outreach package generation plus single-field generation endpoints
- JD-tailor diff snapshot fetch
- job-description fetch for JD Match

Important types exported from this file include:

- `ResumeUploadResponse`
- `ResumeListItem`
- `ResumeDraftRequest`
- `ResumeDraftResponse`
- `DraftValidationDetail`
- `DraftRequestError`
- `RawYamlSections`

## Config API

`config.ts` covers:

- provider/model/api-base config
- LLM health tests
- system status
- feature flags
- language config
- prompt config
- prompt catalog, prompt composer, and shared-rule overrides
- generation defaults
- critique toggle
- per-step model overrides
- provider-specific API-key management
- database reset

Important config types:

- `LLMConfig`
- `PromptConfig`
- `GenerationDefaults`
- `ApiKeyStatusResponse`

## LLM Observability API

`llm.ts` exports:

- `fetchLlmCalls()`
- `fetchLlmCallSummary()`
- generation-run timing fetch helpers

Core record types:

- `LLMCallRecord`
- `LLMCallSummary`
- `LLMOperationSummary`

## Current Provider Defaults

Provider defaults live in `config.ts::PROVIDER_INFO`, and the Settings page uses them to seed model suggestions when a provider changes.
