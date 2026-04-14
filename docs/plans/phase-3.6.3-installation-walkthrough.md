# Phase 3.6.3 Installation Walkthrough (CLIProxy + Resume Matcher)

Date: 2026-04-14

## Goal

Set up local CLIProxy route for Resume Matcher using subscription/OAuth sessions (Codex/Claude/Gemini) without direct paid API keys in Resume Matcher settings.

Important:
- `CLIPROXY_API_KEY` must match `api-keys` in `infra/cliproxyapi/config.yaml`.
- Do not use `remote-management.secret-key` as `CLIPROXY_API_KEY`.
- `Management Key` on `management.html#/login` must match `remote-management.secret-key`.
- CLIProxy can hash/rewrite `remote-management.secret-key` in config after startup; login still expects the original plaintext key you set.
- Prefer **Management UI → OAuth** for provider login; use the CLI commands below when you want `-no-browser` device-style URLs. See [SETUP.md](../../SETUP.md) Option C for the full flow and YAML pitfalls (`claude-api-key` must be a list or omitted).

## Commands Executed

1. Check container state and current config

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
ls -la infra/cliproxyapi
sed -n '1,260p' infra/cliproxyapi/config.yaml
docker logs --tail 200 cli-proxy-api
```

2. Root-cause fix for proxy crash loop

```bash
# Fix invalid YAML and reset config to minimal OAuth-friendly shape
rm -rf infra/cliproxyapi/config.yaml
cat > infra/cliproxyapi/config.yaml <<'YAML'
host: ""
port: 8317

remote-management:
  allow-remote: true
  secret-key: "resume-mgmt-local-only"
  disable-control-panel: false
  panel-github-repository: "https://github.com/router-for-me/Cli-Proxy-API-Management-Center"

auth-dir: "~/.cli-proxy-api"

api-keys:
  - "resume-local-client-key"

usage-statistics-enabled: true

quota-exceeded:
  switch-project: true
  switch-preview-model: true
  antigravity-credits: true

disable-cooling: true
routing:
  strategy: "fill-first"
YAML
```

3. Restart CLIProxy and verify health/models

```bash
make cliproxy-down
make cliproxy-up
CLIPROXY_API_KEY='resume-local-client-key' bash scripts/cliproxy-health.sh
```

4. Validate management UI endpoint

```bash
curl --max-time 10 -s -o /tmp/mgmt.html -w '%{http_code}\n' http://127.0.0.1:8317/management.html
```

4.1 Validate management API auth key mapping

```bash
curl -s -w "\n%{http_code}\n" http://127.0.0.1:8317/v0/management/config \
  -H 'Authorization: Bearer resume-mgmt-local-only'
```

Observed status:
- `200` when `remote-management.allow-remote: true` and key matches `remote-management.secret-key`.
- `403` when `allow-remote: false` from host browser.
- `401` when key does not match `remote-management.secret-key`.

5. Ensure backend config defaults to CLIProxy route

```bash
jq '.ai_route="cliproxyapi" |
    .cliproxy={
      base_url:"http://127.0.0.1:8317/v1",
      client_api_key:"resume-local-client-key",
      provider_filter:"codex",
      model_alias:"gpt-5-codex",
      dashboard_url:"http://127.0.0.1:8317/management.html",
      quick_profiles:[
        {name:"Codex",provider_filter:"codex",model_alias:"gpt-5-codex",base_url:"http://127.0.0.1:8317/v1"},
        {name:"Claude",provider_filter:"claude",model_alias:"claude-sonnet-4-5",base_url:"http://127.0.0.1:8317/v1"},
        {name:"Gemini",provider_filter:"gemini",model_alias:"gemini-2.5-pro",base_url:"http://127.0.0.1:8317/v1"}
      ]
    }' apps/backend/data/config.json > /tmp/config.json && mv /tmp/config.json apps/backend/data/config.json
```

6. Ensure backend feature flag enabled

```bash
# add or force value
rg -n '^ENABLE_CLIPROXY_ROUTE=' apps/backend/.env || true
```

Set value in `apps/backend/.env`:

```env
ENABLE_CLIPROXY_ROUTE=true
```

7. OAuth/session login (CLI recording; UI path is **Management → OAuth**)

```bash
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -codex-login -no-browser
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -login -no-browser
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -claude-login -no-browser
```

If you do not have a Claude subscription, skip the `-claude-login` command.

Observed status:
- `codex-login`: successful
- `login` (Gemini): successful (Google One mode selected)
- `claude-login`: URL generated, waiting for manual callback completion

Latest Claude URL generated:

```text
https://claude.ai/oauth/authorize?client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&code=true&code_challenge=4lueWBr0pro4uzcQHJbb1BJyXP4RQFvWq8955gjO4uQ&code_challenge_method=S256&redirect_uri=http%3A%2F%2Flocalhost%3A54545%2Fcallback&response_type=code&scope=user%3Aprofile+user%3Ainference+user%3Asessions%3Aclaude_code+user%3Amcp_servers+user%3Afile_upload&state=f9a85c4f5821a257ebc9360776ceac53
```

8. Direct proxy smoke tests (Codex + Gemini)

```bash
curl -sS http://127.0.0.1:8317/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer resume-local-client-key' \
  -d '{"model":"gpt-5-codex","messages":[{"role":"user","content":"Reply with OK"}],"max_tokens":10}'

curl -sS http://127.0.0.1:8317/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer resume-local-client-key' \
  -d '{"model":"gemini-2.5-pro","messages":[{"role":"user","content":"Reply with OK"}],"max_tokens":10}'
```

Observed status:
- Both returned successful `OK` responses.

9. Backend runtime verification

```bash
# Start backend (from repo root)
cd apps/backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

From a second terminal:

```bash
curl -s http://127.0.0.1:8000/api/v1/health
```

Observed status:
- Endpoint returned HTTP `200` with a healthy backend payload.

## Manual Steps Remaining (User Browser)

1. Optional: complete Claude OAuth in browser only if you add Claude subscription access later.
2. If you need to re-auth providers from scratch, run:

```bash
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -codex-login -no-browser
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -login -no-browser
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -claude-login -no-browser  # optional
```

3. Start app services (if not already running):

```bash
# Terminal 1
docker compose up -d postgres

# Terminal 2
cd apps/backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# Terminal 3
cd apps/frontend
npm install
npm run dev
```

4. In `http://localhost:3000/settings` set:
- AI Route: `CLIProxyAPI`
- CLIProxy Base URL: `http://127.0.0.1:8317/v1`
- CLIProxy Client API Key: `resume-local-client-key`
- Click `Refresh Aliases`, test Codex and Gemini, then `Save`.
- Test Claude only if/when you enable Claude subscription access.

## Known Caveat

`Settings -> Test Connection` may fail for some CLIProxy model families because LiteLLM health-check behavior currently calls provider-specific paths (`/v1/responses` or Vertex-style auth) that do not align with this OAuth proxy setup.

Use these as source of truth:
- `make cliproxy-health`
- direct `/v1/chat/completions` smoke test above
- one actual resume generation run in the app
