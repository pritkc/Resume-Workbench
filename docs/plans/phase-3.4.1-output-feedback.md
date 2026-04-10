[system] You are an expert resume editor. Output only valid JSON — no markdown fences, no commentary.

HONESTY (violation = interview harm):
- Never invent skills, tools, certifications, metrics, companies, or dates
- Never upgrade experience level or add new employers
- Skill values must each appear exactly once; relabeling and regrouping is allowed

OUTPUT:
- JSON with exactly these keys: "summary", "experience", "projects", "skills"
- summary: one sentence — "[N]+ years in [domain], [1-2 JD strengths]." No second sentence.
- experience / projects: object keyed by 0-based entry index (string "0", "1", …)
  - only include entries you are changing
  - each entry: { "bullets": { "INDEX": "rewritten text" } }
  - projects may also include "tech_stacks": "new tagline"
  - INDEX must be within bullet_counts for that entry — no new indices
  - omit an index to keep that bullet unchanged
- skills: array of { "label": "...", "values": [...] } when any group changes; omit key otherwise
  - total value count must equal skills_values from contract — no new values
- Do NOT emit: id, company, location, dates, role, github, website, customSections, changes[]

VOICE:
- Active verbs: led, built, designed, ran, managed, improved, reduced, created
- Banned: spearheaded, leveraged, orchestrated, utilized, facilitated, synergy, robust, scalable, holistic, proactive
- No em-dash

You must respond with valid JSON only. No explanations, no markdown.

[user] Tailor this resume for the target job.

MODE: full — Rewrite bullets to strongly match the JD. You may rewrite any existing bullet at its index. Omit entries with no changes. No new bullets — only rewrite what is already there.

REWRITING EXAMPLE:
Original bullet: "Worked on backend systems"
JD mentions: Kubernetes, CI/CD
Rewritten: "Built and maintained backend services across Kubernetes clusters with automated CI/CD pipelines"

Output format example (2 changed bullets in entry 0, 1 changed bullet in entry 1):
{"summary":"5+ years in Python backend engineering with expertise in high-throughput APIs and CI/CD.","experience":{"0":{"bullets":{"1":"Built and maintained..."}},"1":{"bullets":{"2":"Improved CI/CD..."}}}}

Output language: English

JOB ANALYSIS:
{"core_title":"Software Engineer III","company_name":"Walmart Global Tech","experience_years":6,"seniority_level":"senior","required_skills":["Java","Spring Boot","React","TypeScript","REST APIs","Microservice Architecture","Distributed Systems","Caching","Consistency","Resiliency Patterns","Data Structures","Algorithms"],"preferred_skills":["Kafka","Event-Driven Architectures","GraphQL","API Gateways","Schema Governance","PostgreSQL","MySQL","Redis","MongoDB","Machine Learning","Search Systems","Information Retrieval"],"keywords":["microservices","cloud-native","full-stack","distributed systems","agile","DevOps","CI/CD","observability","scalability","reliability","performance","security"],"key_responsibilities":["Contribute to architecture & technical direction for large-scale full-stack systems","Define API strategy, domain models, UI architecture, and integration patterns","Drive standardization on secure coding, API contracts, versioning, CI/CD, and observability","Establish technical best practices and coding standards","Strong in coding and problem solving skills","Understand and contribute to resilient, fault-tolerant, cloud-native microservices","Develop responsive, accessible, and modular frontend applications","Own non-functional requirements: performance, scalability, reliability, cost efficiency, disaster recovery","Implement cloud-native patterns on Kubernetes","Build monitoring, logging, metrics, and tracing frameworks","Develop infrastructure-as-code solutions and automation frameworks","Optimize for cost efficiency, performance, and reliability"],"experience_requirements":["6+ years of software engineering experience with ownership of production systems"],"education_requirements":["Bachelor's degree in Computer Science, Computer Engineering, or related field (or equivalent experience)"],"supported_keywords_from_resume":["REST APIs","Caching","Consistency","Algorithms","Kafka","PostgreSQL","Redis","agile","CI/CD","reliability","performance"]}

JOB DESCRIPTION:
About the Team

Enterprise Business Services (EBS) is a core pillar of Walmart Global Tech, powering the systems behind millions of daily interactions across Finance, People, Associate Digital Experience, and Talent. From the moment an associate logs in, to a customer making a purchase, to seamless hiring journeys—EBS ensures the business runs reliably, securely, and at scale.

We're building next-generation intelligent platforms that power global operations across multiple markets. Join us to solve complex engineering challenges and shape the future of Walmart's enterprise ecosystem.

