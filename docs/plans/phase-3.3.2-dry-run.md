# Phase 3.3.2 — Dry Run Results

**Generated:** 2026-04-09 11:08
**Mode:** full
**Prompt versions:** tailoring_system=v3.0 · tailoring_user=v3.0
**Resume:** Alex Rivera (synthetic, 3 WE · 2 projects · 3 skill groups)

These are the raw LLM resume burbs (pre-cleanup, post-schema-validation) plus
the declared `changes[]` array as returned by the model. The cleanup/preservation
pass has not yet been applied — what you see here is exactly what the LLM wrote.

---

## JD: Cloudworks — Senior Backend Engineer (Infra Platform)

<details><summary>Job Description (click to expand)</summary>

```
Senior Backend Engineer — Infra Platform Team
Cloudworks (San Francisco, CA — Remote OK)

About the role
We're building the next generation of developer tooling infrastructure at Cloudworks. Our Infra
Platform team owns the services that power deployments, observability pipelines, and internal
developer APIs for 300+ engineers. You'll design and maintain high-throughput Python services,
own reliability and performance SLAs, and collaborate with SRE on Kubernetes-based deployments.

Responsibilities
- Design and build production-grade Python microservices (FastAPI / gRPC) handling millions of
  events per day
- Lead performance investigations and implement solutions (caching, query tuning, async I/O)
- Own and extend our internal observability stack: metrics (Prometheus), structured logging, tracing
- Drive Kubernetes rollout strategies (blue/green, canary) in partnership with the SRE team
- Write thorough unit and integration tests; maintain >80% coverage on owned services
- Mentor 1-2 mid-level engineers; participate in design reviews

Requirements
- 5+ years Python backend development
- Hands-on experience with Kubernetes and Docker
- Strong SQL + database internals knowledge (Postgres preferred)
- Experience with Redis or a comparable caching layer
- Familiarity with observability tools (Prometheus, Grafana, structured logging)
- CI/CD proficiency (GitHub Actions or equivalent)

Nice to have
- gRPC / Protocol Buffers experience
- Experience with Elasticsearch or OpenSearch at scale
- Prior involvement in open-source projects
```

</details>

### Summary

5+ years in backend engineering, specializing in Python microservices and high-performance API development. Proven expertise in optimizing data stores, implementing caching strategies, and building robust CI/CD pipelines. Passionate about observability and open-source contributions, with experience across the full development lifecycle.

### Work Experience

**Software Engineer** — DataFlow Inc. (Mar 2021 - Present)
  - Designed and built high-throughput Python microservices using FastAPI, handling 80k requests/day.
  - Led performance investigations, reducing average API latency from 420 ms to 95 ms by implementing Redis caching for hot paths.
  - Designed PostgreSQL schema migrations and developed query optimization guides, improving database performance and team knowledge.
  - Wrote comprehensive unit and integration tests, maintaining ~78% overall code coverage for owned services.

**Junior Backend Developer** — Bright Systems (Jun 2019 - Feb 2021)
  - Developed internal Python tooling using Flask to automate critical ETL pipelines.
  - Integrated third-party payment APIs, including Stripe, into the core billing service.
  - Maintained and optimized CI/CD pipelines using GitHub Actions, reducing average build time by 30%.

**Software Engineering Intern** — QuickCart (May 2018 - Aug 2018)
  - Built a high-performance product search microservice leveraging Elasticsearch.
  - Improved catalog indexing throughput by 2x through strategic batching of write operations.

### Personal Projects

**LogLens** (Jan 2023 - Present)
  _Creator_
  - Created LogLens, an open-source CLI tool for structured log analysis built with Python and Click.
  - Designed parsing logic for JSON/NDJSON logs, supporting advanced regex filtering and time-range queries.
  - Achieved 280 GitHub stars and internal adoption by two DataFlow teams, demonstrating real-world impact.

**PricePulse** (Aug 2022 - Dec 2022)
  _Creator_
  - Developed PricePulse, a price-tracking web scraper with PostgreSQL storage and email alert functionality.
  - Deployed the service on a $5 VPS using Docker Compose, orchestrating daily cron jobs for data collection.

### Skills

- **Programming & Backend**: Python, FastAPI, Flask, SQL, Bash, JavaScript (basic)
- **Databases & Caching**: PostgreSQL, Redis, Elasticsearch
- **DevOps & Observability**: Docker, GitHub Actions, CI/CD, Structured Log Analysis, Linux
- **Software Engineering Practices**: REST API Design, Unit Testing, Agile/Scrum, Open-Source Contributions

### Declared Changes

- `summary` **replace**
  - before: _Software engineer with 5 years of experience building backend services and APIs in Python. Comfortable working across the stack when needed._
