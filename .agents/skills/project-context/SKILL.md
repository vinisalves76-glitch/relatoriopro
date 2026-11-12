---
name: project-context
description: Understand the Relatório Pro product, business boundaries, architecture and non-negotiable operating rules before planning or changing code.
---

# Project Context

1. Read AGENTS.md, README.md and the relevant docs/ files.
2. Treat the current product as the Irmen operational/reporting system for ArcelorMittal Andradas.
3. Do not design multi-client support in this phase unless explicitly requested.
4. Preserve the 125h inspection/maintenance cycle and existing operational terminology.
5. Confirm implementation in code; documentation or UI copy alone does not prove a feature exists.
6. Supabase is the active backend. Treat Firebase as legacy.
7. Before proposing changes, summarize current behavior, affected areas, unknowns and acceptance criteria.
8. Stop and ask when an unclear requirement could alter data, permissions, safety or operational workflow.

Output: concise project understanding, constraints, plan and unresolved questions.