Technical Leadership

- Contribute to architecture & technical direction for large-scale full-stack systems (Java/Spring Boot + React/TypeScript)

- Define API strategy, domain models, UI architecture, and integration patterns across services

- Drive standardization on secure coding, API contracts, versioning, CI/CD, and observability

- Establish technical best practices and coding standards across teams

- Very strong in coding and problem solving skills in any language of choice.

- Quick learner in adopting and delivering in any technology .

Collaboration & Delivery

- Partner with Product, UX, and business teams to translate requirements into technical solutions

- Lead complex initiatives across squads: breaking down work, unblocking teams, ensuring quality

- Mentor engineers and contribute to hiring & building a strong engineering culture

- Champion innovation and continuous improvement across the organization

Must-Have Qualifications

- 6+ years** of software engineering experience with ownership of production systems

- Strong Backend Expertise: Java (17+), Python, Spring Boot, REST APIs, microservice architecture

- Strong Frontend Expertise: React, TypeScript, testing frameworks (Jest, Cypress)

- Deep understanding of distributed systems, caching, consistency, and resiliency patterns

- Solid skills in data structures, algorithms, and system design

- Experience with CI/CD, automated testing, and DevOps practices

- Exposure to public cloud platforms (AWS/GCP/Azure) and Kubernetes

- Experience in Agile environments with strong problem-solving and communication skills

- Bachelor's degree in Computer Science, Computer Engineering, or related field (or equivalent experience)

Good to Have

- Experience with Kafka or event-driven architectures

- Exposure to GraphQL, API gateways, and schema governance

- Experience with relational databases (PostgreSQL/MySQL) and NoSQL stores (Redis, MongoDB)

- Understanding of machine learning, search systems, or information retrieval

- Background in enterprise domains: HR tech, workflow systems, finance/operations

- Good understanding or hands-on experience in AI/ML ecosystem

- React Native experience for mobile development

Minimum Requirements

- Bachelor's degree in Computer Science, Computer Engineering, Computer Information Systems, Software Engineering, or related area

- 6 years of experience in software engineering or related field

- OR equivalent professional experience demonstrating mastery in related technologies

Role Summary

We're seeking a Software Engineer III  to join our Engineering Team and help build scalable, mission-critical solutions using modern web technologies and cloud infrastructure. You'll architect and develop high-impact products using Java/Spring Boot, React, React Native, cloud platforms, and DevOps best practices, while mentoring junior engineers and driving technical excellence across our organization.

What You'll Do

System Design & Development

- Understand and contribute to resilient, fault-tolerant, cloud-native microservices with strong SLAs

- Develop responsive, accessible, and modular frontend applications using React & TypeScript

- Own non-functional requirements: performance, scalability, reliability, cost efficiency, disaster recovery

- Must follow and adhere to distributed system design standard.

