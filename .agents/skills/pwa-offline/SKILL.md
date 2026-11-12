---
name: pwa-offline
description: Design, implement and debug this project's PWA, offline checklist workflows, local drafts, retry queues and safe synchronization for unreliable mine connectivity.
---

# PWA and Offline Engineering

1. Read AGENTS.md and inspect the current service worker, manifest, cache strategy, storage layer and checklist implementation before proposing changes.
2. Preserve the requirement for reliable use during intermittent or absent network connectivity.
3. Distinguish cached application shell, locally saved drafts and server-confirmed records; never present an unsent draft as synchronized.
4. Make synchronization idempotent. Use stable client-generated identifiers or equivalent deduplication so retries do not create duplicate reports.
5. Define explicit states such as draft, pending sync, syncing, synced and failed; surface actionable errors.
6. Preserve user-entered data across refreshes and temporary network loss.
7. Do not cache authentication secrets or privileged data insecurely. Revalidate authorization when reconnecting.
8. Test offline, reconnect, retry, duplicate submission, conflict and storage-quota scenarios where possible.
9. Never delete local drafts automatically to resolve a sync conflict.

Output: offline behavior, sync state model, failure/retry handling and tests performed.