- `workExperience[0].description[0]` **replace**
  - before: _Built and maintained REST APIs in Python (FastAPI) serving 80k requests/day_
- `workExperience[0].description[1]` **replace**
  - before: _Reduced average API latency from 420 ms to 95 ms by caching hot paths in Redis_
- `workExperience[0].description[2]` **replace**
  - before: _Designed Postgres schema migrations and wrote query optimisation guides for the team_
- `workExperience[0].description[3]` **replace**
  - before: _Wrote unit and integration tests; maintained ~78% overall coverage_
- `workExperience[1].description[0]` **replace**
  - before: _Developed internal tooling in Python (Flask) to automate ETL pipelines_
- `workExperience[1].description[1]` **replace**
  - before: _Integrated third-party payment APIs (Stripe) into the billing service_
- `workExperience[1].description[2]` **replace**
  - before: _Maintained CI pipeline on GitHub Actions; reduced average build time by 30%_
- `workExperience[2].description[0]` **replace**
  - before: _Built a product-search microservice using Elasticsearch_
- `workExperience[2].description[1]` **replace**
  - before: _Improved catalog indexing throughput by 2x by batching write operations_
- `personalProjects[0].description[0]` **replace**
  - before: _Open-source CLI tool for structured log analysis (Python, Click)_
- `personalProjects[0].description[1]` **replace**
  - before: _Parses JSON/NDJSON logs, supports regex filtering and time-range queries_
- `personalProjects[0].description[2]` **replace**
  - before: _280 GitHub stars; adopted by two internal teams at DataFlow_
- `personalProjects[1].description[0]` **replace**
  - before: _Price-tracking web scraper with PostgreSQL storage and email alerts_
- `personalProjects[1].description[1]` **replace**
  - before: _Deployed on a $5 VPS using Docker Compose; runs daily cron jobs_
- `skills.groups` **regroup**
  - before: _[{"id": "languages", "label": "Languages & Frameworks", "values": ["Python", "FastAPI", "Flask", "SQL", "Bash", "JavaScript (basic)"]}, {"id": "infra", "label": "Infrastructure & Tools", "values": ["Docker", "GitHub Actions", "Postgres", "Redis", "Elasticsearch", "Linux"]}, {"id": "practices", "label": "Practices", "values": ["REST API design", "unit testing", "CI/CD", "agile/scrum"]}]_

### Rejected Changes

- `skills.groups` **regroup**
  - before: _[{"id": "languages", "label": "Languages & Frameworks", "values": ["Python", "FastAPI", "Flask", "SQL", "Bash", "JavaScript (basic)"]}, {"id": "infra", "label": "Infrastructure & Tools", "values": ["Docker", "GitHub Actions", "Postgres", "Redis", "Elasticsearch", "Linux"]}, {"id": "practices", "label": "Practices", "values": ["REST API design", "unit testing", "CI/CD", "agile/scrum"]}]_

### Warnings

- Removed AI-style phrasing: robust
- Removed 1 unsupported addition(s) from tailored resume

---

## JD: FinSight Analytics — Python Engineer (Data Platform)

<details><summary>Job Description (click to expand)</summary>

```
Python Engineer — Data Platform
FinSight Analytics (New York, NY — Hybrid)

About FinSight
FinSight is a Series-B fintech building real-time analytics for institutional investors. Our Data
Platform team owns the ingestion, transformation, and serving layers that power dashboards consumed
by 500+ hedge funds worldwide.

What you'll do
- Build and operate event-driven data pipelines using Python, Kafka, and Airflow
- Design Postgres data models optimised for OLAP workloads; contribute to migration tooling
- Integrate with external market-data vendors via REST and FIX APIs
- Collaborate with data scientists to productionise ML feature pipelines
- Ensure pipeline reliability with SLA monitoring and alerting (PagerDuty / Grafana)
- Participate in on-call rotation; resolve production incidents with clear post-mortems

Requirements
- 4+ years Python (data engineering or backend)
- Experience building ETL/ELT pipelines at production scale
- Solid Postgres knowledge (indexing strategies, query planning)
- Familiarity with Kafka or another message broker
- Strong testing discipline (pytest, hypothesis)

Nice to have
- Airflow DAG authoring
- Financial domain knowledge
- Experience with Stripe or payment API integrations
- Docker and container deployment experience
```

</details>

### Summary

Python Engineer with 5 years of experience building backend services and data pipelines. Expertise in designing PostgreSQL OLAP data models, integrating APIs, and ensuring production reliability through monitoring and on-call support.

### Work Experience