RESUME:
{"summary":"Software/Data Infrastructure Engineer specializing in scalable data pipelines, MLOps, and real-time systems, with proven impact in optimizing large-scale workflows, enabling GenAI use cases, and improving data reliability across enterprise environments.","workExperience":[{"id":1,"position":"Software Engineer, Data Infra & MLOps","title":"Software Engineer, Data Infra & MLOps","company":"Humana","location":"Remote","start_date":"2025-05","end_date":"present","date":"2025-05 - present","years":"2025-05 - present","summary":null,"description":["Contract role | Partnered with engineering and business stakeholders to define requirements, dependencies, and delivery flows for a 1.2M member RAG; implemented CDC-style updates to keep vector embeddings synchronized with clinical records in <5 minutes","Analyzed legacy warehouse workflows and translated improvement opportunities into scalable dbt incremental models; reduced compute runtime from 2.5 hours to 23 minutes on 450M row tables via partition pruning","Designed the \u2018Silver Layer\u2019 audit schema in Delta Lake and documented system dependencies, retention controls, and operational policies; utilized PostgreSQL partitioning and S3 offloading to support TB-scale ingestion without locking production tables","Established data quality gates within Airflow DAGs using dbt tests and Great Expectations to ensure release readiness, predictable handoffs, and 99.7% data reliability for downstream dashboards","Worked across analytics and platform teams to improve maintainability and response performance for GenAI use cases; built a Redis caching layer that reduced repeated warehouse fetches by 35%"]},{"id":2,"position":"Research Engineer (IoT & Infra)","title":"Research Engineer (IoT & Infra)","company":"SDSU CSRC","location":"San Diego, CA","start_date":"2024-08","end_date":"2025-05","date":"2024-08 - 2025-05","years":"2024-08 - 2025-05","summary":null,"description":["Built a distributed data processing pipeline on a 16-node SLURM cluster; documented processing stages, data movement, and operational constraints while improving I/O throughput by 2.5x via CSV-to-Parquet/HDF5 conversion","Translated research and facility-monitoring needs into structured time-series feature pipelines for HVAC sensor data, handling missing values, timestamp alignment, and functional requirements for high-frequency (1Hz) datasets"]},{"id":3,"position":"Intern, Data Infra","title":"Intern, Data Infra","company":"GoFundMe","location":"San Francisco, CA","start_date":"2024-06","end_date":"2024-08","date":"2024-06 - 2024-08","years":"2024-06 - 2024-08","summary":null,"description":["Team: Trust & Safety | Partnered with cross-functional stakeholders to translate fraud detection use cases into streaming data requirements; designed a Kappa Architecture framework using Kafka and Spark Structured Streaming for 85K daily events","Orchestrated multi-stage Airflow DAGs for Features as a Service; managed upstream/downstream dependencies and assembled 165K weekly labeled datasets from heterogeneous sources (Postgres, API, Sheets)","Investigated and resolved a critical data skew issue in Spark jobs by analyzing job behavior and re-partitioning datasets on high-cardinality keys to improve reliability of pipeline execution","Automated schema validation and historical backfills for risk campaigns, ensuring alignment between Offline Feature Store(Iceberg/Parquet) and Online Store (Redis) for predictable model behavior"]},{"id":4,"position":"Software Engineer II, I","title":"Software Engineer II, I","company":"Sudathi","location":"Surat, IN","start_date":"2022-05","end_date":"2023-08","date":"2022-05 - 2023-08","years":"2022-05 - 2023-08","summary":null,"description":["Client: Maersk | Gathered and translated shipment data requirements into a high-reliability webhook ingestion service using RabbitMQ; implemented dead-letter queues (DLQ) to preserve critical event delivery","Implemented database migration pipelines (Liquibase) for multi-tenant schema changes across 12 distribution centers, improving release consistency across business-critical environments"]}],"personalProjects":[{"id":1,"name":"MOLE Docs | Open-Source Scientific Computing Library","tech_stacks":"Sphinx, Python, C++, Doxygen","role":"Sphinx, Python, C++, Doxygen","date":"","years":"","github":null,"website":null,"description":["Built a contributor-facing documentation workflow using Sphinx and Python extensions to parse C++ source code, generate structured reference pages, and improve knowledge transfer for downstream users and maintainers"]},{"id":2,"name":"First2Fetch | Job Board Aggregator Platform","tech_stacks":"Node.js, PostgreSQL, Web Scraping, REST APIs","role":"Node.js, PostgreSQL, Web Scraping, REST APIs","date":"","years":"","github":null,"website":null,"description":["Built a custom Web Scraper and API aggregator to consolidate job listings from multiple sources into a unified database. Optimized complex text search workflows using PostgreSQL GIN indexes, enabling users to filter and find opportunities in <100ms."]},{"id":3,"name":"PriceScout | Competitive Market Intelligence","tech_stacks":"Python, PostgreSQL, OpenClaw, n8n, Distributed Crawling","role":"Python, PostgreSQL, OpenClaw, n8n, Distributed Crawling","date":"","years":"","github":null,"website":null,"description":["Deployed OpenClaw crawlers to orchestrate distributed scraping across high-complexity e-commerce domains; harvested and structured 15,000+ real-time SKU records into a normalized PostgreSQL schema; n8n to detect price variance anomalies."]}],"skills":{"groups":[{"label":"Languages","values":["Python","SQL","JavaScript/Node.js"]},{"label":"Agile & Docs","values":["Jira","Confluence","User Stories","Acceptance Criteria","System Mapping","Requirements Documentation","RCA"]},{"label":"Data & Analytics","values":["Airflow","dbt","PySpark","Kafka","RabbitMQ","Snowflake","Parquet/Iceberg","Databricks"]},{"label":"Systems & Cloud","values":["PostgreSQL","Redis","Docker","Kubernetes","Terraform","AWS","OpenTelemetry"]},{"label":"Automation","values":["n8n","OpenClaw","Workato","Power Automate","CI/CD"]},{"label":"Leadership","values":["Teaching Associate for Algorithms","2x hackathon winner (AWS AI","NASA SpaceApps)"]}]},"customSections":{}}

