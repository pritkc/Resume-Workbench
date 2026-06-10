# Privacy and Data Flow

Resume Workbench is local-first, not offline-only.

## Stored locally

By default, these stay in your environment:

- uploaded and parsed resume content
- job descriptions
- tailored resume copies
- cover letters, outreach notes, and application answers
- PostgreSQL records
- generated PDF, PNG, YAML, Typst, and debug artifacts
- provider configuration and prompt overrides
- LLM trace metadata and saved request/response content

## Sent to an AI provider

When an AI feature runs, the backend sends the prompt and the workflow data required for that operation to the provider you configured. Depending on the feature, that can include resume content, job-description text, or application questions.

The provider's own privacy, retention, and training policies apply. Choose and configure the provider accordingly.

## Not included

The application does not ship with analytics, advertising trackers, or a hosted Resume Workbench data service.

## Public deployment warning

The current project is designed for local or trusted self-hosted use. Before exposing it publicly, add:

- authentication and authorization
- HTTPS
- rate limiting
- secret management
- network restrictions for PostgreSQL and FastAPI
- backup and retention policies
- provider-specific data handling review

## Repository safety

Never commit:

- `.env` or `.env.local`
- API keys or OAuth tokens
- CLIProxy `auths/`, logs, or generated `config.yaml`
- local databases
- generated resumes or application artifacts
- exported LLM prompts, responses, traces, or test runs containing real data

The checked-in screenshots use fictional candidate, company, contact, and job details.
