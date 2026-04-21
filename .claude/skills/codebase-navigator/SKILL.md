---
name: codebase-navigator
description: |
  Navigate, search, and understand the Resume Matcher codebase using ripgrep, ack, or grep. Find functions, classes, components, API endpoints, trace data flows, and understand architecture. Use FIRST when exploring code, finding files, or understanding project structure.
metadata:
  author: resume-matcher
  version: "1.0.0"
allowed-tools: Bash(rg:*) Bash(ack:*) Bash(grep:*) Bash(find:*) Bash(tree:*) Read
---

# Codebase Navigator

> **Use this skill FIRST** when exploring code, finding files, or understanding project structure.

## Quick Start

### Search scripts (preferred)

Run the bundled scripts for common searches:

```bash
# Find functions/methods
.github/skills/codebase-navigator/scripts/search.sh functions <pattern>

# Find React components
.github/skills/codebase-navigator/scripts/search.sh components <pattern>

# Find API endpoints
.github/skills/codebase-navigator/scripts/search.sh endpoints

# Trace an API flow end-to-end
.github/skills/codebase-navigator/scripts/trace.sh api-flow <endpoint>

# Trace a data field from backend to UI
.github/skills/codebase-navigator/scripts/trace.sh data-flow <field_name>

# Find component hierarchy
.github/skills/codebase-navigator/scripts/trace.sh component-tree <ComponentName>
```

### Direct ripgrep patterns

```bash
# Find any symbol
rg --no-heading -n '\bMySymbol\b' apps/

# Python function definitions
rg --no-heading -n '(def|async def) my_function' apps/backend/ --type py

# React component usage
rg --no-heading -n '<MyComponent' apps/frontend/ --glob '*.tsx'

# Pydantic models
rg --no-heading -n 'class My.*BaseModel' apps/backend/ --type py

# API route handlers
rg --no-heading -n '@(router|app)\.(get|post|put|patch|delete)' apps/backend/ --type py
```

## Architecture Overview

| Need | Document |
|------|----------|
| Backend architecture | `docs/agent/architecture/backend-architecture.md` |
| Frontend architecture | `docs/agent/architecture/frontend-architecture.md` |
| API contracts | `docs/agent/apis/front-end-apis.md` |
| API flow maps | `docs/agent/apis/api-flow-maps.md` |
| Full doc index | `docs/agent/README.md` |

## Project Layout

```
apps/
├── backend/app/
│   ├── main.py              # FastAPI entry, CORS, routers
│   ├── config.py            # Pydantic settings from env
│   ├── database.py          # DB façade over repositories
│   ├── llm.py               # LiteLLM wrapper
│   ├── routers/             # API endpoints
│   ├── services/            # Business logic
│   ├── schemas/             # Pydantic models
│   └── prompts/             # LLM prompt templates
│
└── frontend/
    ├── app/                 # Next.js pages
    ├── components/          # UI components
    ├── lib/                 # API client, utilities, i18n
    ├── hooks/               # Custom React hooks
    └── messages/            # i18n translations (en, es, zh, ja)
```

## Common Workflows

### "Where is X defined?"
```bash
.github/skills/codebase-navigator/scripts/search.sh functions my_function
.github/skills/codebase-navigator/scripts/search.sh components MyComponent
.github/skills/codebase-navigator/scripts/search.sh classes MyClass
.github/skills/codebase-navigator/scripts/search.sh types MyType
```

### "What calls X?"
```bash
.github/skills/codebase-navigator/scripts/search.sh usage my_function
.github/skills/codebase-navigator/scripts/search.sh deps my_file.py
```

### "How does data flow for feature X?"
```bash
.github/skills/codebase-navigator/scripts/trace.sh api-flow resumes
.github/skills/codebase-navigator/scripts/trace.sh data-flow personalInfo
.github/skills/codebase-navigator/scripts/trace.sh component-tree ResumeEditor
```

## Key Entry Points

| What | File |
|------|------|
| Backend startup | `apps/backend/app/main.py` |
| Frontend pages | `apps/frontend/app/` |
| API client | `apps/frontend/lib/api/` |
| Design tokens | `apps/frontend/app/(default)/css/globals.css` |
| Resume schemas | `apps/backend/app/schemas/` |
| LLM prompts | `apps/backend/app/prompts/` |

## Reference

See `references/REFERENCE.md` for the full ripgrep cheat sheet and advanced search patterns.
