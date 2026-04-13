# Phase 3.6.2 - CLIProxyAPI Technical Flow (Fast Path First)

**Date:** 2026-04-13 (America/Los_Angeles)  
**Status:** Implementation plan (POC-first, production-safe guardrails)  
**Scope:** Ship CLIProxyAPI path first for smooth provider/model switching, keep Phase 3.6.1 CLI-direct plan intact for later.

## 1) Decision update from user

Accepted:
- Add a new top-level dropdown option for `CLIProxyAPI` route.
- Keep this route isolated from existing direct provider options to avoid mismatch.
- Add nested controls dedicated to CLIProxyAPI only.
- Optimize UX for frequent provider/model switching during the day.

## 2) Target UX in Settings (new route + nested section)

Top-level selector:
- `AI Route`: `Direct API` | `CLIProxyAPI` | `CLI Direct (Phase 3.6.1, later)`

When `CLIProxyAPI` is selected, show a dedicated section only:
- `CLIProxyAPI Base URL` (default `http://127.0.0.1:8317/v1`)
- `CLIProxyAPI Client API Key` (proxy `api-keys` value)
- `CLIProxy Provider` dropdown: `Codex` | `Claude` | `Gemini` | `Mixed`
- `CLIProxy Model` dropdown (alias list discovered from proxy `/v1/models`)
- `Quick Profiles` (one-click switch presets)
- `Open CLIProxy Dashboard` button (`/management.html`)
- `CLIProxy Health Test` button (calls existing backend test path with route-scoped config)

Why this is better:
- No overload/confusion in existing direct API provider controls.
- Fast model switching without editing free-text fields repeatedly.
- Clean separation of config and diagnostics.

## 3) CLIProxyAPI dashboard integration notes (researched)

From CLIProxyAPI ecosystem:
- Built-in management UI path: `/management.html` on proxy server.
- Web UI project: `router-for-me/Cli-Proxy-API-Management-Center`.
- It manages providers, aliases, API keys, auth files, logs, and usage through `/v0/management`.
- It uses a management key, which is different from proxy client `api-keys`.

Planned use in our app:
- We will not re-implement full provider management UI immediately.
- We add a button/link from our Settings to open proxy dashboard quickly.
- We keep our app focused on selecting route/provider/model alias and running resume jobs.