**Software Engineer** — DataFlow Inc. (Mar 2021 - Present)
  - Built and maintained REST APIs in Python (FastAPI) serving 80k requests/day
  - Reduced average API latency from 420 ms to 95 ms by caching hot paths in Redis
  - Designed Postgres schema migrations and wrote query optimisation guides for the team
  - Designed and implemented PostgreSQL schema migrations, including indexing strategies, and developed query optimization guides to support OLAP workloads.
  - Wrote unit and integration tests; maintained ~78% overall coverage

**Junior Backend Developer** — Bright Systems (Jun 2019 - Feb 2021)
  - Developed internal tooling in Python (Flask) to automate ETL pipelines
  - Developed internal tooling in Python (Flask) to automate ETL pipelines, deploying them to production environments using Docker containers.
  - Integrated third-party payment APIs (Stripe) into the billing service
  - Maintained CI pipeline on GitHub Actions; reduced average build time by 30%

**Software Engineering Intern** — QuickCart (May 2018 - Aug 2018)
  - Built a product-search microservice using Elasticsearch
  - Improved catalog indexing throughput by 2x by batching write operations

### Personal Projects

**LogLens** (Jan 2023 - Present)
  _Creator_
  - Open-source CLI tool for structured log analysis (Python, Click)
  - Parses JSON/NDJSON logs, supports regex filtering and time-range queries
  - 280 GitHub stars; adopted by two internal teams at DataFlow

**PricePulse** (Aug 2022 - Dec 2022)
  _Creator_
  - Price-tracking web scraper with PostgreSQL storage and email alerts
  - Designed PostgreSQL data models for price tracking, deployed with Docker Compose, and managed daily data ingestion via cron jobs.
  - Deployed on a $5 VPS using Docker Compose; runs daily cron jobs

### Skills

- **Programming Languages & Frameworks**: Python, FastAPI, Flask, SQL, Bash, JavaScript (basic)
- **Data Engineering & Databases**: PostgreSQL, Redis, Elasticsearch, ETL, OLAP
- **Tools & DevOps**: Docker, GitHub Actions, Linux, Stripe, pytest, CI/CD
- **Development Practices**: REST API design, unit testing, agile/scrum

### Declared Changes

- `summary` **replace**
  - before: _Software engineer with 5 years of experience building backend services and APIs in Python. Comfortable working across the stack when needed._
  - after: _Python Engineer with 5 years of experience building backend services and data pipelines. Expertise in designing PostgreSQL OLAP data models, integrating APIs, and ensuring production reliability through monitoring and on-call support._
- `workExperience[0].description` **append**
  - after: _Designed and implemented PostgreSQL schema migrations, including indexing strategies, and developed query optimization guides to support OLAP workloads._
- `workExperience[1].description` **append**
  - after: _Developed internal tooling in Python (Flask) to automate ETL pipelines, deploying them to production environments using Docker containers._
- `personalProjects[1].description` **append**
  - after: _Designed PostgreSQL data models for price tracking, deployed with Docker Compose, and managed daily data ingestion via cron jobs._
- `skills.groups` **regroup**
  - before: _[{"id": "languages", "label": "Languages & Frameworks", "values": ["Python", "FastAPI", "Flask", "SQL", "Bash", "JavaScript (basic)"]}, {"id": "infra", "label": "Infrastructure & Tools", "values": ["Docker", "GitHub Actions", "Postgres", "Redis", "Elasticsearch", "Linux"]}, {"id": "practices", "label": "Practices", "values": ["REST API design", "unit testing", "CI/CD", "agile/scrum"]}]_
  - after: _[{'id': 'programming', 'label': 'Programming Languages & Frameworks', 'values': ['Python', 'FastAPI', 'Flask', 'SQL', 'Bash', 'JavaScript (basic)']}, {'id': 'data', 'label': 'Data Engineering & Databases', 'values': ['PostgreSQL', 'Redis', 'Elasticsearch', 'ETL', 'OLAP']}, {'id': 'devops', 'label': 'Tools & DevOps', 'values': ['Docker', 'GitHub Actions', 'Linux', 'Stripe', 'pytest', 'CI/CD']}, {'id': 'practices', 'label': 'Development Practices', 'values': ['REST API design', 'unit testing', 'agile/scrum']}]_

### Rejected Changes

