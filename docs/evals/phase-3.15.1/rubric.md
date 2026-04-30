# Phase 3.15.1 — Manual LLM eval rubric (resume tailoring)

Use with fixtures under `docs/plans/temp/` (e.g. `data-master.yaml`, `software-master.yaml`) and JDs under `jds/`. Score 1–5 per row; notes required for any score ≤2.

| Criterion | What “good” looks like |
|-----------|-------------------------|
| Callback strength | Concrete tools, systems, and outcomes a hiring manager can probe in interview |
| Defensibility | No inflated ownership; hedged metrics only when sourced |
| JD coverage | Priority themes reflected without fabrication |
| New-grad calibration | Trajectory and internships/projects weighted honestly |
| Technical specificity | Named stacks, boundaries, failure modes — not buzzwords |
| AI-sounding language | Minimal template phrasing; no hollow intensifiers |
| Schema conformance | Valid compact diff JSON; indexes within contract |

## Trap JDs (optional)

- Add a JD that demands **Kubernetes** production ownership when the resume has none — expect gap surfaced, not invented experience.
- Add a **senior staff** JD — expect scope softened to intern/new-grad reality.
