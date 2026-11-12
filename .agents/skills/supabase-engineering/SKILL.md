---
name: supabase-engineering
description: Design, inspect, debug and safely evolve this project's Supabase schema, SQL migrations, RLS, Auth, Storage and Supabase MCP integration.
---

# Supabase Engineering

1. Read AGENTS.md, docs/DATABASE.md and docs/ARCHITECTURE.md.
2. Inspect js/core/supabase-adapter.js, all relevant SQL migrations, API handlers and frontend callers before changing schema.
3. Keep schema changes in versioned SQL migrations. Prefer additive, backward-compatible and reversible changes.
4. Map each table/column change to reads, writes, relationships, indexes, constraints, RLS policies and Storage behavior.
5. Never put service_role or privileged credentials in browser code or Git.
6. Never disable RLS or broaden policies to silence an authorization error.
7. Use Supabase MCP read-only for discovery against production. Only use write tools against a confirmed isolated development project/branch.
8. Before any remote write, state the exact project, environment, tool/action, SQL impact and rollback plan; obtain explicit approval.
9. Do not delete rows, tables, buckets, columns or policies without explicit approval and a recovery plan.
10. Validate migrations and policies with test users/fixtures; report what was actually executed.

Output: migration plan, SQL/migration, security impact, validation evidence and rollback notes.
