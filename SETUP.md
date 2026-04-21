# Resume Workbench — setup guide

**[English](SETUP.md)** | [Español](SETUP.es.md) | [简体中文](SETUP.zh-CN.md) | [日本語](SETUP.ja.md)

Welcome. This guide walks through running **Resume Workbench** locally: Next.js frontend, FastAPI backend, PostgreSQL, and (optionally) your choice of LLM provider or a local proxy.

> **Note:** This fork’s install path differs from legacy upstream [**Resume Matcher**](https://github.com/srbhr/Resume-Matcher) Streamlit-oriented docs you may find online—follow this file and [`README.md`](README.md) for the Workbench `apps/` stack.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Step-by-Step Setup](#step-by-step-setup)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Frontend Setup](#3-frontend-setup)
- [Configuring Your AI Provider](#configuring-your-ai-provider)
  - [Option A: Cloud Providers](#option-a-cloud-providers)
  - [Option B: Local AI with Ollama](#option-b-local-ai-with-ollama-free)
  - [Option C: CLIProxyAPI Route](#option-c-cliproxyapi-route-fast-switching-across-codexclaudegemini)
- [Docker Deployment](#docker-deployment)
- [Accessing the Application](#accessing-the-application)
- [Common Commands Reference](#common-commands-reference)
- [Troubleshooting](#troubleshooting)
- [Project Structure Overview](#project-structure-overview)
- [Getting Help](#getting-help)

---

## Prerequisites

Before you begin, make sure you have the following installed on your system:


| Tool        | Minimum Version | How to Check       | Installation                                                            |
| ----------- | --------------- | ------------------ | ----------------------------------------------------------------------- |
| **Python**  | 3.13+           | `python --version` | [python.org](https://python.org)                                        |
| **Node.js** | 22+             | `node --version`   | [nodejs.org](https://nodejs.org)                                        |
| **npm**     | 10+             | `npm --version`    | Comes with Node.js                                                      |
| **uv**      | Latest          | `uv --version`     | [astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| **Git**     | Any             | `git --version`    | [git-scm.com](https://git-scm.com)                                      |


### Installing uv (Python Package Manager)

Resume Workbench uses `uv` for Python dependency management. Install it with:

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# Or via pip
pip install uv
```

---

## Quick Start

If you're familiar with development tools and want to get running quickly:

```bash
# 1. Clone this repository (your fork or local mirror)
git clone <repository-url>
cd <repository-folder>

# 2. Start Postgres and the backend (Terminal 1)
docker compose up -d postgres
cd apps/backend
cp .env.example .env        # Create config from template
uv sync                      # Install Python dependencies
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# 3. Start the frontend (Terminal 2)
cd apps/frontend
npm install                  # Install Node.js dependencies
npm run dev                  # Start the dev server
```

Open your browser to **[http://localhost:3000](http://localhost:3000)** and you're ready to go!

> **Note:** You'll need to configure an AI provider before using the app. See [Configuring Your AI Provider](#configuring-your-ai-provider) below.

---

## Step-by-Step Setup

### 1. Clone the Repository

First, get the code on your machine:

```bash
git clone <repository-url>
cd <repository-folder>
```

### 2. Backend Setup

The backend is a Python FastAPI application that handles AI processing, resume parsing, and data storage.

#### Navigate to the backend directory

```bash
cd apps/backend
```

#### Create your environment file

```bash
cp .env.example .env
```

#### Edit the `.env` file with your preferred text editor

```bash
# macOS/Linux
nano .env

# Or use any editor you prefer
code .env   # VS Code
```

The most important setting is your AI provider. Here's a minimal configuration for OpenAI:

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-5-nano-2025-08-07
LLM_API_KEY=sk-your-api-key-here

# Keep these as default for local development
HOST=0.0.0.0
PORT=8000
DATABASE_URL=postgresql+psycopg://resume_matcher:resume_matcher@localhost:5432/resume_matcher
FRONTEND_BASE_URL=http://localhost:3000
CORS_ORIGINS=["http://localhost:3000", "http://127.0.0.1:3000"]
```

#### Install Python dependencies

```bash
uv sync
```

#### Start local Postgres and run migrations

From the repo root in one terminal:

```bash
docker compose up -d postgres
```

Then from `apps/backend`:

```bash
uv run alembic upgrade head
```

This creates a virtual environment and installs all required packages.

#### Start the backend server

```bash
uv run uvicorn app.main:app --reload --port 8000
```

You should see output like:

```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

**Keep this terminal running** and open a new terminal for the frontend.

### 3. Frontend Setup

The frontend is a Next.js application that provides the user interface.

#### Navigate to the frontend directory

```bash
cd apps/frontend
```

#### (Optional) Create a frontend environment file

This is only needed if your backend runs on a different port:

```bash
cp .env.sample .env.local
```

#### Install Node.js dependencies

```bash
npm install
```

#### Start the development server

```bash
npm run dev
```

You should see:

```
▲ Next.js 16.x.x (Turbopack)
- Local:        http://localhost:3000
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser. You should see the Resume Workbench dashboard!

---

## Configuring Your AI Provider

Resume Workbench supports multiple AI providers. You can configure your provider through the Settings page in the app, or by editing the backend `.env` file.

### Option A: Cloud Providers


| Provider          | Configuration                                                  | Get API Key                                                   |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| **OpenAI**        | `LLM_PROVIDER=openai` `LLM_MODEL=gpt-5-nano-2025-08-07`        | [platform.openai.com](https://platform.openai.com/api-keys)   |
| **Anthropic**     | `LLM_PROVIDER=anthropic` `LLM_MODEL=claude-haiku-4-5-20251001` | [console.anthropic.com](https://console.anthropic.com/)       |
| **Google Gemini** | `LLM_PROVIDER=gemini` `LLM_MODEL=gemini-3-flash-preview`       | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **OpenRouter**    | `LLM_PROVIDER=openrouter` `LLM_MODEL=deepseek/deepseek-chat`   | [openrouter.ai](https://openrouter.ai/keys)                   |
| **DeepSeek**      | `LLM_PROVIDER=deepseek` `LLM_MODEL=deepseek-chat`              | [platform.deepseek.com](https://platform.deepseek.com/)       |


Example `.env` for Anthropic:

```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-haiku-4-5-20251001
LLM_API_KEY=sk-ant-your-key-here
```

### Option B: Local AI with Ollama (Free)

Want to run AI models locally without API costs? Use Ollama!

#### Step 1: Install Ollama

Download and install from [ollama.com](https://ollama.com)

#### Step 2: Pull a model

```bash
ollama pull gemma3:4b
```

Other good options: `llama3.2`, `mistral`, `codellama`, `neural-chat`

#### Step 3: Configure your `.env`

```env
LLM_PROVIDER=ollama
LLM_MODEL=gemma3:4b
LLM_API_BASE=http://localhost:11434
# LLM_API_KEY is not needed for Ollama
```

#### Step 4: Make sure Ollama is running

```bash
ollama serve
```

Ollama typically starts automatically after installation.

### Option C: CLIProxyAPI Route (Fast switching across Codex/Claude/Gemini)

Use this when you want one local OpenAI-compatible endpoint and fast alias-based switching.

This path is meant for **subscription quota** (ChatGPT/Codex, Claude Code, Gemini CLI, Qwen, iFlow, Antigravity, Kimi, Amp, etc.) via [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) and the bundled [Management Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center). You log in through **OAuth / auth flows** or the Management UI so usage counts against **your plans**, not ad-hoc **API keys from provider developer consoles**. We do **not** optimize `config.template.yaml` for those dashboard API keys; you can still add them from upstream `config.example.yaml` if you ever need a relay or OpenRouter.

Resume Workbench only needs your **local proxy** `api-keys` value and never your ChatGPT/Claude/Google console secrets.

**Upstream references (refresh locally with `./scripts/sync-upstream-references.sh`):**


| Resource              | Location / URL                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Example server config | `reference/CLIProxyAPI/config.example.yaml`                                                                            |
| User guides           | [help.router-for.me](https://help.router-for.me/)                                                                      |
| Management API        | [Management API docs](https://help.router-for.me/management/api)                                                       |
| Management UI         | Served at `/management.html` on the proxy port (also bundled in server ≥ 6.0.19; UI project recommends server ≥ 6.8.0) |


#### Quick Clarification

- `api-keys` in `infra/cliproxyapi/config.yaml` is your **local proxy** Bearer token for `/v1/...`.
- Resume Workbench uses that exact value as **CLIProxy Client API Key**.
- It is **not** an OpenAI / Anthropic / Google API key.
- Do **not** use `remote-management.secret-key` as `CLIPROXY_API_KEY`; you will get `401` on `/v1/models`.
- **Management Key** on `/management.html` is `remote-management.secret-key` (plaintext you chose before the server hashes it).

#### YAML pitfalls (container stuck in `Restarting`)

CLIProxyAPI expects `claude-api-key`, `gemini-api-key`, and `codex-api-key` to be **YAML lists** (each entry starts with `-`). If you comment out only the `- api-key:` line but leave `models:` underneath, YAML becomes a **map** and the server exits with errors like `cannot unmarshal !!map into []config.ClaudeKey`.

**For subscription-first setups, omit `claude-api-key`, `gemini-api-key`, and `codex-api-key`** (our `infra/cliproxyapi/config.template.yaml` does that). Add those blocks only if you deliberately use **vendor dashboard API keys**; copy the **list** shape from `reference/CLIProxyAPI/config.example.yaml`.

The template turns on **quota-exceeded** fallbacks, **usage statistics** (for the Management UI), and leaves **optional** blocks commented (`oauth-model-alias`, Amp, streaming keep-alives, Gemini CLI internal routes, and so on) so you can opt in without pulling paid API keys.

#### Exact End-to-End Steps (OAuth first)

Run these from the repo root unless noted.

#### 1) Initialize local CLIProxy files

```bash
make cliproxy-init
```

This creates `infra/cliproxyapi/config.yaml` from `config.template.yaml` if it does not exist.

#### 2) Configure `infra/cliproxyapi/config.yaml`

Start from the template and set:

- `remote-management.secret-key` — **Management Key** for `/management.html` (pick a strong local secret).
- `api-keys` — first entry must match what you will use as **CLIProxy Client API Key** in Resume Workbench.

Recommended shape (see `infra/cliproxyapi/config.template.yaml` for the full commented option set; `host: ""` binds all interfaces for Docker):

```yaml
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
```

Notes:

- `host: ""` is the default documented in upstream `config.example.yaml` (all interfaces). `host: "0.0.0.0"` is also fine for IPv4 Docker port publishing.
- `remote-management.allow-remote: true` is required when the browser on your Mac loads `http://127.0.0.1:8317/...` while the process runs inside Docker.
- `quota-exceeded` matches upstream defaults and helps when a subscription tier hits limits (project switch, preview models, Antigravity credit retry).
- Set `routing.strategy` to `round-robin` when you add **multiple OAuth accounts** for the same provider and want load spreading.
- Optional: uncomment sections in `config.template.yaml` (`oauth-model-alias`, `streaming`, `enable-gemini-cli-endpoint`, `ampcode`, `logging-to-file`, …) per [CLIProxyAPI README](https://github.com/router-for-me/CLIProxyAPI) and `config.example.yaml`. Use model names your sessions actually expose — confirm under **Management UI → Auth Files** or **System → `/v1/models`**.

#### 3) Start CLIProxy

```bash
make cliproxy-down
make cliproxy-up
```

Confirm the container is **Up**, not **Restarting**:

```bash
docker ps -a --filter name=cli-proxy-api
```

If it restarts, inspect logs (usually a config parse error):

```bash
make cliproxy-logs
```

#### 4) Verify proxy

```bash
export CLIPROXY_API_KEY="resume-local-client-key"
make cliproxy-health
```

Expected:

- `http://127.0.0.1:8317/healthz` returns `{"status":"ok"}`.
- With `CLIPROXY_API_KEY` set, `/v1/models` returns JSON (may be sparse until you complete OAuth).

`/v1/models` before any OAuth may be empty or minimal; that is normal until at least one provider session exists.

#### 5) Open CLIProxy management UI

Open:

- [http://127.0.0.1:8317/management.html](http://127.0.0.1:8317/management.html)

Connect using the **Management Key** (`remote-management.secret-key`). The UI talks to the [Management API](https://help.router-for.me/management/api); it does not proxy inference traffic.

If the page does not load:

```bash
docker ps -a --filter name=cli-proxy-api
make cliproxy-logs
```

Field mapping:

- **Management Key** = `remote-management.secret-key` in `infra/cliproxyapi/config.yaml`.
- **CLIProxy Client API Key** in Resume Workbench = first value under `api-keys`.
- After first start, CLIProxy may rewrite `secret-key` to a hash in the file. Keep using the **original plaintext** you set until you rotate it.

If Management login fails:

- `**403` remote management disabled** — set `remote-management.allow-remote: true` (required for Docker + host browser).
- `**401` invalid management key** — key you typed does not match `secret-key`.
- **Unknown hash in config** (`$2a$...`) — rotate to a new plaintext `secret-key`, then `make cliproxy-down && make cliproxy-up`.

Validation:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8317/v0/management/config \
  -H "Authorization: Bearer resume-mgmt-local-only"
```

Expected: `200`.

#### 6) Provider login (OAuth / subscription quota)

Enable **only** the providers you use. Everything below is **subscription / CLI auth**, not developer-console API keys.

**Preferred: Management UI**

1. Open **OAuth** in the sidebar (device / browser flows depend on server version).
2. Run the flows you need; skip the rest.
3. Use **Auth Files** to confirm JSON landed under `infra/cliproxyapi/auths` (mounted into the container).

The Management Center README covers remote access and errors ([troubleshooting](https://github.com/router-for-me/Cli-Proxy-API-Management-Center#troubleshooting)).

**CLI inside the container** (parity with UI; handy with `-no-browser` so you paste URLs yourself). Replace or delete lines you do not need:


| Provider (upstream)    | Typical CLI flag                                           |
| ---------------------- | ---------------------------------------------------------- |
| Google / Gemini CLI    | `-login`                                                   |
| OpenAI Codex (ChatGPT) | `-codex-login` or `-codex-device-login` (device code flow) |
| Claude Code            | `-claude-login`                                            |
| Qwen Code              | `-qwen-login`                                              |
| iFlow                  | `-iflow-login` or `-iflow-cookie`                          |
| Antigravity            | `-antigravity-login`                                       |
| Kimi                   | `-kimi-login`                                              |


Example:

```bash
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -codex-login -no-browser
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -claude-login -no-browser
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -login -no-browser
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -qwen-login -no-browser
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -iflow-login -no-browser
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -antigravity-login -no-browser
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -kimi-login -no-browser
```

Flags are defined in `reference/CLIProxyAPI/cmd/server/main.go` after `./scripts/sync-upstream-references.sh`.

**Other capabilities** (still without vendor dashboard keys): streaming and tools work through the normal `/v1` surface; multimodal and multi-account behavior follow upstream. **Amp** routing is optional via an `ampcode:` block in `config.yaml` (see `config.template.yaml` comment and upstream `config.example.yaml`). **OpenRouter / openai-compatibility** needs relay API keys — add only if you leave pure subscription mode.

#### 6b) Trying multiple models

1. After OAuth, open **System** in the Management UI and fetch `**/v1/models`** (grouped view), or run `make cliproxy-health` with `CLIPROXY_API_KEY` set.
2. In Resume Workbench **Settings**, click **Refresh Aliases** and pick models exposed by your sessions.
3. To add **short aliases** or extra client-visible names for OAuth-backed models, edit `oauth-model-alias` in `config.yaml` (see upstream `config.example.yaml` and comments in `config.template.yaml`), then restart the container.

#### 7) Start Resume Workbench services

In `apps/backend/.env`, ensure:

```env
ENABLE_CLIPROXY_ROUTE=true
```

Then run:

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

#### 8) Configure Resume Workbench -> Settings

Open [http://localhost:3000/settings](http://localhost:3000/settings) and set:

- `AI Route = CLIProxyAPI`
- `CLIProxy Base URL = http://127.0.0.1:8317/v1`
- `CLIProxy Client API Key = resume-local-client-key`

Then:

1. Click `Refresh Aliases`
2. Test with provider filter `codex`
3. Test with provider filter `gemini`
4. Optionally test `claude` if enabled in your account
5. Click `Save`

If `Test Connection` fails for some models in this OAuth proxy setup, validate with:

- `make cliproxy-health`
- direct `/v1/chat/completions` call to `http://127.0.0.1:8317/v1`
- one real generation run from Dashboard

#### 9) Validate prompt catalog and one real run

In Settings -> Prompt Settings:

- Confirm `LLM Prompt Catalog` is visible and expandable

Optional API check:

```bash
curl -s http://127.0.0.1:8000/api/v1/config/prompts/catalog
```

Then run one full generation from Dashboard to confirm end-to-end behavior.

---

## Docker Deployment

Prefer containerized deployment? Resume Workbench includes Docker support.

### Quick Start with Docker Compose

```bash
# Start the container from a published image
docker compose up -d

# View logs
docker compose logs -f

# Stop the container
docker compose down
```

### Customizing Ports

```bash
# Change host port only (container stays on 3000)
PORT=4000 docker compose up -d
```

### Configuration Options


| Variable                | Default   | Description                                                                     |
| ----------------------- | --------- | ------------------------------------------------------------------------------- |
| `PORT`                  | `3000`    | Host port mapped to container port `3000`                                       |
| `LOG_LEVEL`             | `INFO`    | Application-wide Python/Uvicorn log level (`ERROR`, `WARNING`, `INFO`, `DEBUG`) |
| `LOG_LLM`               | `WARNING` | LiteLLM log level (`ERROR`, `WARNING`, `INFO`, `DEBUG`)                         |
| `LLM_PROVIDER`          | `openai`  | AI provider (openai, anthropic, gemini, etc.)                                   |
| `LLM_MODEL`             | —         | Model to use (configured via Settings UI)                                       |
| `LLM_API_KEY`           | —         | API key (recommended: configure via Settings UI)                                |
| `LLM_API_BASE`          | —         | Custom API endpoint (for Ollama or proxies)                                     |
| `ENABLE_CLIPROXY_ROUTE` | `true`    | Enables CLIProxyAPI route in Settings and backend config endpoints              |


> **Note:** Changes to `LOG_LEVEL` and `LOG_LLM` require a container restart to take effect.

### Using Ollama with Docker

To use Ollama running on your host machine:

```bash
LLM_API_BASE=http://host.docker.internal:11434 docker compose up -d
```

Then configure Ollama as your provider in the Settings UI.

### Using Docker Secrets

The container supports `*_FILE` from
[docker secrets](https://docs.docker.com/compose/how-tos/use-secrets/#use-secrets).
For sensitive values, you can mount a secret file and point to it:

```bash
LLM_API_KEY_FILE=/run/secrets/llm_api_key docker compose up -d
```

Supported `*_FILE` variables:


| Variable       | `*_FILE` variant    |
| -------------- | ------------------- |
| `LOG_LEVEL`    | `LOG_LEVEL_FILE`    |
| `LOG_LLM`      | `LOG_LLM_FILE`      |
| `LLM_PROVIDER` | `LLM_PROVIDER_FILE` |
| `LLM_MODEL`    | `LLM_MODEL_FILE`    |
| `LLM_API_KEY`  | `LLM_API_KEY_FILE`  |
| `LLM_API_BASE` | `LLM_API_BASE_FILE` |


Rules:

- Use either the variable or its `*_FILE` variant, not both.
- If both are set, the container exits with an explicit error.

### Logging Level Configuration

You can tune logs globally and for LiteLLM separately:

```bash
LOG_LEVEL=INFO LOG_LLM=DEBUG docker compose up -d
```

> **Security warning:** `LOG_LLM=DEBUG` causes LiteLLM to log API keys in
> plaintext. Do not use `DEBUG` level in production or shared environments.
> The default `WARNING` is safe.

> **Note:** LiteLLM also reads the `LITELLM_LOG` environment variable internally
> to control handler-level filtering. `LOG_LLM` sets the *logger* level. Both must
> allow a message for it to appear. If you set `LITELLM_LOG` from LiteLLM docs,
> make sure `LOG_LLM` is set to an equal or lower level.

### Important Notes

- **API keys are best configured through the UI** at `http://localhost:3000/settings`
- Data is persisted in a Docker volume (`resume-data`)
- The Settings UI configuration is stored in the volume and persists across restarts
- App and API share the same origin: frontend on `/`, API on `/api`

## Accessing the Application

Once the container is running, open your browser:


| URL                                                                            | Description                   |
| ------------------------------------------------------------------------------ | ----------------------------- |
| **[http://localhost:3000](http://localhost:3000)**                             | Main application (Dashboard)  |
| **[http://localhost:3000/settings](http://localhost:3000/settings)**           | Configure AI provider         |
| **[http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health)** | Backend health check          |
| **[http://localhost:3000/docs](http://localhost:3000/docs)**                   | Interactive API documentation |


### First-Time Setup Checklist

1. Open [http://localhost:3000/settings](http://localhost:3000/settings)
2. Select your AI provider
3. Enter your API key (or configure Ollama)
4. Click "Save Configuration"
5. Click "Test Connection" to verify it works
6. Return to Dashboard and upload your first resume!

---

## Common Commands Reference

### Backend Commands

```bash
cd apps/backend

# Start development server (with auto-reload)
uv run uvicorn app.main:app --reload --port 8000

# Start production server
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# Install dependencies
uv sync

# Install with dev dependencies (for testing)
uv sync --group dev

# Run tests
uv run pytest

# Schema revision (Postgres)
uv run alembic current
```

### Frontend Commands

```bash
cd apps/frontend

# Start development server (with Turbopack for fast refresh)
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run linter
npm run lint

# Format code with Prettier
npm run format

# Run on a different port
npm run dev -- -p 3001
```

### Database Management

Resume Workbench persists application data in **PostgreSQL** (via SQLAlchemy + Alembic). Local development typically uses Docker:

```bash
# Start Postgres (from repo root)
docker compose up -d postgres

# Apply schema (from apps/backend)
cd apps/backend
uv run alembic upgrade head
```

**Connection string:** set `DATABASE_URL` in `apps/backend/.env` (see `apps/backend/.env.example`). The default in that file matches the `postgres` service in `docker-compose.yml`.

**Backup / restore (examples):**

```bash
# Backup (adjust user/db/container name to match your .env)
docker exec -t resume-matcher-postgres pg_dump -U resume_matcher resume_matcher > backup.sql

# Or copy the Docker volume data directory only if you know what you are doing
docker volume inspect resume-workk_postgres-data
```

**Artifacts and RenderCV work dirs** (YAML/PDF intermediates) still live under `apps/backend/data/` by default (`ARTIFACT_DIR`, `RENDERCV_WORK_DIR`) — that is **not** the primary database.

---

## Troubleshooting

### Backend won't start

**Error:** `ModuleNotFoundError`

Make sure you're running with `uv`:

```bash
uv run uvicorn app.main:app --reload
```

**Error:** `LLM_API_KEY not configured`

Check your `.env` file has a valid API key for your chosen provider.

### Frontend won't start

**Error:** `ECONNREFUSED` when loading pages

The backend isn't running. Start it first:

```bash
cd apps/backend && uv run uvicorn app.main:app --reload
```

**Error:** Build or TypeScript errors

Clear the Next.js cache:

```bash
rm -rf apps/frontend/.next
npm run dev
```

### PDF Download fails

**Error:** `Cannot connect to frontend for PDF generation`

Your backend can't reach the frontend. Check:

1. Frontend is running
2. `FRONTEND_BASE_URL` in `.env` matches your frontend URL
3. `CORS_ORIGINS` includes your frontend URL

If frontend runs on port 3001:

```env
FRONTEND_BASE_URL=http://localhost:3001
CORS_ORIGINS=["http://localhost:3001", "http://127.0.0.1:3001"]
```

### Ollama connection fails

**Error:** `Connection refused to localhost:11434`

1. Check Ollama is running: `ollama list`
2. Start Ollama if needed: `ollama serve`
3. Make sure the model is downloaded: `ollama pull gemma3:4b`

### CLIProxy `management.html` not loading

If `http://127.0.0.1:8317/management.html` is not opening, usually the CLIProxy process is not listening yet or the container is crash-looping.

1. Check container state (must be **Up**, not **Restarting**):

```bash
docker ps -a --filter name=cli-proxy-api
```

1. If **Restarting**, read logs — often a **bad `config.yaml`** (YAML shape or parse error):

```bash
docker logs cli-proxy-api --tail 80
```

Common fix: remove invalid `claude-api-key` / `gemini-api-key` / `codex-api-key` blocks, or rewrite them as proper YAML **lists** (see Option C and `reference/CLIProxyAPI/config.example.yaml`). Replace `config.yaml` from `infra/cliproxyapi/config.template.yaml` if needed, then `make cliproxy-down && make cliproxy-up`.

1. Start or restart a healthy container:

```bash
make cliproxy-up
```

1. Validate health:

```bash
export CLIPROXY_API_KEY="resume-local-client-key"
make cliproxy-health
```

1. Confirm `infra/cliproxyapi/config.yaml` has:

- `host: ""` or `host: "0.0.0.0"` so the host can reach port `8317` from Docker
- `remote-management.allow-remote: true` if you open the Management UI from the host browser
- `api-keys` matching **CLIProxy Client API Key** in Resume Workbench (not `remote-management.secret-key`)

1. **401 / cannot connect** to Management API from a non-localhost URL: enable `allow-remote` and use the plaintext management key (see [Management Center troubleshooting](https://github.com/router-for-me/Cli-Proxy-API-Management-Center#troubleshooting)).
2. After the server stays up, add OAuth sessions via **Management UI → OAuth** (recommended) or CLI login:

```bash
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -codex-login -no-browser
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -claude-login -no-browser
docker exec -it cli-proxy-api /CLIProxyAPI/CLIProxyAPI -config /CLIProxyAPI/config.yaml -login -no-browser
```

---

## Project Structure Overview

```
resume-workbench/   # or your local clone name
├── apps/
│   ├── backend/                 # Python FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py          # Application entry point
│   │   │   ├── config.py        # Environment configuration
│   │   │   ├── database.py      # DB façade over SQLAlchemy repositories
│   │   │   ├── db/              # SQLAlchemy models + repositories
│   │   │   ├── llm.py           # AI provider integration
│   │   │   ├── routers/         # API endpoints
│   │   │   ├── services/        # Business logic
│   │   │   ├── schemas/         # Data models
│   │   │   └── prompts/         # LLM prompt modules (split files)
│   │   ├── alembic/             # Schema migrations
│   │   ├── data/                # Artifacts + RenderCV work dirs (not the SQL DB)
│   │   ├── .env.example         # Environment template (canonical)
│   │   └── pyproject.toml       # Python dependencies (use `uv sync`)
│   │
│   └── frontend/                # Next.js React frontend
│       ├── app/                 # Pages (dashboard, builder, etc.)
│       ├── components/          # Reusable React components
│       ├── lib/                 # Utilities and API client
│       ├── .env.sample          # Environment template
│       └── package.json         # Node.js dependencies
│
├── docs/                        # Additional documentation
├── docker-compose.yml           # Docker configuration
├── Dockerfile                   # Container build instructions
└── README.md                    # Project overview
```

---

## Getting help

- **This project:** use your **repository’s issue tracker** for bugs and feature requests for Resume Workbench.
- **Deep dives:** [docs/agent/](docs/agent/) — backend guide, APIs, prompts, and UI design references.
- **Upstream Resume Matcher:** the [original project](https://github.com/srbhr/Resume-Matcher) has its own [Discord](https://dsc.gg/resume-matcher) and community; useful for lineage questions, not a substitute for Workbench-specific behavior.

### Useful documentation

| Document | Description |
| -------- | ----------- |
| [backend-guide.md](docs/agent/architecture/backend-guide.md) | Backend architecture and where to change code |
| [frontend-workflow.md](docs/agent/architecture/frontend-workflow.md) | User flow and major routes |
| [style-guide.md](docs/agent/design/style-guide.md) | Swiss International Style UI |

---

Happy shipping. Credits and third-party acknowledgments are summarized in [README.md](README.md).