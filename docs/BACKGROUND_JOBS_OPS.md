# Background jobs — staging / production ops

Durable async work for Profit Pulse Ally CRM. **Code is shipped; each environment must run a processor** or `PENDING` rows sit until something claims them.

Source of truth for product behavior remains [`DATABASE_AND_UI_REFERENCE.md`](./DATABASE_AND_UI_REFERENCE.md). This runbook is the operational checklist.

---

## What is enqueued

| Type | Payload | When |
|------|---------|------|
| `RECALCULATE_RETURNABLES_FOR_USER_CLIENT` | `{ userId, clientId }` | Client assignment create/delete, or bulk RELATIONSHIP assign |

**Enqueue path**

1. API handlers call `scheduleReturnableRecalculation(userId, clientId)` (fire-and-forget, not awaited).
2. That helper calls `enqueueReturnableRecalculationJob` in `lib/backgroundJobs.ts`:
   - If a **PENDING** job with the same type + payload already exists → bump `runAfter` to now (dedupe).
   - Else → `INSERT` with `status=PENDING`, `attempts=0`, `maxAttempts=5`, `runAfter=now`.
3. Best-effort: same request process then runs `processBackgroundJobs({ limit: 5, types: [...] })`.
4. If the process dies before step 3 finishes, the row stays **PENDING** until an external processor runs.

**Call sites:** `POST/DELETE /api/clients/[id]/assignments`, `POST /api/admin/leads/bulk-assign-relationship`.

**Not a BackgroundJob:** `POST /api/tasks/recalculate-returnables` runs `recalculateReturnablesForUserOnClient` **synchronously** (super admin only). Formulas are unchanged; this is a compat/manual path.

---

## How jobs are processed

1. **Reclaim stuck RUNNING** — any `RUNNING` row with `updatedAt` older than **15 minutes** is reset to `PENDING` with a reclaim note (`reclaimStuckRunningJobs`).
2. **Claim** — up to `limit` (default 10 via lib / 20 via CLI, max 50) rows where `status=PENDING` and `runAfter <= now`, ordered by `runAfter`, using `FOR UPDATE SKIP LOCKED`, set to `RUNNING` and increment `attempts`.
3. **Execute** — for returnable jobs, call `recalculateReturnablesForUserOnClient(userId, clientId)` (same formula path as sync).
4. **Outcome**
   - Success → `SUCCEEDED`
   - Error and `attempts < maxAttempts` → `PENDING` again with exponential backoff (`runAfter`: 5s → 20s → 80s → … capped at 15 minutes)
   - Error and attempts exhausted → `FAILED` with `lastError` (truncated)

Entrypoints:

| Entrypoint | Use |
|------------|-----|
| `npm run jobs:process` | One batch then exit (local/ops shell with `DATABASE_URL`) |
| `npm run jobs:process:once` | Same as `jobs:process` (explicit one-shot alias) |
| `POST /api/tasks/process-background-jobs` | HTTP cron / manual admin trigger |

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Prisma / job table access (CLI and app) |
| `CRON_SECRET` | **Staging/production for HTTP cron** | Shared secret for processor route. If unset, only **super admin** can call the HTTP processor (cron cannot). |
| `NEXTAUTH_SECRET` / app auth vars | For super-admin Bearer/session path | Only if using admin auth instead of cron secret |

No other job-specific env vars. Do **not** leave the processor route without auth — it is never open.

---

## Recommended production schedule

**Frequency:** every **1–5 minutes** (start with **every 2 minutes**).

Assignment APIs already best-effort process a small batch in-request; the cron drains leftovers, retries with backoff, and reclaims stuck `RUNNING` rows.

### Option A — HTTP cron (Vercel Cron, external scheduler, etc.)

```bash
curl -X POST "https://<host>/api/tasks/process-background-jobs" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"limit":20}'
```

Alternate header: `x-cron-secret: ${CRON_SECRET}`.

**Auth:** `CRON_SECRET` (timing-safe compare) **or** super admin session/Bearer. Response: `{ ok, claimed, succeeded, failed, jobIds, reclaimedStuck }`.

Example Vercel Cron (`vercel.json` — add only if you deploy on Vercel and want platform cron):

```json
{
  "crons": [
    {
      "path": "/api/tasks/process-background-jobs",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is configured in the project env — confirm against current Vercel docs for your plan.

### Option B — Shell cron / one-off on a machine with DB access

```bash
cd /path/to/app
export DATABASE_URL=...
npm run jobs:process
# or
npm run jobs:process:once -- --limit=20
```

---

## Monitoring

### CLI (preferred)

```bash
npm run jobs:status
```

Shows counts by status, PENDING due vs deferred, stuck RUNNING (>15m), sample PENDING/FAILED rows.

### SQL (Supabase / psql)

```sql
-- Counts
SELECT status, COUNT(*) FROM background_jobs GROUP BY status;

-- Due PENDING
SELECT id, type, attempts, "runAfter", "lastError", payload
FROM background_jobs
WHERE status = 'PENDING' AND "runAfter" <= NOW()
ORDER BY "runAfter" ASC
LIMIT 50;

-- FAILED
SELECT id, type, attempts, "maxAttempts", "lastError", "updatedAt", payload
FROM background_jobs
WHERE status = 'FAILED'
ORDER BY "updatedAt" DESC
LIMIT 50;

-- Stuck RUNNING (> 15 minutes)
SELECT id, type, attempts, "updatedAt", "lastError", payload
FROM background_jobs
WHERE status = 'RUNNING'
  AND "updatedAt" < NOW() - INTERVAL '15 minutes';
```

### Alerts (recommended)

| Signal | Severity | Action |
|--------|----------|--------|
| `PENDING` due count rising for >15–30 min | High | Check cron / `jobs:process`; verify `CRON_SECRET` / deploy |
| Any `FAILED` | Medium | Inspect `lastError`; fix data/code; re-run sync recalc or new enqueue |
| Stuck `RUNNING` | High | Run processor (auto-reclaims); investigate OOM/timeouts |

---

## Replay / recovery

1. **Drain queue:** `npm run jobs:process` (repeat until claimed=0) or HTTP processor.
2. **Stuck RUNNING:** next processor tick reclaims automatically; or run `jobs:process`.
3. **FAILED after investigation:** fix root cause, then either:
   - Trigger assignment change again (new enqueue), or
   - `POST /api/tasks/recalculate-returnables` with `{ userId, clientId }` (super admin, sync), or
   - Bulk: `npx tsx scripts/recalculate-commission-returnables.ts` (all WON deals — ops only).
4. Do **not** rewrite paid returnable amounts outside existing recalculation rules.

---

## Package scripts

| Script | Command |
|--------|---------|
| `npm run jobs:process` | One batch (`scripts/process-background-jobs.ts`, default `--limit=20`) |
| `npm run jobs:process:once` | Alias of `jobs:process` |
| `npm run jobs:status` | Read-only queue health |

---

## Related code

- `lib/backgroundJobs.ts` — enqueue, claim, process, reclaim
- `lib/commissionReturnables.ts` — `scheduleReturnableRecalculation`, formulas
- `src/app/api/tasks/process-background-jobs/route.ts` — HTTP processor
- `src/app/api/tasks/recalculate-returnables/route.ts` — sync compat
- Prisma model `BackgroundJob` / table `background_jobs`
