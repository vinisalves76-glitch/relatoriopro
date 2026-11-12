---
name: quality-engineering
description: Investigate defects, design test plans, perform read-only code reviews and verify Relatório Pro changes for regressions, security and operational correctness.
---

# Quality Engineering

1. Read AGENTS.md and identify acceptance criteria before reviewing.
2. Reproduce the issue or explain why reproduction is not possible.
3. Inspect the diff and adjacent code, not only the changed lines.
4. Review authentication, role permissions, RLS, input validation, error handling and data compatibility when relevant.
5. Check edge cases, empty states, retries, duplicate actions and mobile/responsive behavior as applicable.
6. Prefer read-only review. Do not modify files unless explicitly assigned implementation work.
7. Run only test/build commands confirmed by project configuration.
8. Separate confirmed defects from hypotheses and report evidence with file paths/line references.
9. Never state that tests passed if they were not executed.

Output: prioritized findings, severity, evidence, missing tests and a clear pass/block recommendation.
