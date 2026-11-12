---
name: release-management
description: Prepare safe branches, pull requests, previews and release-readiness checks for Relatório Pro while protecting main and production.
---

# Release Management

1. Read AGENTS.md and docs/BRANCHING.md.
2. Confirm current branch, working tree, upstream and diff before any Git operation.
3. Work from develop using feature/*, fix/* or chore/*; never commit directly to main.
4. Inspect package scripts and available CI before deciding which checks to run.
5. Review migrations, environment variables, secrets, Vercel project/branch behavior and rollback strategy.
6. Prepare a clear PR summary, test evidence and preview validation steps.
7. Never merge to main, promote a production deployment, alter production environment variables or run destructive database actions without explicit approval.
8. A preview is not proof of production readiness; verify the exact deployment and branch.
9. Report branch, commit, PR, checks, preview and whether production changed.

Output: release checklist and explicit go/no-go recommendation.
