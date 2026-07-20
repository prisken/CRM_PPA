# CRM Performance & Maintainability Refactor Plan

> **Purpose:** Prioritized plan to improve CRM speed, maintainability, and mobile/iPad reliability without changing product rules.  
> **Sources of truth:** `docs/DATABASE_AND_UI_REFERENCE.md` + codebase audit + **final performance review (July 21, 2026)**.  
> **Scope of this document:** Planning for **remaining** work. Shipped items are marked explicitly so they are not re-queued.  
> **Deployment branch:** `deploy`  
> **Measurement:** `PERF_LOGGING_ENABLED=true` + `npx tsx scripts/profile-api-routes.ts`  
> **Timings caveat:** Published route timings in the UI reference are from **June 24, 2026**. Do not invent new numbers here — re-baseline after the next sprint.

**Last updated:** July 21, 2026 (aligned with final performance review; schema/migrations verified for indexes + BackgroundJob)

---

## Table of contents

1. [Refactor goals](#1-refactor-goals)
2. [Current bottlenecks](#2-current-bottlenecks)
3. [Next Sprint Hot Paths](#3-next-sprint-hot-paths)
4. [Route-level performance concerns](#4-route-level-performance-concerns)
5. [Database / index concerns](#5-database--index-concerns)
6. [Client 360 refactor plan](#6-client-360-refactor-plan)
7. [Lead Command Center refactor plan](#7-lead-command-center-refactor-plan)
8. [Strategy Planner refactor plan](#8-strategy-planner-refactor-plan)
9. [Dashboard refactor plan](#9-dashboard-refactor-plan)
10. [iPad / Safari UX fixes](#10-ipad--safari-ux-fixes)
11. [Background job refactor plan](#11-background-job-refactor-plan)
12. [Auth normalization plan](#12-auth-normalization-plan)
13. [Testing plan](#13-testing-plan)
14. [Step-by-step implementation checklist](#14-step-by-step-implementation-checklist)
15. [Risk level for each task](#15-risk-level-for-each-task)
16. [Rollback notes](#16-rollback-notes)

---

## 1. Refactor goals

| Goal | Success signal |
|------|----------------|
| **Faster list surfaces** | Lead Command Center and Master Pipeline respond with SQL-limited pages; no full-table duplicate scans on every request |
| **Cheaper Client 360 mutations** | Aside/widget mutations do not always re-run full RSC refresh + strategy refetch |
| **Bounded dashboard queries** | Widgets use `take` / shared context; no duplicate `/api/me/assignments` |
| **Predictable mobile UX** | Tall modals use `dvh`; Safari autofill remains readable; Strategy Planner usable on iPad |
| **Reliable side effects** | ✅ **Shipped (code):** durable `BackgroundJob` enqueue + retries/backoff. **Still open (ops):** reliable `jobs:process` / cron in each environment |
| **Simpler auth** | One authentication path (Bearer **or** session) for Client 360 mutation routes (partially progressed — see §12) |
| **Maintainable Strategy Planner** | Split mega-components; thinner DTOs per view (Board / List / Projection / Overview) |
| **Safe rollout** | Each phase measurable with `[perf]` logs; migrations reversible or additive indexes only |

**Non-goals (preserve product rules):**

- No compounding / IRR / ROI / yield in Strategy Planner
- Backend must not overwrite saved projection milestone values
- Commission formulas and assignment occupancy limits stay as documented
- Do not remove participant-backed vs legacy fallback until backfill is complete and audited

---

## 2. Current bottlenecks

### Shipped (do not re-queue)

Confirmed against `prisma/schema.prisma` + migrations (July 21, 2026):

| Area | Status | Evidence |
|------|--------|----------|
| **Phase 1–3 performance indexes** | ✅ Shipped | `20260617003208_add_performance_indexes`, `20260624084311_add_performance_indexes_phase_2`, `20260721020000_add_performance_indexes_phase_3` (incl. `Client(status)`, `client_assignments(client_id)`, notifications, `pg_trgm` GINs). Occupancy **partial uniques** still deferred (data may violate). |
| **BackgroundJob durability** | ✅ Shipped (code) | `20260721030000_add_background_jobs`; `scheduleReturnableRecalculation` → enqueue + best-effort `processBackgroundJobs`; retries/`maxAttempts`; sync recalculate route kept for compat |
| **Dashboard architecture** | ✅ Partial ship | Per-widget APIs + skeletons; shared context for legacy monolith; SQL deal aggregates; admin `unstable_cache` 600s |
| **LCC inbox vs preview split** | ✅ Shipped | Slim inbox row; on-open preview API |
| **Strategy code-splitting** | ✅ Partial ship | `next/dynamic` Board/Projection/modals; conditional view mount |
| **Global search** | ✅ Shipped | Ranked slim `searchClients` (no full dup/activity scan) |
| **Important Dates calendar API** | ✅ Partial ship | Dedicated widget API + event `take` cap |
| **`[perf]` instrumentation** | ✅ Shipped | `lib/performance.ts` + payload category warns |

> **Doc mismatch (not inventing a fix here):** UI reference still says Client 360 loads via `loadClient360PageData()`. Live page loads core then `Promise.all([deals, hierarchy])` via the individual loaders; `loadClient360PageData` exists in `lib/client360.ts` but is unused by the page. Update the UI reference when convenient.

### Still open (final review)

| Area | Bottleneck | Primary symbols |
|------|------------|-----------------|
| **Lead Command Center** | Load-all matching clients, then filter/sort/**slice**; full-table **`loadDuplicateClientIds()`** on every list | `fetchLeadCommandCenterPage` / `fetchLeadCommandCenterRows`, `loadDuplicateClientIds` |
| **Lead preview** | Preview API is separate (good), but still runs **full dup scan** on open | `fetchLeadCommandCenterPreview` |
| **Master Pipeline** | Unbounded `findMany` of all clients; filters in browser | `GET /api/admin/pipeline`, `fetchAdminPipelineClients`, `MasterPipelineView` |
| **Client 360 refresh** | Every mutation → `router.refresh()` + `refreshKey++` (no scopes) | `Client360PageClient.triggerDataRefresh` |
| **Client 360 deals** | All deals × all participants in one payload | `getClient360DealsData`, `dealResponseSelect` |
| **Admin / dashboard commission** | Hydrate WON deals + participants (cached 10 min for admin; per-request for standard context) | `adminAnalyticsCache`, `fetchWonDealsWithParticipants*`, `standardDashboardContext` |
| **Dashboard widgets** | Unbounded findMany then `.slice(0, 20)` (deal participation); open tasks lack DB `take`; **duplicate** `/api/me/assignments` (page + calendar) | `buildDealParticipationWidget`, `buildOpenTasksWidget`, `ImportantDatesCalendarWidget` |
| **Strategy Planner** | Full plan include for every view (fat DTO); mega-components remain | `strategyPlanDetailInclude`, `StrategyPlanDetailView`, `StrategyPlannerBoard` |
| **Background jobs (ops)** | Durable queue exists, but **production/staging must run** `npm run jobs:process` or `POST /api/tasks/process-background-jobs` or PENDING rows sit | ops / cron / runbook |
| **Legacy paths** | Old dashboard monolith routes; `Strategy`/`Document` models | Docs known limitations |

---

## 3. Next Sprint Hot Paths

Ordered by leverage (final performance review). No new measurements invented — success = `[perf]` / payload improvements vs current baselines after implementation.

| Order | Task | Outcome |
|-------|------|---------|
| **1** | **LCC duplicate optimization + SQL pagination preparation** | Remove/cache/precompute `loadDuplicateClientIds` on list **and** preview; document which post-filters block pure SQL `take`/`skip`; push DB limit where safe |
| **2** | **Client 360 scoped refresh + deal summary DTO** | Split `triggerDataRefresh` scopes; avoid full RSC on aside mutations; list deals without full participant trees (expand on edit) |
| **3** | **Dashboard `take` + assignment dedupe** | DB `take` on open-tasks / deal-participation; pass assignments into Important Dates calendar (kill second `/api/me/assignments`) |
| **4** | **Admin pipeline bounded API** | Server status/search filters + `limit`/cursor; stop unbounded all-clients hydrate |
| **5** | **Jobs processing ops** | Ensure staging/prod cron or scheduled `jobs:process`; log/alert PENDING/FAILED; runbook for replay |
| **6** | **Re-baseline timings** | Re-run `PERF_LOGGING_ENABLED` + `profile-api-routes` (and extend coverage: LCC, preview, pipeline, Client 360 refresh, strategy GET, search, calendar); update UI reference June 24 table |

---

## 4. Route-level performance concerns

Use `PERF_LOGGING_ENABLED=true` and extend `[perf]` tags where missing (Client 360 RSC, LCC, pipeline, strategy plan GET).

| Route / surface | Concern | Target direction |
|-----------------|---------|------------------|
| `GET /api/admin/leads` | In-memory pagination after full match set; dup scan | DB `take`/`skip` (or cursor); cached/precomputed dup flags |
| `GET /api/admin/leads/[id]/preview` | Dup scan on open | Share cached dup set / skip full scan |
| `GET /api/admin/leads/duplicates` | Heavy email/phone grouping | Dedicated query + indexes; optional TTL cache |
| `GET /api/admin/pipeline` | Unbounded client list | Server filters + cursor/limit |
| Client 360 RSC (`/clients/[id]`) | Full core+deals+hierarchy on every `router.refresh` | Targeted revalidation / client-only widget refresh |
| `GET /api/clients/[id]/strategy-plans/[planId]` | Deep include (steps, expenses, milestones, sources, deals) | View-specific selects (board vs list vs projection) |
| `GET /api/dashboard/widgets/*` | Some widgets still hydrate large deal graphs; missing DB `take` | Prefer SQL aggregates; cap list widgets at DB |
| `GET /api/me/assignments` | Called twice on dashboard load | Share from page → calendar props |
| Admin funnel/KPIs/leaderboards | Cold miss hydrates all/YTD WON deals | Keep cache; add summary tables or narrower aggregates |
| `GET /api/admin/all-commission-returnable` | Full reconciliation list (~220–250 ms warm, June 24 doc) | Pagination + filters server-side |
| Activity feed APIs | Assignment-scoped correlated SQL — OK at moderate scale | Monitor; ensure LIMIT always applied |
| Legacy `GET /api/dashboard/standard`, `GET /api/get-dashboard-data` | Compat/tests only; risk of accidental use | Deprecate gate or remove after test migration |

**Already healthy (do not regress):**

- Per-widget dashboard endpoints + skeleton loaders
- `fetchDealAggregatesByClientIds` SQL GROUP BY
- Activity feed `UNION ALL` with limit
- Admin analytics auth-before-cache + `force-dynamic`
- Client 360 lazy workspace tabs
- Slim LCC inbox + on-demand preview payload split
- Ranked slim global search (`GET /api/search/clients`)
- Durable `BackgroundJob` enqueue for returnable recalc (ops processor still required)

---

## 5. Database / index concerns

### Already shipped (keep) — confirmed in schema/migrations

| Migration / area | Covers |
|------------------|--------|
| Phase 1 `20260617003208_add_performance_indexes` | Deals, interactions, activity logs, read status |
| Phase 2 `20260624084311_add_performance_indexes_phase_2` | Assignments (`userId`), tasks (`assigneeId,status,dueDate`), deals, returnables |
| Phase 3 `20260721020000_add_performance_indexes_phase_3` | Client filters, assignment `clientId`, notifications, tasks/documents/`dealId` returnables, source `(clientId, receivedAt)`, `pg_trgm` search GINs |
| Background jobs `20260721030000_add_background_jobs` | `background_jobs` + status/`runAfter` indexes |
| Strategy / contacts / important dates | Plan/milestone/contact indexes as in schema |

**Mismatch check:** Plan previously listed “hot paths still missing `ClientAssignment(clientId)`, `Client(status)`, `Notification`” — **incorrect vs current schema**. Those indexes exist. Only occupancy partial uniques remain deferred.

### Deferred (cleanup then unique)

| Index | Why deferred |
|-------|----------------|
| Partial unique `client_assignments(client_id) WHERE role = RELATIONSHIP` | Existing data may have >1 row |
| Partial unique `… WHERE role = ACCOUNT_SERVICE` | Same |
| Unique `(client_id, user_id, role)` | Exact duplicate triples may exist |

Preflight before enforcing:

```sql
SELECT client_id, role, COUNT(*) FROM client_assignments
WHERE role IN ('RELATIONSHIP', 'ACCOUNT_SERVICE')
GROUP BY client_id, role HAVING COUNT(*) > 1;
```

### Query-layer next steps (indexes alone do not fix)

1. LCC: push `LIMIT` into Prisma/`findMany` before post-filters where post-filters allow; otherwise materialize attention/dup flags.
2. Duplicate detection: avoid full-table scan per LCC list/preview — TTL cache, precomputed flags, or duplicates-API-only badges.
3. Company hierarchy: `take` + order colleagues.
4. Deal participation / open tasks: `take` at DB layer.
5. Won-deal hydrates: long-term replace with pre-aggregated commission read models.

---

## 6. Client 360 refactor plan

**Current:** Core load then parallel deals + hierarchy (individual loaders); workspace tabs lazy; mutations call full `router.refresh()` via `triggerDataRefresh`. (UI reference still mentions unused `loadClient360PageData()` — see §2 mismatch note.)

### Phase A — Refresh narrowing (high impact, medium risk) — **OPEN**

1. Split `triggerDataRefresh` into scopes: `core` | `deals` | `hierarchy` | `workspace` | `strategy` | `all`.
2. Default aside mutations (details, team, hierarchy) to client refetch of that widget **or** soft state update — avoid full RSC refresh when possible.
3. Keep `router.refresh()` for stage change, merge, archive, and true server-prop dependencies.
4. Strategy widget: refetch plans/detail only when strategy mutations succeed — not on every `refreshKey` from unrelated widgets.

### Phase B — Payload slimming — **OPEN**

1. Deals list: summary DTO (id, name, status, type, totals, participant count) without full participant trees.
2. Expand participants on deal edit / single-deal GET only.
3. Activity workspace: keep caps (300/300); consider content truncation for list rows.
4. Hierarchy: limit colleagues; paginate if needed.
5. Avoid legacy `client360Include` unbounded paths in any live route.

### Phase C — Auth / load once — **PARTIAL / OPEN**

1. Resolve access once per request (`canReadClientCore`, deal access) and pass down — stop repeated checks on page load.
2. Align Client 360 APIs with Bearer+session (see §12) so `authenticatedFetch` is consistent.

### Phase D — UX polish — **OPEN**

1. Skeleton loaders for Client 360 (docs: currently pulse placeholders only).
2. Dynamic-import `DealEditModal` from `DealInfoWidget`.

**Key files:** `lib/client360.ts`, `src/app/clients/[id]/page.tsx`, `Client360PageClient.tsx`, `DealInfoWidget.tsx`, `WorkspacePanel.tsx`, `ClientStrategyBuilderWidget.tsx`.

---

## 7. Lead Command Center refactor plan

**Current (docs):** Compact inbox, attention scoring, filters, preview drawer, bulk actions; lib `leadCommandCenter.ts`.

### Done — Split inbox vs preview payloads

1. Slim `LeadCommandCenterRow` for `GET /api/admin/leads` (no full `sources[]`, activity summary, tags, expectations/role).
2. Cap inbox source sample; use `_count` for `sourceRecordCount`; light activity timestamps for attention only.
3. `GET /api/admin/leads/[id]/preview` returns `LeadCommandCenterPreview`; drawer loads on open with loading/error/retry.
4. Merge selected loads preview details per selected id before opening `MergeClientsModal`.

### Phase A — Stop load-all-then-slice — **OPEN**

1. Apply Prisma `take`/`skip` (or cursor) to the primary client query for the default inbox path.
2. Document which post-filters (`needsAttention`, dup flags, latest-source) break pure SQL pagination — migrate those filters to indexed columns or computed fields over time.
3. Cap nested includes (e.g. sourceRecords: latest N only). ✅ (inbox sample + preview full history)

**Partial (offset UX):** default `limit=50`, response `meta.total` / `hasMore`, UI Load more + debounce/abort. Cursor / true DB pagination still blocked by post-filters (**load-all-then-slice remains**).

### Phase B — Duplicate detection — **OPEN**

1. Remove full-table `loadDuplicateClientIds` from every **list and preview** request.
2. Options (pick one):
   - Short TTL in-memory/Redis/unstable_cache of duplicate client ID set
   - Precomputed `hasDuplicateContact` flag maintained on ingest/merge
   - Dup panel only hits dedicated duplicates API (already exists)
3. Keep `npm run find:duplicate-clients` / smoke tests green.

### Phase C — API & UI

1. Lower default `DEFAULT_LIMIT` only if UX accepts it; prefer true server pagination with total count strategy.
2. Split `LeadCommandCenterPage` (~1.7k LOC) into list / filters / drawer / bulk modules.
3. Ensure bulk endpoints remain transactional and permissioned (super admin).

**Key files:** `lib/leadCommandCenter.ts`, `lib/leadDuplicates.ts`, `src/app/api/admin/leads/**`, `LeadCommandCenterPage.tsx`, `LeadPreviewDrawer.tsx`.

---

## 8. Strategy Planner refactor plan

**Product constraints (do not break):** Timeline economics are planning arithmetic only; suggestions require advisor **Use suggested values**; backend never overwrites saved milestones; Overview is read-only.

### Phase A — Bundle / render — **MOSTLY SHIPPED**

1. Dynamic-import `StrategyPlanDetailView`, large modals (`StrategyProjectionMilestoneEditModal`, step/expense modals). ✅ (`WorkspacePanel` → Builder; Builder → DetailView; DetailView → Board/Projection + modals; milestone edit values extracted so modal chunk is not eagerly pulled)
2. Lazy-load Board vs List vs Projection by active view preference (not all three heavy trees at once). ✅ (conditional mount + dynamic chunks + skeletons)
3. Cap strategy refetch: only on strategy mutations and plan switch. — **still open** when Client 360 full refresh fires

### Phase B — API DTOs (fat DTO) — **OPEN**

1. Introduce view-specific loaders:
   - **List:** steps summary + economics fields needed for list cards
   - **Board:** steps, connections, expenses (current board needs)
   - **Projection:** milestones + source links + suggestion inputs
   - **Overview:** reuse `clientStrategyReportHelpers` from existing detail or a report-shaped select
2. Keep write APIs validating via `clientStrategyValidation.ts` unchanged in behavior.

### Phase C — Code structure — **OPEN**

1. Split `StrategyPlanDetailView` into container + Board/List/Projection tabs.
2. Extract shared display formatting (`strategyTimelineEconomicsDisplay`, `formatMoney`) — already partially done.
3. Prefer pure helpers in `lib/clientStrategyTimelineCalculations.ts` / projection / report helpers for tests; keep UI thin.

### Phase D — Mobile

1. Board: touch-friendly scroll; avoid requiring hover-only actions.
2. Projection modal: sectioned accordion on small screens; `90dvh` max height.
3. Overview print path: verify iPad Safari print layout separately (browser print only).

**Key files:** `lib/clientStrategyPlans.ts`, `lib/clientStrategyReportHelpers.ts`, `lib/clientStrategyTimelineCalculations.ts`, `ClientStrategyBuilderWidget.tsx`, `StrategyPlannerBoard.tsx`, `StrategyPlanDetailView.tsx`, projection/step/expense modals, overview page/components.

---

## 9. Dashboard refactor plan

**Current (docs):** Per-widget APIs; shared `standardDashboardContext`; SQL deal aggregates; skeletons on standard dashboard; admin analytics cached 600s.

### Phase A — Quick wins — **OPEN** (architecture shipped; caps/dedupe not)

1. Deduplicate `/api/me/assignments` (page loads once; pass CLIENT/LEAD visibility into `ImportantDatesCalendarWidget`).
2. Add `take` to `buildDealParticipationWidget` and `buildOpenTasksWidget`.
3. Ensure all live widgets use shared context or aggregates — no accidental standalone full hydrates in hot paths.

### Phase B — Admin surfaces — **OPEN** (pipeline unbounded)

1. Master Pipeline: server-side status/search filters + cursor pagination; keep mobile grouped list / desktop kanban.
2. Optional: light skeleton loaders on admin KPI/funnel (docs gap).
3. Keep 600s cache; document lag; add on-demand revalidate only if product requires fresher KPIs.

### Phase C — Commission read models (deeper)

1. Evaluate materialized summary for secured commission / company earnings to avoid hydrating all WON deals on cold cache.
2. Continue participant-backed preferred path; legacy fallback until backfill complete.

### Phase D — Legacy cleanup

1. Mark or remove `GET /api/get-dashboard-data` and `GET /api/dashboard/standard` from production use; migrate tests to per-widget routes.
2. Do not revive monolith in UI.

**Key files:** `lib/standardDashboardWidgets.ts`, `lib/standardDashboardContext.ts`, `lib/dashboardDealAggregates.ts`, `lib/adminAnalyticsCache.ts`, `StandardUserDashboardPage`, admin dashboard + `MasterPipelineView`, `ImportantDatesCalendarWidget`.

---

## 10. iPad / Safari UX fixes

**Already shipped:** Global `-webkit-autofill` override in `globals.css` (dark text + inset box-shadow).

| Task | Detail |
|------|--------|
| Viewport units | Replace `100vh` / `90vh` with `dvh` on tall modals (`DealEditModal`, merge, details, LCC bulk, strategy modals already partially on `dvh`) |
| Input color | Audit inputs that set custom `text-*` / transparent backgrounds for autofill conflicts; keep global override |
| Deal edit | `max-h-[calc(100dvh-2rem)]` (or equivalent); sticky footer actions on small screens |
| Strategy modals | Long forms: accordion sections; primary actions always visible |
| Client 360 | Workspace dropdown already mobile; ensure Strategy Planner inside tab doesn’t trap horizontal scroll of whole page |
| LCC | Preview drawer + bulk modals: single scroll owner; avoid nested `100vh` chains |
| QA matrix | iPadOS Safari + Chrome; portrait/landscape; Compact vs Comfortable density |

Reference modal pattern in DATABASE_AND_UI_REFERENCE §15 — update pattern text to prefer `dvh` when implementing.

---

## 11. Background job refactor plan

### Shipped — durability (code)

| Item | Status |
|------|--------|
| `BackgroundJob` table + `BackgroundJobStatus` | ✅ `20260721030000_add_background_jobs` |
| Enqueue on assignment change (`RECALCULATE_RETURNABLES_FOR_USER_CLIENT`) | ✅ `scheduleReturnableRecalculation` → `enqueueReturnableRecalculationJob` |
| PENDING dedupe for same user/client | ✅ |
| Best-effort in-process `processBackgroundJobs` after enqueue | ✅ |
| Retry with backoff / `maxAttempts` / `FAILED` + `lastError` | ✅ `lib/backgroundJobs.ts` |
| Sync compat path | ✅ `POST /api/tasks/recalculate-returnables` |
| Manual / cron entrypoints | ✅ `npm run jobs:process`, `POST /api/tasks/process-background-jobs` |

**Do not describe returnable recalc as fire-and-forget-only anymore.** That language is stale relative to current code and the UI reference.

### Still open — ops / observability

1. **Production/staging processor:** ensure a cron, Vercel scheduled function, or ops runbook actually calls `jobs:process` / process-background-jobs so PENDING jobs do not sit if the request process dies before best-effort process.
2. Structured log / admin visibility for FAILED jobs (optional counter).
3. Bulk-assign: confirm one job per user-client pair remains bounded under load.
4. Keep bulk recalc script for repairs: `npx tsx scripts/recalculate-commission-returnables.ts`.

**Key files:** `lib/backgroundJobs.ts`, `scheduleReturnableRecalculation` call sites, `POST /api/tasks/process-background-jobs`, `POST /api/tasks/recalculate-returnables`.

---

## 12. Auth normalization plan

**Current:** Low-risk Client 360 / dashboard routes have progressed toward Bearer **or** session via `getAuthenticatedUserFromRequest` (see recent auth helper work). Treat remaining session-only or duplicate access checks as follow-ups — not as “jobs are fire-and-forget.”

### Phase A — Inventory

1. List every route using `getAuthenticatedUser()` vs `getAuthenticatedUserFromRequest()`.
2. Confirm all client `fetch` helpers send `credentials: 'same-origin'` and optional Bearer.

### Phase B — Unify remaining Client 360 mutations

1. Finish any remaining session-only Client 360 routes → Bearer **or** session fallback.
2. Keep ACTIVE checks and role gates identical.
3. Update `test:deal-participant-api` / strategy / important-dates tests for both auth modes where valuable.

### Phase C — Request-scoped access cache

1. Single resolver per request for `canReadClientCore` + `getDealAccessForClient` to cut duplicate queries.
2. Super-admin bypass remains; avoid loading all deal IDs when not needed (slim `getDealAccessForClient` for list views).

### Phase D — Cleanup

1. NextAuth placeholder route: remove or clearly dead-code when safe.
2. Middleware: docs note `/admin/*` session-only at edge — consider role check hardening separately (security, not only perf).

**Key files:** `lib/authHelpers.ts`, Client 360 API routes under `src/app/api/clients/**`, `authenticatedFetch` helpers.

---

## 13. Testing plan

### Baseline (before each phase)

```bash
PERF_LOGGING_ENABLED=true npm run dev
npx tsx scripts/profile-api-routes.ts
# Capture: LCC list, LCC preview, pipeline, Client 360 load + post-mutation refresh,
# dashboard widgets, strategy plan GET, search, important-dates-calendar
```

### Automated suites to keep green

| Suite | Command |
|-------|---------|
| Client access | `npm run test:client-access` |
| Strategy | `npm run test:client-strategy`, `test:strategy-projection`, `test:strategy-timeline`, `test:strategy-report` |
| LCC | `npx tsx scripts/test-lead-command-center.ts` |
| Merge | `npm run test:merge-custom-fields` |
| Important dates | `npm run test:important-dates`, `test:important-dates-calendar` |
| Deals / returnables | `npm run test:deal-participants`, `test:deal-participant-api`, `test:deal-returnables` |
| Full | `npm run test:all` (unit + integration; no Next server). HTTP: `npm run test:all:with-http` after `npm run dev` |
| Typecheck / build | `npx tsc --noEmit`, `npm run build` |

### New / extended tests (as phases land)

| Change | Test |
|--------|------|
| LCC pagination | Assert SQL limit behavior; smoke test pagination + filters |
| Dup cache | Badges still correct vs `find:duplicate-clients` / duplicates API |
| Client 360 refresh scopes | Component or integration: details save does not refetch strategy |
| Auth unification | Same route succeeds with session cookie and with Bearer+cookie |
| Returnable jobs | Queue: retry on failure; idempotent second run; ops processor drains PENDING |
| Modal `dvh` | Manual iPad checklist (no browser E2E required initially) |

### Manual QA checklist

- [ ] Standard dashboard widgets load independently; calendar dates correct for CLIENT/LEAD
- [ ] Admin KPIs within 10 min cache expectation; pipeline paginates/filters
- [ ] LCC inbox, search, filters, preview, bulk, merge, duplicates panel
- [ ] Client 360: stage, details, deals, team, hierarchy, workspace tabs
- [ ] Strategy: Board / List / Projection / Overview; suggestions still click-to-apply
- [ ] iPad Safari: login autofill, Deal Edit, Strategy milestone modal, LCC drawer
- [ ] Assignment change eventually updates returnables (BackgroundJob + processor)

---

## 14. Step-by-step implementation checklist

Prefer **§3 Next Sprint Hot Paths** for the immediate sprint. Waves below remain the longer roadmap; checkboxes reflect July 21 verification.

### Wave 0 — Measure

- [ ] Enable `PERF_LOGGING_ENABLED` on staging/local; record baseline timings for LCC, pipeline, Client 360, widgets, strategy GET
- [ ] Note production DB size (#clients, #deals, #WON deals, #source records)
- [ ] After next sprint: replace June 24 timings in UI reference (do not invent numbers in this plan)

### Wave 1 — Indexes & query caps (low risk)

- [x] Migration: `ClientAssignment(clientId)` (+ composites) — **phase 3 shipped**
- [x] Migration: `Client(status)` (and composites) — **phase 3 shipped**
- [x] Migration: `Notification(recipientUserId, isRead, …)` — **phase 3 shipped**
- [x] Migration: `Client(company)`, `Task(clientId)`, `ClientDocument(clientId)`, source/participant composites + `pg_trgm` — **phase 3 shipped**
- [ ] Cap deal-participation and open-tasks queries with `take` — **OPEN**
- [ ] Cap hierarchy colleagues with `take` — **OPEN**
- [ ] Deduplicate dashboard `/api/me/assignments` — **OPEN**

### Wave 2 — Mobile viewport & code-splitting (low risk)

- [ ] Convert tall modals from `vh` → `dvh` (Deal Edit first)
- [x] `next/dynamic` for Strategy Plan detail / Board / Projection / heavy strategy modals — **shipped**
- [ ] `next/dynamic` for `DealEditModal` — **OPEN**
- [x] Lazy Strategy Board/List/Projection by active view — **shipped**

### Wave 3 — Client 360 refresh & payloads (medium risk)

- [ ] Scoped refresh API in `Client360PageClient` — **OPEN**
- [ ] Stop strategy refetch on unrelated mutations — **OPEN**
- [ ] Slim deals list DTO; lazy-load full participants — **OPEN**
- [ ] Request-scoped access resolution on Client 360 page — **OPEN**
- [ ] Optional Client 360 skeletons — **OPEN**

### Wave 4 — Lead Command Center (medium–high risk)

- [ ] DB-level `take`/`skip` on primary list path — **OPEN** (offset UX only today)
- [ ] Remove per-request full-table dup scan (list **and** preview); cache or precompute — **OPEN**
- [x] Narrow sourceRecords include (inbox sample) — **shipped**
- [ ] Split LCC page components — **OPEN**
- [ ] Extend LCC smoke tests for pagination — **OPEN**

### Wave 5 — Admin pipeline & dashboard depth (medium–high risk)

- [ ] Pipeline server filters + cursor/limit — **OPEN**
- [ ] Admin skeleton polish (optional)
- [ ] Plan commission summary/read-model spike (design only → implement if approved)

### Wave 6 — Strategy Planner maintainability (medium risk)

- [ ] View-specific plan selects (fat DTO) — **OPEN**
- [ ] Split `StrategyPlanDetailView` modules — **OPEN**
- [ ] Mobile accordion / board scroll fixes
- [ ] Keep all strategy unit/integration tests green

### Wave 7 — Auth normalization (medium risk)

- [ ] Finish remaining Client 360 session-only routes / inventory — **PARTIAL**
- [ ] Slim/`cache` deal access helpers — **OPEN**
- [ ] Update auth-sensitive tests

### Wave 8 — Background jobs

- [x] Durable queue + enqueue + retries/backoff — **SHIPPED**
- [x] Sync recalculate route retained for compat — **SHIPPED**
- [ ] Logging + FAILED visibility (ops polish) — **OPEN**
- [ ] Cron / scheduled `jobs:process` in staging + production — **OPEN (ops gap)**
- [ ] Bulk-assign job batching review under load — **OPEN**
- [ ] Runbook: replay failed returnable jobs — **OPEN**

### Wave 9 — Legacy retirement (after deps cleared)

- [ ] Deprecate legacy dashboard monolith routes
- [ ] Plan retirement of Prisma `Strategy` / `Document` if unused
- [ ] Update `DATABASE_AND_UI_REFERENCE.md` shipped/performance tables + known limitations (incl. `loadClient360PageData` wording + timing re-baseline)

---

## 15. Risk level for each task

| ID | Task | Risk | Notes |
|----|------|------|-------|
| W1.1–W1.4 | Phase 1–3 indexes | **Done** | Additive migrations already applied |
| W1.5 | Widget `take` caps | **Low** | Confirm UI still shows enough rows |
| W1.6 | Dedupe assignments fetch | **Low** | Calendar filter regression risk small |
| W2.1 | `vh` → `dvh` | **Low** | Visual QA on iPad |
| W2.2 | Dynamic imports (Deal Edit) | **Low** | Loading flash; Suspense fallbacks |
| W3.1 | Scoped Client 360 refresh | **Medium** | Stale server props if scope wrong |
| W3.2 | Slim deals payload | **Medium** | Deal Info / edit must still get participants when needed |
| W3.3 | Access resolve-once | **Low–Medium** | Permission bugs if cache too broad |
| W4.1 | LCC SQL pagination | **Medium–High** | Post-filters can drop page fullness; UX count mismatch |
| W4.2 | Dup scan removal/cache | **Medium** | Stale duplicate badges |
| W5.1 | Pipeline pagination | **Medium** | Kanban empty columns / drag assumptions |
| W5.2 | Commission read models | **High** | Formula drift vs live calc |
| W6.1 | Strategy view DTOs | **Medium** | Missing fields break Board/Projection |
| W6.2 | Split Strategy components | **Medium** | Regression in planner UX |
| W7.1 | Auth Bearer+session unify | **Medium** | Accidental auth bypass if helper misused |
| W8.1 | Returnable queue code | **Done** | Durability shipped |
| W8.2 | Jobs processor ops/cron | **High** (ops) | PENDING backlog if no processor |
| W9.1 | Remove legacy routes/models | **High** | Hidden consumers / scripts |

**Risk legend:** Low = additive/reversible · Medium = behavior change needing careful QA · High = money, auth, or data-loss adjacent.

---

## 16. Rollback notes

| Change type | Rollback approach |
|-------------|-------------------|
| **Additive indexes** | Safe to leave in place; to drop, new migration `DROP INDEX` only if proven harmful (rare). Prefer keep. |
| **Query `take` caps** | Revert PR; temporarily raise limits via constant |
| **`dvh` / dynamic import** | Revert CSS/class and import style; no data impact |
| **Scoped Client 360 refresh** | Feature-flag or restore `triggerDataRefresh` → always `router.refresh()` + full `refreshKey` |
| **Slim deals DTO** | Restore `dealResponseSelect` full include; clients tolerate richer payload |
| **LCC pagination** | Feature flag `LCC_SQL_PAGINATION=false` falling back to prior load-all path (keep fallback ≤1 release) |
| **Dup cache** | Disable cache; accept slower correct scan; or serve badges from duplicates API only |
| **Pipeline cursor API** | Keep old unbounded endpoint temporarily as `/pipeline?mode=legacy` for hotfix, then remove |
| **Auth helper migration** | Revert route to prior helper; ensure cookies still sent |
| **Returnable BackgroundJob** | Keep table; process backlog with `jobs:process` / sync recalculate route / `recalculate-commission-returnables.ts`. Do **not** reintroduce fire-and-forget-only as the primary design. |
| **Commission read models** | Serve from live hydrate path; invalidate cache keys |
| **Legacy route removal** | Restore route files from git; keep tests pointing at restored paths |

**Release practice:**

1. Ship remaining Wave 1 query caps + Next Sprint items behind normal `deploy` with migrate deploy on Vercel build.
2. For Wave 3–5, prefer feature flags or dual-read for one release.
3. Never force-push `deploy`; revert with forward-fix commits.
4. After each wave: update this plan checkboxes + `DATABASE_AND_UI_REFERENCE.md` performance / known-limitations rows.

**Data safety:** No refactor in this plan should rewrite deal amounts, milestone saved values, or merge history. Returnable jobs must remain idempotent and must not overwrite **paid** returnable rows (existing rule).

---

## Appendix A — Priority map (audit → waves / next sprint)

| Audit theme | Where |
|-------------|--------|
| Phase 1–3 indexes | **Shipped** (W1 migrations) |
| BackgroundJob durability | **Shipped** (W8 code); ops cron still open |
| Dashboard over-fetch / duplicate assignments | Next sprint #3 / W1 remaining |
| Modal `dvh` + DealEdit dynamic import | W2 remaining |
| Client 360 `router.refresh` fan-out + deals DTO | Next sprint #2 / W3 |
| LCC load-all + dup scan (list/preview) | Next sprint #1 / W4 |
| Admin pipeline all-data | Next sprint #4 / W5 |
| Strategy fat DTO | Next sprint (after #1–4) / W6 |
| Mixed auth patterns | W7 |
| Jobs processor ops | Next sprint #5 / W8 remaining |
| Timing re-baseline | Next sprint #6 |
| Legacy paths | W9 |

## Appendix B — Related documents

- `docs/DATABASE_AND_UI_REFERENCE.md` — schema, APIs, permissions, performance architecture, known limitations
- `docs/deal-participant-migration.md` — participant backfill (commission correctness before aggressive read models)
- `docs/USER_MANUAL_*.md` — end-user behavior to preserve during UX changes
- Final CRM performance review (July 21, 2026) — source of truth for shipped vs open in this update

---

*This plan does not modify application code by itself. Implement only after explicit approval per wave / next-sprint item.*