Reference links:
- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI?tab=readme-ov-file)
- [Management Web UI docs](https://help.router-for.me/management/webui)
- [CLIProxy Management Center repo](https://github.com/router-for-me/Cli-Proxy-API-Management-Center)

## 4) Architecture (fast path, isolated)

1. Backend keeps current LiteLLM call pipeline.
2. New route-aware config layer chooses either:
   - `Direct API` (existing behavior), or
   - `CLIProxyAPI` (provider normalized through OpenAI-compatible transport).
3. For CLIProxyAPI route, backend sends:
   - `provider=openai` internally
   - `api_base=<cliproxy_base>`
   - `api_key=<cliproxy_client_key>`
   - `model=<cliproxy_alias>`
4. Existing observability (`llm_calls`, trace viewer) remains unchanged.

## 5) Compliance-safe operating profile (required)

- Bind proxy locally (`host: 127.0.0.1`, `allow-remote: false`).
- Keep management key enabled.
- Do not expose management/API ports publicly.
- Use official user-owned provider auth only.
- No automated multi-account rotation in this workspace mode.
- No relay/resale patterns.

## 6) Local CLIProxyAPI setup for our use case

## 6.1 Prepare folder

```bash
mkdir -p infra/cliproxyapi/{auths,logs}
cp /tmp/cliproxyapi-research/CLIProxyAPI/config.example.yaml infra/cliproxyapi/config.yaml
```

## 6.2 Baseline `infra/cliproxyapi/config.yaml`

```yaml
host: "127.0.0.1"
port: 8317

remote-management:
  allow-remote: false
  secret-key: "replace-with-strong-management-secret"
  disable-control-panel: false

auth-dir: "~/.cli-proxy-api"

api-keys:
  - "replace-with-app-client-key"

disable-cooling: true
routing:
  strategy: "fill-first"
```

## 6.3 Alias definitions for fast switching

```yaml
codex-api-key:
  - api-key: "YOUR_CODEX_API_OR_OAUTH_KEY"
    base-url: "https://api.openai.com/v1"
    models:
      - name: "gpt-5-codex"
        alias: "codex-jd-fast"

claude-api-key:
  - api-key: "YOUR_ANTHROPIC_API_KEY"
    models:
      - name: "claude-sonnet-4-5"
        alias: "claude-jd-fast"

gemini-api-key:
  - api-key: "YOUR_GEMINI_API_KEY"
    models:
      - name: "gemini-2.5-pro"
        alias: "gemini-jd-fast"
```

## 6.4 Run proxy

```bash
docker run -d \
  --name cli-proxy-api \
  -p 8317:8317 \
  -p 8085:8085 \
  -p 1455:1455 \
  -p 54545:54545 \
  -v "$(pwd)/infra/cliproxyapi/config.yaml:/CLIProxyAPI/config.yaml" \
  -v "$(pwd)/infra/cliproxyapi/auths:/root/.cli-proxy-api" \
  -v "$(pwd)/infra/cliproxyapi/logs:/CLIProxyAPI/logs" \
  --restart unless-stopped \
  eceasy/cli-proxy-api:latest
```

## 6.5 Verify

```bash
curl -s http://127.0.0.1:8317/healthz
curl -s http://127.0.0.1:8317/v1/models \
  -H "Authorization: Bearer replace-with-app-client-key"
```

## 7) Repo changes to implement

Backend:
- Extend config schema to include `ai_route` and `cliproxy` nested fields.
- Keep current `LLMConfig` intact for direct route.
- Add mapping function: route `CLIProxyAPI` -> internal openai-compatible config for runtime call.
- Add model discovery helper endpoint for CLIProxy route (`/config/cliproxy-models`) using `/v1/models`.
- Add route-specific validation and health-test response fields.

Frontend:
- Add `AI Route` dropdown.
- Add conditional nested UI for CLIProxy route.
- Add provider-filtered model dropdown from discovered alias list.
- Add `Quick Profiles` save/apply controls.
- Add `Open CLIProxy Dashboard` quick action.
- Preserve existing direct API settings untouched for `Direct API`.

Docs:
- Update setup docs with CLIProxy route instructions.
- Add warnings about management key vs proxy client API key.

## 8) Detailed to-do list to ship + test end-to-end

## 8.1 Planning and contracts

- [ ] Finalize route config schema:
  - [ ] `ai_route`: `direct_api | cliproxyapi`
  - [ ] `cliproxy`: `base_url`, `client_api_key`, `provider_filter`, `model_alias`, `dashboard_url`, `quick_profiles`
- [ ] Define backward-compatible defaults so existing users remain on `direct_api`.
- [ ] Define UI copy and error messages for route-specific states.

## 8.2 Backend implementation

- [ ] Update request/response models in `apps/backend/app/schemas/models.py`.
- [ ] Update config read/write in `apps/backend/app/routers/config.py`.
- [ ] Add route-aware config builder in `apps/backend/app/llm.py`.
- [ ] Add CLIProxy model discovery endpoint (authenticated via stored client key).
- [ ] Add provider-filter parser for alias grouping (`codex`, `claude`, `gemini`, `mixed`).
- [ ] Add route-aware health test path and structured errors.
- [ ] Add unit tests for config fallback and route selection.

## 8.3 Frontend implementation

- [ ] Extend config types in `apps/frontend/lib/api/config.ts`.
- [ ] Add `AI Route` dropdown to settings page.
- [ ] Add conditional CLIProxy section with nested fields.
- [ ] Add model dropdown fed by backend model-discovery endpoint.
- [ ] Add provider filter controls and quick profile chips.
- [ ] Add `Open CLIProxy Dashboard` button.
- [ ] Keep current direct-provider UI unchanged when route is `direct_api`.
- [ ] Add form validation and inline helper text.

## 8.4 Proxy and local infra

- [ ] Add local `infra/cliproxyapi/` template files.
- [ ] Add safe default config sample (localhost-only).
- [ ] Add shell helpers:
  - [ ] `make cliproxy-up`
  - [ ] `make cliproxy-down`
  - [ ] `make cliproxy-logs`
  - [ ] `make cliproxy-health`
- [ ] Add smoke script to verify `/healthz` and `/v1/models`.

## 8.5 End-to-end test plan

- [ ] Scenario 1: `direct_api` unchanged baseline still works.
- [ ] Scenario 2: switch to `cliproxyapi`, save config, health test passes.
- [ ] Scenario 3: model discovery returns aliases and provider filters work.
- [ ] Scenario 4: generate resume preview with `codex-jd-fast`.
- [ ] Scenario 5: switch to `claude-jd-fast` and run second preview.
- [ ] Scenario 6: switch to `gemini-jd-fast` and run third preview.
- [ ] Scenario 7: verify `llm-traces` capture alias + success metadata.
- [ ] Scenario 8: invalid proxy key shows actionable error.
- [ ] Scenario 9: proxy down shows clean failure and does not corrupt direct settings.
- [ ] Scenario 10: rollback to `direct_api` and confirm normal operation.

## 8.6 QA and hardening

- [ ] Add integration tests for config persistence across app restart.
- [ ] Add UI tests for route toggle + conditional rendering.
- [ ] Add test for quick profile apply/switch behavior.
- [ ] Add security review checklist for secret handling and logs.
- [ ] Add manual checklist for management key isolation.

## 8.7 Release and rollout

- [ ] Ship behind feature flag: `ENABLE_CLIPROXY_ROUTE`.
- [ ] Internal dogfood with 3-provider alias set for 2-3 days.
- [ ] Capture latency and failure stats from observability pages.
- [ ] Promote from experimental to default-fast-path only after stability sign-off.

## 9) Rollback

Config-only rollback:
- Set `ai_route=direct_api`.
- Keep CLIProxy config saved but inactive.
- No code rollback required for immediate recovery.

## 10) Risks and mitigation

- Risk: extra dependency in inference path.
  - Mitigation: keep direct route always available.
- Risk: policy drift in third-party ecosystem usage patterns.
  - Mitigation: enforce local/single-account safe profile in our plan.
- Risk: model alias mismatch confusion.
  - Mitigation: provider-filtered dropdown + discovery endpoint + quick profiles.

## 11) Research snapshot used

Local code review:
- `/tmp/cliproxyapi-research/CLIProxyAPI` at commit `c4459c4`
- `README.md`, `config.example.yaml`, `docker-compose.yml`, `internal/api/server.go`, `internal/api/handlers/management/*`

Web references reviewed:
- [CLIProxyAPI README](https://github.com/router-for-me/CLIProxyAPI?tab=readme-ov-file)
- [Management UI docs](https://help.router-for.me/management/webui)
- [Management Center repo](https://github.com/router-for-me/Cli-Proxy-API-Management-Center)

## 12) Pending user inputs

1. Confirm dropdown labels:
   - `Direct API`, `CLIProxyAPI`, `CLI Direct (Later)`
2. Confirm default provider filter in CLIProxy section:
   - `Codex` recommended.
3. Confirm whether quick profiles should be:
   - local machine only, or shared in backend config.