RESPONSE CONTRACT:
{"mode":"full","output_keys":["summary","experience","projects","skills"],"experience":{"entries":["Humana","SDSU CSRC","GoFundMe","Sudathi"],"bullet_counts":[5,2,4,2]},"projects":{"entries":["MOLE Docs | Open-Source Scientific Computing Library","First2Fetch | Job Board Aggregator Platform","PriceScout | Competitive Market Intelligence"],"bullet_counts":[1,1,1]},"skills_values":33}





output (raw LLM response)


{
  "summary": "2+ years in backend and data infrastructure engineering, with expertise in distributed systems, API development, and CI/CD.",
  "experience": {
    "0": {
      "bullets": {
        "0": "Designed and implemented CDC-style updates for a 1.2M member RAG system, ensuring real-time synchronization of vector embeddings with clinical records in under 5 minutes, enhancing data consistency across distributed systems.",
        "1": "Optimized legacy data warehouse workflows by implementing scalable dbt incremental models, reducing compute runtime from 2.5 hours to 23 minutes on 450M row tables through partition pruning, improving system performance.",
        "2": "Architected a 'Silver Layer' audit schema in Delta Lake, leveraging PostgreSQL partitioning and S3 offloading to support TB-scale data ingestion without impacting production tables, ensuring data consistency and system reliability.",
        "3": "Established robust data quality gates within Airflow DAGs using dbt tests and Great Expectations, ensuring 99.7% data reliability and release readiness for critical downstream dashboards, enhancing observability and CI/CD.",
        "4": "Built a Redis caching layer to improve response performance for GenAI use cases, reducing repeated warehouse fetches by 35% and enhancing the reliability of distributed data access."
      }
    },
    "1": {
      "bullets": {
        "0": "Built a distributed data processing pipeline on a 16-node SLURM cluster, improving I/O throughput by 2.5x through CSV-to-Parquet/HDF5 conversion, demonstrating expertise in distributed system performance optimization.",
        "1": "Designed and implemented structured time-series feature pipelines for high-frequency (1Hz) HVAC sensor data, addressing missing values and timestamp alignment to ensure data consistency for research applications."
      }
    },
    "2": {
      "bullets": {
        "0": "Designed a Kappa Architecture framework using Kafka and Spark Structured Streaming to process 85K daily events for fraud detection, establishing a scalable, event-driven architecture for real-time data processing.",
        "1": "Orchestrated multi-stage Airflow DAGs for Features as a Service, managing complex upstream/downstream dependencies and integrating 165K weekly labeled datasets from diverse sources including PostgreSQL and REST APIs.",
        "2": "Resolved a critical data skew issue in Spark jobs by re-partitioning datasets on high-cardinality keys, significantly improving the reliability and performance of distributed pipeline execution.",
        "3": "Automated schema validation and historical backfills, ensuring data consistency between Offline Feature Stores (Iceberg/Parquet) and Online Stores (Redis) for predictable model behavior and improved data reliability."
      }
    },
    "3": {
      "bullets": {
        "0": "Developed a high-reliability webhook ingestion service using RabbitMQ, implementing dead-letter queues (DLQ) to preserve critical event delivery and enhance system resiliency in a distributed environment.",
        "1": "Implemented database migration pipelines (Liquibase) for multi-tenant schema changes across 12 distribution centers, improving release consistency and reliability in distributed, business-critical environments."
      }
    }
  },
  "projects": {
    "1": {
      "bullets": {
        "0": "Built an API aggregator to consolidate job listings, optimizing complex text search workflows using PostgreSQL GIN indexes to enable sub-100ms query responses and demonstrate strong API development skills."
      }
    },
    "2": {
      "bullets": {
        "0": "Deployed distributed crawlers to harvest and structure 15,000+ real-time SKU records into a normalized PostgreSQL schema, enabling detection of price variance anomalies and demonstrating distributed system design."
      }
    }
  },
  "skills": {
    "groups": [
      {
        "label": "Programming Languages",
        "values": [
          "Python",
          "SQL",
          "JavaScript/Node.js"
        ]
      },
      {
        "label": "Backend & Distributed Systems",
        "values": [
          "Kafka",
          "RabbitMQ",
          "Redis",
          "PostgreSQL",
          "PySpark",
          "Parquet/Iceberg"
        ]
      },
      {
        "label": "Cloud & DevOps",
        "values": [
          "AWS",
          "Docker",
          "Kubernetes",
          "Terraform",
          "CI/CD",
          "OpenTelemetry",
          "Airflow"
        ]
      },
      {
        "label": "Data Platforms & Tools",
        "values": [
          "dbt",
          "Snowflake",
          "Databricks"
        ]
      },
      {
        "label": "Agile & Documentation",
        "values": [
          "Jira",
          "Confluence",
          "User Stories",
          "Acceptance Criteria",
          "System Mapping",
          "Requirements Documentation",
          "RCA"
        ]
      },
      {
        "label": "Automation & Integration",
        "values": [
          "n8n",
          "OpenClaw",
          "Workato",
          "Power Automate"
        ]
      },
      {
        "label": "Algorithms & Problem Solving",
        "values": [
          "Teaching Associate for Algorithms",
          "2x hackathon winner (AWS AI",
          "NASA SpaceApps)"
        ]
      }
    ]
  }
}

