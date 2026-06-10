# Resume Workbench Setup

This guide covers the maintained application in `apps/frontend` and `apps/backend`.

## Requirements

| Tool | Version |
| --- | --- |
| Python | 3.13+ |
| Node.js | 22+ |
| npm | 10+ |
| uv | Current stable |
| Docker | Current stable |

## Local development

### 1. Start PostgreSQL

From the repository root:

```bash
docker compose up -d postgres
docker compose ps
```

The default local database is:

```text
postgresql+psycopg://resume_matcher:resume_matcher@localhost:5432/resume_matcher
```

These development credentials are not suitable for a public deployment.

### 2. Start the backend

```bash
cd apps/backend
cp .env.example .env
uv sync --extra dev
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

Health check: [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)

API reference: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 3. Start the frontend

In another terminal:

```bash
cd apps/frontend
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The frontend proxies `/api/*`, `/docs`, `/redoc`, and `/openapi.json` to the backend configured by `BACKEND_ORIGIN`. The default is `http://127.0.0.1:8000`.

## Configure AI

The easiest path is **Settings → Provider configuration** inside the app.

Supported routes include OpenAI-compatible providers, Anthropic, Gemini, OpenRouter, DeepSeek, Ollama, and the optional CLIProxyAPI integration. Available model names change over time, so choose a model currently offered by your provider.

You can also configure the backend through `apps/backend/.env`:

```env
LLM_PROVIDER=openai
LLM_MODEL=your-provider-model
LLM_API_KEY=your-private-key
```

For Ollama:

```env
LLM_PROVIDER=ollama
LLM_MODEL=your-local-model
LLM_API_BASE=http://localhost:11434
LLM_API_KEY=
```

Never commit the real `.env` file.

## Full Docker stack

Build and run the web app plus PostgreSQL:

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000).

The application container runs Next.js on port `3000` and FastAPI internally on port `8000`. PostgreSQL and generated artifacts use named Docker volumes.

For a public deployment:

1. Replace the default database password.
2. Put the app behind HTTPS and an authenticated reverse proxy.
3. Restrict database and backend ports to private networks.
4. Store provider keys in your platform secret manager.
5. Back up the PostgreSQL and artifact volumes.
6. Review [docs/PRIVACY.md](docs/PRIVACY.md).

## Optional CLIProxyAPI

The repository includes a template for a local OpenAI-compatible proxy under `infra/cliproxyapi`.

```bash
make cliproxy-init
```

Edit the generated `infra/cliproxyapi/config.yaml`, then:

```bash
make cliproxy-up
make cliproxy-health
```

Local auth files, logs, and `config.yaml` are ignored by Git. The template is safe to publish; generated credentials are not.

Useful commands:

```bash
make cliproxy-logs
make cliproxy-down
```

## Verification

### Frontend

```bash
cd apps/frontend
npm run verify
```

### Backend

```bash
cd apps/backend
uv run pytest
uv run ruff check app tests
```

### End-to-end browser tests

The root test suite starts an isolated frontend on port `3100` and mocks external API behavior where appropriate.

```bash
npm ci
npx playwright install chromium
npm run test:e2e
```

## Common problems

### The app says AI is not configured

Open **Settings**, add the provider details, and run the connection test. Check that the provider key and model name are valid.

### The backend cannot connect to PostgreSQL

```bash
docker compose ps
docker compose logs postgres
```

Confirm `DATABASE_URL` matches the port and credentials in `docker-compose.yml`.

### The frontend cannot reach the backend

Confirm FastAPI is running on port `8000`. If it uses another address, start Next.js with:

```bash
BACKEND_ORIGIN=http://127.0.0.1:9000 npm run dev
```

### PDF or preview generation fails

Check the backend logs and confirm RenderCV is installed inside the backend environment:

```bash
cd apps/backend
uv run rendercv --help
```

Generated work files belong under `apps/backend/data/`, which is ignored except for its placeholder file.

### A database change is missing

Apply migrations:

```bash
cd apps/backend
uv run alembic upgrade head
```

## Configuration files

| Path | Purpose | Commit it? |
| --- | --- | --- |
| `apps/backend/.env.example` | Safe backend template | Yes |
| `apps/backend/.env` | Real local settings and secrets | No |
| `apps/frontend/.env.sample` | Safe frontend template | Yes |
| `apps/frontend/.env.local` | Local frontend overrides | No |
| `infra/cliproxyapi/config.template.yaml` | Safe proxy template | Yes |
| `infra/cliproxyapi/config.yaml` | Real proxy configuration | No |
| `infra/cliproxyapi/auths/` | OAuth and provider credentials | No |

For implementation details, continue with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/agent/README.md](docs/agent/README.md).