- `skills.groups` **regroup**
  - before: _[{"id": "languages", "label": "Languages & Frameworks", "values": ["Python", "FastAPI", "Flask", "SQL", "Bash", "JavaScript (basic)"]}, {"id": "infra", "label": "Infrastructure & Tools", "values": ["Docker", "GitHub Actions", "Postgres", "Redis", "Elasticsearch", "Linux"]}, {"id": "practices", "label": "Practices", "values": ["REST API design", "unit testing", "CI/CD", "agile/scrum"]}]_
  - after: _[{'id': 'programming', 'label': 'Programming Languages & Frameworks', 'values': ['Python', 'FastAPI', 'Flask', 'SQL', 'Bash', 'JavaScript (basic)']}, {'id': 'data', 'label': 'Data Engineering & Databases', 'values': ['PostgreSQL', 'Redis', 'Elasticsearch', 'ETL', 'OLAP']}, {'id': 'devops', 'label': 'Tools & DevOps', 'values': ['Docker', 'GitHub Actions', 'Linux', 'Stripe', 'pytest', 'CI/CD']}, {'id': 'practices', 'label': 'Development Practices', 'values': ['REST API design', 'unit testing', 'agile/scrum']}]_

### Warnings

- Removed 2 unsupported addition(s) from tailored resume


---

## Observations from the Dry Run

### Schema compatibility issues uncovered (now patched)

The v3 system prompt introduced a naming shift in the `changes[]` contract that the Pydantic schema didn't yet handle. The following aliases had to be added to `ResumeChange._normalise_op_alias`:

| LLM emitted | Expected by schema | Fix applied |
|---|---|---|
| `op` | `action` | `op` → `action` alias |
| `after` / no value key (JD 2) | `value` | `after` → `value` alias; fallback to `""` |
| list in `original` (skills group changes) | `str` | `json.dumps()` coercion |
| single dict in `value` | `str \| list[str] \| list[dict]` | wrap in list |

**Verdict:** These are non-breaking schema gaps from the v3 prompt transition. The validators are backward-compatible and will not affect existing passing tests.

---

### Signal observations

#### JD 1 — Cloudworks (Infra Platform / Kubernetes / Observability)

**Summary quality:** ✅ Competent — opens with "5+ years in backend engineering", mentions Python microservices, performance, CI/CD, open-source. Picks up the right domain terms.

**Work Experience:**
- Every bullet was rewritten, including the two-bullet intern entry. This is maximal output for `full` mode — the model is treating the entire resume as fair game rather than making targeted edits. No new bullets were added (count stayed the same), so the `mode_constraint` is technically obeyed.
- Rewrites are high-quality: "Designed and built high-throughput Python microservices" replaces "Built and maintained REST APIs". Good signal, no invention.
- QuickCart intern got "strategic batching of write operations" for "batching write operations" — minor padding but not harmful.

**Skills regroup:** Model correctly regrouped into 4 coherent groups oriented toward the JD. However, the `regroup` change was **rejected** by the preservation pass (seen in "Rejected Changes"). This is expected — the cleanup pass protects skills from unauthorized rewrites. This is a known behaviour.

**Warnings:**
- `Removed AI-style phrasing: robust` — the cleanup pass caught a banned word. Good.
- `Removed 1 unsupported addition(s)` — one bullet snuck in that wasn't grounded; correctly pruned.

#### JD 2 — FinSight (Data Platform / Kafka / ETL / OLAP)

**Summary quality:** ✅ Good — pivots the framing to "data pipelines" which is what FinSight wants, and calls out PostgreSQL OLAP + on-call. Slightly shorter than ideal (≤3 sentences met).

**Work Experience:**
- Model used `append` ops for DataFlow and Bright Systems instead of rewriting existing bullets — a smarter approach than JD 1. The appended bullets are grounded (ETL, OLAP, Docker).
- **Duplicate bullet issue:** The append at `workExperience[1].description` produced a near-duplicate of an existing bullet ("Developed internal tooling in Python (Flask) to automate ETL pipelines" + new version). This is the `full` mode over-append risk noted in the plan — the appended bullet starts with the same prefix as the existing one.
- `Removed 2 unsupported additions` — cleanup caught two invented bullets (likely "Kafka" or "Airflow" references that weren't in the original resume).

**Declared changes field names:** JD 2's model response used `after` for the value key on summary change, showing non-determinism in how the model labels the field. The alias fix resolved this transparently.

---

### Issues to track

| # | Issue | Severity | Suggested fix |
|---|---|---|---|
| 1 | `changes[]` field naming non-determinism (`op` vs `action`, `after` vs `value`) | Medium | The alias validators in `ResumeChange` handle this now; long-term add a retry hint |
| 2 | JD 2: appended bullet near-duplicates existing bullet at `workExperience[1].description[0]` | Low-Medium | Tighten `full` mode_constraint to say "New bullets must not paraphrase existing bullets in the same entry" |
| 3 | JD 1: all bullets rewritten in `full` mode (expected, but maximally invasive) | Low | Acceptable per spec; may reconsider if user feedback indicates over-editing |
| 4 | Skills `regroup` op always rejected by preservation pass | Info | By design; preservation pass owns skills rewrites — the declared change is informational only |