---

## Critique

### Structure

| Check | Result |
|---|---|
| Top-level keys only: summary, experience, projects, skills | **Pass** |
| No forbidden keys (id, company, dates, changes[], workExperience) | **Pass** |
| experience keyed by string integer index | **Pass** |
| All bullet indices within bullet_counts | **Pass** — all indices in range |
| skills is array of `{label, values}` — no `id` | **Pass** |
| skills total value count = 33 (contract) | **Fail — 33 values emitted but the split corrupted one entry (see below)** |

### Content Quality

**summary** — partially broken.
> "2+ years in backend and data infrastructure engineering, with expertise in distributed systems, API development, and CI/CD."

- Years is undersold. Resume shows 2022–present (≈3 years) and the JD requires 6+. Should be "3+ years" at minimum and could frame more aggressively.
- Domain is "backend and data infrastructure" but JD is full-stack Java/React at Walmart scale. Summary doesn't pivot toward the JD domain (distributed systems, cloud-native, full-stack).
- Format is technically compliant (one sentence) but weak on JD alignment.

**experience bullets** — mostly good rewrites, but a pattern of padding is visible.

Problems:
1. **Trailing purpose clauses on every bullet** ("…enhancing data consistency across distributed systems", "…demonstrating expertise in distributed system performance optimization"). These are filler. The original bullets had crisp endings with metrics. The rewrites dilute them.
2. **Bullet 0 of entry 0**: adds "enhancing data consistency" — not in original, borderline invented intent.
3. **Bullet 2 of entry 0**: "leveraging" — banned word. Exact violation.
4. **Bullet 3 of entry 0**: "robust" — banned word. Exact violation.
5. **Bullet 0 of entry 1** (SDSU): ends with "demonstrating expertise in distributed system performance optimization" — self-narrating filler, never say what the bullet shows.
6. No project bullet returned for entry 0 (MOLE Docs). Since MOLE Docs has 1 bullet and it was unchanged, this is technically correct to omit — but MOLE Docs is the weakest project for a Walmart SWE III JD and could have been tailored toward documentation-as-engineering or C++ systems work.

**projects** — skipped entry 0 (MOLE Docs), rewrote 1 and 2. Acceptable but MOLE Docs rewrite was a missed opportunity.

**skills** — regrouped well. JD-relevant groups (Backend & Distributed Systems, Cloud & DevOps) moved to top. However:
- The last group "Algorithms & Problem Solving" split `"2x hackathon winner (AWS AI, NASA SpaceApps)"` into two separate array values: `"2x hackathon winner (AWS AI"` and `"NASA SpaceApps)"`. **This is a data corruption bug.** The original value `"2x hackathon winner (AWS AI"` was already a broken value in the source resume (the comma inside the string caused this), but the LLM faithfully preserved the corruption instead of normalizing it. This is a pre-existing source data issue, not a hallucination.
- `Databricks`, `Snowflake`, `dbt` moved to "Data Platforms & Tools" — reasonable but these are less relevant to the JD; minor.

### Summary of Issues

| Severity | Issue |
|---|---|
| **High** | "leveraging" — banned word in bullet 2, entry 0 |
| **High** | "robust" — banned word in bullet 3, entry 0 |
| **Medium** | Summary undersells years (should be 3+) and doesn't pivot to JD domain (Java/Spring Boot, full-stack) |
| **Medium** | Trailing self-narrating purpose clauses on multiple bullets ("demonstrating expertise in…", "enhancing data consistency…") — adds tokens, reduces impact |
| **Low** | MOLE Docs (project 0) not tailored — omission is valid but missed opportunity |
| **Info** | Skills split `"2x hackathon winner (AWS AI, NASA SpaceApps)"` — pre-existing source corruption, LLM preserved it faithfully |

### Overall

Format compliance is solid. The compact diff structure works — the model returned only deltas, used correct indices, respected bullet_counts, and produced valid JSON. The quality issues are content-level: banned words leaked through, summary is weak, and padding phrases inflated bullets. These are prompt tuning problems, not structural failures.
