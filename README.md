# Resume Workbench

**Resume Workbench** is a local-first web app for building, tailoring, and packaging resumes and cover letters with LLM assistance—grounded in structured data, **RenderCV**-driven PDFs, and a full **FastAPI + PostgreSQL** backend.

This repository is **our fork**: it inherits ideas and code lineage from the open-source [**Resume Matcher**](https://github.com/srbhr/Resume-Matcher) project, but the product direction, storage model (Postgres), rendering stack, and UX here are **Workbench-specific**.

## What’s inside

| Area | Role |
|------|------|
| [`apps/frontend`](apps/frontend) | Next.js UI — dashboard, builder, tailor, settings, LLM traces |
| [`apps/backend`](apps/backend) | FastAPI API — parsing, tailoring, application packs, artifacts, LiteLLM |
| [`docs/agent`](docs/agent) | **Handbook for contributors and coding agents** (architecture, APIs, prompts) |
| [`tests`](tests) | Playwright E2E (run from repo root) |

## Quick start

Full install (Postgres, `uv`, env files, AI provider) is in **[SETUP.md](SETUP.md)**.

```bash
docker compose up -d postgres
cd apps/backend && cp .env.example .env && uv sync && uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

```bash
cd apps/frontend && npm install && npm run dev
```

- App: [http://localhost:3000](http://localhost:3000)  
- API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

Configure an AI provider under **Settings** before running tailoring flows.

**Optional:** subscription/OAuth routing via CLIProxy is documented under *Option C* in [SETUP.md](SETUP.md).

## Contributing & automation

- **Human contributors:** follow [SETUP.md](SETUP.md) and [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) (Workbench stack under `apps/`; ignore legacy Streamlit sections).
- **Coding agents:** start with [docs/agent/README.md](docs/agent/README.md) and [docs/agent/quickstart.md](docs/agent/quickstart.md).

Root E2E: `npm run test:e2e` (see [package.json](package.json)).

## Acknowledgments & credits

We build on and gratefully acknowledge:

| Project / community | Role |
|---------------------|------|
| [**Resume Matcher**](https://github.com/srbhr/Resume-Matcher) | Original open-source resume–JD matching app; conceptual and code lineage for this fork |
| [**RenderCV**](https://github.com/rendercv/rendercv) | Resume PDF / Typst / YAML rendering pipeline used end-to-end here |
| [**LiteLLM**](https://github.com/BerriAI/litellm) | Multi-provider LLM routing in the backend |
| [**CLIProxyAPI**](https://github.com/router-for-me/CLIProxyAPI) (optional) | Local OpenAI-compatible proxy for subscription / OAuth-style access |
| [**Next.js**](https://nextjs.org/) & [**React**](https://react.dev/) | Frontend framework |
| [**FastAPI**](https://fastapi.tiangolo.com/), [**SQLAlchemy**](https://www.sqlalchemy.org/), [**Alembic**](https://alembic.sqlalchemy.org/), [**PostgreSQL**](https://www.postgresql.org/) | API and persistence |
| [**MarkItDown**](https://github.com/microsoft/markitdown) (via dependencies) | Document → markdown for uploads |

Workbench-specific design and product choices are **not** endorsed by or affiliated with upstream projects unless stated otherwise.

---

*Resume Workbench — ship tailored applications without losing the thread.*
