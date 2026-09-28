---
title: "Allocation"
version: 0.1.0
lastUpdated: 2026-09-21
---

# AgentProxy Allocation

Allocation is not provider quota.

Quota pools define which API keys may consume a provider pool and how hard, soft, or burst policies apply. Provider quota is external capacity reported by a provider or an explicitly configured source. Ghostlight internal budgets are governance limits defined by the administrator.

The `ensurePool` operation is idempotent: an identical pool is unchanged, a changed allocation is updated, and a missing pool is created. This is intended for automation and bounded API callers.

The read-only status endpoint is `GET /api/agentproxy/status`. The verification command is `npm run agentproxy:verify`; it makes no live model request.
