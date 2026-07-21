# CRM Performance & Maintainability Refactor Plan

> **Purpose:** Prioritized plan to improve CRM speed, maintainability, and mobile/iPad reliability without changing product rules.  
> **Sources of truth:** `docs/DATABASE_AND_UI_REFERENCE.md` + codebase audit + **final performance review (July 21, 2026)**.  
> **Scope of this document:** Planning for **remaining** work. Shipped items are marked explicitly so they are not re-queued.  
> **Deployment branch:** `deploy`  
> **Measurement:** `PERF_LOGGING_ENABLED=true` + `npx tsx scripts/profile-api-routes.ts` (default `http://localhost:3001`; see script header for auth + hot-path coverage). Dashboard Home fan-out: Network panel + `npm run probe:dashboard-shell` (see UI reference → Measuring workspace shell loads).  
> **Timings caveat:** Published hot-path timings in the UI reference are from **July 21, 2026** (API microbenches). The sidebar/workspace layout revamp **changes initial `/dashboard` and `/admin` Home fan-out** — re-measure Home first paint; do **not** invent page-paint numbers in this plan.

**Last updated:** July 21, 2026 (Dashboard **Phase E** sidebar/workspace layout — active-module loading; Phase 4 Client 360 closed; 4C–3B)

---

## Table of contents

1. [Refactor goals](#1-refactor-goals)
2. [Current bottlenecks](#2-current-bottlenecks)
3. [Next Sprint Hot Paths](#3-next-sprint-hot-paths)
4. [Route-level performance concerns](#4-route-level-performance-concerns)
5. [Database / index concerns](#5-database--index-concerns)
6. [Client 360 refactor plan](#6-client-360-refactor-plan) (incl. [Phase 2H audit](#phase-2h--client-360-authaccesslookup-audit-read-only))
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
| **Bounded dashboard queries** | Widgets use `take` / shared context; no duplicate `/api/me/assignments` on standard Home |
| **Reduced dashboard Home fan-out** | ✅ **Shipped (UI/loading boundary):** only the active workspace module mounts/fetches; Home is light |
| **Predictable mobile UX** | Tall modals use `dvh`; Safari autofill remains readable; Strategy Planner usable on iPad |
| **Reliable side effects** | ✅ **Shipped (code):** durable `BackgroundJob` enqueue + retries/backoff + stuck-RUNNING reclaim. **Ops:** set `CRON_SECRET` + schedule processor — see [`BACKGROUND_JOBS_OPS.md`](./BACKGROUND_JOBS_OPS.md) |
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
| **Dashboard architecture** | ✅ Partial ship → **Phase E layout shipped** | Per-widget APIs + skeletons; shared context for legacy monolith; SQL deal aggregates; admin `unstable_cache` 600s; **sidebar + `?view=` active-module shells** (`WorkspaceShell`) |
| **Dashboard sidebar / workspace layout (Phase E)** | ✅ Shipped | Standard + admin `WorkspaceShell`; mobile off-canvas sidebar; inactive modules do not mount; existing APIs reused; no auth/API shape/DB/commission changes |
| **LCC inbox vs preview split** | ✅ Shipped | Slim inbox row; on-open preview API |
| **Strategy code-splitting** | ✅ Partial ship | `next/dynamic` Board/Projection/modals; conditional view mount |
| **Global search** | ✅ Shipped | Ranked slim `searchClients` (no full dup/activity scan) |
| **Important Dates calendar API** | ✅ Partial ship | Dedicated widget API + event `take` cap |
| **`[perf]` instrumentation** | ✅ Shipped | `lib/performance.ts` + payload category warns |

> **Doc mismatch (not inventing a fix here):** UI reference still says Client 360 loads via `loadClient360PageData()`. Live page loads core then `Promise.all([deals, hierarchy])` via the individual loaders; `loadClient360PageData` exists in `lib/client360.ts` but is unused by the page. Update the UI reference when convenient.

### Still open (final review)

| Area | Bottleneck | Primary symbols |
|------|------------|-----------------|
| **Lead Command Center** | Default path: Prisma `skip`/`take` + `lastModified` order. Fallback still load-all for dup / needsAttention / latest-source. Dup flags: candidate peer lookup (not full-table) | `fetchLeadCommandCenterPage`, `loadDuplicateClientIdsForCandidates` |
| **Lead preview** | Preview API is separate (good), but still runs **full dup scan** on open | `fetchLeadCommandCenterPreview` |
| **Master Pipeline** | ✅ Partial: default **50/status** + server filters + honest `meta`; legacy unbounded via `mode=legacy` / `ADMIN_PIPELINE_LEGACY`. Still open: cursor / load-more per column | `GET /api/admin/pipeline`, `fetchAdminPipelinePage`, `MasterPipelineView` |
| **Client 360 refresh** | Typed slice keys + `refreshClient360Slices`; details skip workspace; stage/merge/archive/team still `all` | `client360Refresh.tsx`, `Client360PageClient` |
| **Client 360 deals** | Slim list (`DealListItem`, no notes); full detail on `GET …/deals/[dealId]` | `listClientDealsForClient360`, `getClientDealDetail` |
| **Admin / dashboard commission** | Hydrate WON deals + participants (cached 10 min for admin; per-request for standard context) | `adminAnalyticsCache`, `fetchWonDealsWithParticipants*`, `standardDashboardContext` |
| **Dashboard widgets** | Per-widget `take` (20) when a module is open. Home no longer mounts all widgets. Still open: cold-cache WON-deal hydrate cost on commission/admin analytics when those modules open | `buildOpenTasksWidget`, `buildDealParticipationWidget`, `StandardUserDashboardPage`, `SuperAdminDashboardPage` |
| **Dashboard Home rebaseline** | Layout revamp deferred widget/pipeline/chart APIs off Home; July 21 route table does not equal Home first-paint fan-out | Network + `probe:dashboard-shell`; UI reference measuring section |
| **Strategy Planner** | Detail GET narrowed (Phase 2E); still one full detail DTO for Board/List/Projection; mega-components remain | `loadStrategyPlanDetail`, `StrategyPlanDetailView`, `StrategyPlannerBoard` |
| **Background jobs (ops)** | ✅ Runbook shipped (`docs/BACKGROUND_JOBS_OPS.md`); each env must still enable cron/`jobs:process` | ops / cron / runbook |
| **Legacy paths** | Old dashboard monolith routes; `Strategy`/`Document` models | Docs known limitations |

---

## 3. Next Sprint Hot Paths

Ordered by leverage (final performance review). No new measurements invented — success = `[perf]` / payload improvements vs current baselines after implementation.

| Order | Task | Outcome |
|-------|------|---------|
| **1** | **LCC duplicate optimization + SQL pagination preparation** | ✅ Phase 1: candidate peer lookup. ✅ Phase A (partial): Prisma `skip`/`take` + `lastModified` order when post-filters idle; fallback path for dup/needsAttention/latest-source. Still open: precompute attention/dup flags for full SQL path |
| **2** | **Client 360 scoped refresh + deal summary DTO** | ✅ Slice refresh controller + details save. ✅ Phase 2A: stage + team use `core`/`team` (no RSC). Still open: deal summary DTO; merge/archive stay on `all` |
| **3** | **Dashboard `take` + assignment dedupe** | ✅ DB `take` on open-tasks / deal-participation (20). ✅ Standard dashboard passes assignment bootstrap into Important Dates calendar / add-date modal |
| **4** | **Admin pipeline bounded API** | ✅ Partial: per-status `take` (50) + `status`/`assignedUserId` server filters + `meta` (`total`, `returned`, `hasMore`, `perStatusCounts`). Still open: cursor / load-more |
| **5** | **Jobs processing ops** | ✅ Runbook + `jobs:status` / `jobs:process:once` + hardened `CRON_SECRET` auth + stuck RUNNING reclaim. **Still open:** enable cron in each deployed env |
| **6** | **Re-baseline timings** | ✅ Phase 2B–2N Client 360 recorded. Still open: dealful deals list; **Home `/dashboard` + `/admin` first-paint API fan-out** after layout Phase E (Network + `probe:dashboard-shell`; no invented numbers) |

---

## 4. Route-level performance concerns

Use `PERF_LOGGING_ENABLED=true` and extend `[perf]` tags where missing (Client 360 RSC, LCC, pipeline, strategy plan GET).

| Route / surface | Concern | Target direction |
|-----------------|---------|------------------|
| `GET /api/admin/leads` | Default inbox DB-paginated (`skip`/`take`); post-filters still load-all | Persist attention/dup/latest-source for full SQL path; cursor later |
| `GET /api/admin/leads/[id]/preview` | Dup scan on open; Phase 2B: **`preview:baseQuery`** dominates (~0.6–0.8s) → Phase 2D: contacts folded into base select; preview dups use peer `findFirst` (inbox batch path unchanged) | Further slim baseQuery; auth/JWT cache; optional TTL for preview dup flags |
| `GET /api/admin/leads/duplicates` | Heavy email/phone grouping | Dedicated query + indexes; optional TTL cache |
| `GET /api/admin/pipeline` | Default bounded (50/status); legacy unbounded still available | Cursor / load-more per column; remove legacy path |
| Client 360 RSC (`/clients/[id]`) | Full core+deals+hierarchy on every `router.refresh` | ✅ Phase 2A: stage/team skip RSC; merge/archive still full refresh |
| `GET /api/clients/[id]` (core) | Phase 2B: **`core:query`** ~0.9s on ~1.6KB → Phase 2C: narrow `client360CoreQuerySelect` (~0.6–0.7s query on same sample) | Further: cheaper auth; optional split dates/contacts to lazy widgets |
| `GET /api/clients/[id]/employees` | Phase 2B: auth + clientLookup + query each ~0.2–0.4s → Phase 2F: **`clientLookup` removed**; one combined SQL for target+colleagues (~0.22–0.26s query). Auth still ~0.3s | Cheaper auth/JWT cache |
| `GET /api/clients/[id]/deals` | Phase 2B: auth+access often ≥ query on empty list → Phase 2G: `canViewClientDeals` (admin access ≈0); `clientLookup` only if empty+admin; already-narrow `dealListResponseSelect`. **Dealful profile SKIPPED** (0 deals in audit DB) | Re-measure with seeded/dealful client; optional further participant field trim |
| `GET /api/clients/[id]/strategy-plans/[planId]` | Phase 2E: narrow plan base select + parallel timed relations (`steps`/`connections`/`expenses`/`projectionMilestones`); ~0.8s server / ~1.4–1.8s client on small sample. Residual = pooler RTT per query | Further view-specific DTOs (board vs list vs projection/overview); optional contribution lazy-load |
| `GET /api/dashboard/widgets/*` | Called when the matching **workspace module** is active (`?view=`), not on Home. Some widgets still hydrate large deal graphs when opened | Prefer SQL aggregates; keep DB `take` on list widgets |
| `GET /api/me/assignments` | Standard Home / shell light fetch (nav flags + count); calendar module reuses bootstrap when opened | Keep single shell fetch; do not reintroduce all-widget mount on Home |
| Admin funnel/KPIs/leaderboards | Opened via `/admin?view=analytics|revenue|leaderboards` (not Home). Cold miss hydrates WON deals | Keep cache; Home stays KPI snapshot only |
| `GET /api/admin/all-commission-returnable` | Full reconciliation list on `/admin/reconciliation` (~220–250 ms warm, June 24 doc) | Pagination + filters server-side |
| Activity feed APIs | Assignment-scoped correlated SQL — OK at moderate scale; mounted on activity `?view=` only | Monitor; ensure LIMIT always applied |
| Legacy `GET /api/dashboard/standard`, `GET /api/get-dashboard-data` | Compat/tests only; risk of accidental use | Deprecate gate or remove after test migration |

**Already healthy (do not regress):**

- Per-widget dashboard endpoints + skeleton loaders
- **Active workspace module only** mounts/fetches (sidebar / `?view=`); Home light shell
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

### Phase A — Refresh narrowing (high impact, medium risk) — **PARTIAL**

1. ✅ Typed `refreshClient360Slices` + per-slice keys via `Client360RefreshProvider`.
2. ✅ Details save → `['core','importantDates']` (+ `hierarchy` when company/employeeCount change); **no** `router.refresh`. Important Dates CRUD → `['importantDates']` only.
3. ✅ `router.refresh()` only for `all` (stage, merge, archive, team still use `all`).
4. Strategy widget: still independent of workspace slice — **OPEN** for further isolation.
5. Still open: migrate team → `['core','team']` (client-fetch assignments, no workspace); stage → `['core','workspace']`.

### Phase B — Payload slimming — **PARTIAL**

1. ✅ Deals list: `DealListItem` via `listClientDealsForClient360` / `GET …/deals` (no participant `notes`/`dealId`); full tree on `GET …/deals/[dealId]` for edit.
2. Still open: further drop list participant trees to count/preview-only; expand-on-demand for card split UI.
3. Activity workspace: keep caps (300/300); consider content truncation for list rows.
4. Hierarchy: limit colleagues; paginate if needed.
5. Avoid legacy `client360Include` unbounded paths in any live route.

### Phase C — Auth / load once — **PARTIAL / OPEN**

1. Resolve access once per request (`canReadClientCore`, deal access) and pass down — stop repeated checks on page load.
2. Align Client 360 APIs with Bearer+session (see §12) so `authenticatedFetch` is consistent.

### Phase D — UX polish — **OPEN**

1. Skeleton loaders for Client 360 (docs: currently pulse placeholders only).
2. Dynamic-import `DealEditModal` from `DealInfoWidget`.

### Phase 2H — Client 360 auth/access/lookup audit (read-only)

> **Status:** ✅ Documented July 21, 2026. **No runtime changes in this phase.**  
> **Goal:** Map duplicated auth, access, `getClientOr404`, and company/client metadata loads across Client 360 APIs so Phase 2I can consolidate safely.  
> **Profiler numbers** cite UI reference §1 Phase 2B–2G (same sample client `cmqv35szi0000jp04jaejps9j` unless noted). RTTs below are **Prisma round-trips after** the shared User auth read (Bearer/session).

#### Access helper families (do not conflate)

| Family | Helpers | SUPER_ADMIN DB | STANDARD_USER DB | Who can view |
|--------|---------|----------------|------------------|--------------|
| **Core / strategy view / important-dates** | `canReadClientCore`, `canViewClientStrategy`, `requireClientCoreReadAccess` | 0 | assignment `findFirst`; else any deal participant | Assignment **or** any deal participant |
| **Hierarchy / workspace / source-records** | `canAccessClientHierarchy`, `requireSuperAdminOrClientAccess` | 0 | any assignment | Assignment only (**not** deal-only) |
| **Deals list view** | `canViewClientDeals` (Phase 2G) | 0 | DEAL_VIEW roles assignment; else DOCTOR participant | Role-filtered assignment **or** DOCTOR participant |
| **Deals manage / picker** | `getDealAccessForClient`, `requireDealViewAccess` | **1×** `deal.findMany` all ids | assignments `findMany` + DOCTOR participants `findMany` | Full manage flags + `manageableDealIds` |
| **Details / follow-up edit** | `authorizeClientDetailsEdit` | 0 | RELATIONSHIP assignment | RELATIONSHIP or admin |

#### Route matrix (GET hot paths + key satellites)

| Route | Auth | Access | Separate client lookup? | Company / client metadata | Approx Prisma RTTs after User (admin / assigned) | PERF labels | 403 / 404 | Current bottleneck (profiler if known) | Consolidation opportunity | Risk |
|-------|------|--------|-------------------------|---------------------------|--------------------------------------------------|-------------|-----------|----------------------------------------|---------------------------|------|
| `GET /api/clients/[id]` | `getAuthenticatedUserFromRequest` | `canReadClientCore` | **No** — miss → 404 from main query | Main `client360CoreQuerySelect` (company, contacts, dates, assignments) | **1 / 2** (main / +assignment) | `client360:core:auth\|access\|query\|map` | **403 first**; then 404 | Warm: client ~961 ms · route ~617 ms · **query ~616 ms** · auth ~0.25–0.33s · access ≈0 (admin) | Auth JWT cache; optional lazy dates/contacts; memo assignment if page also loads deals/hierarchy | Low–med (core contract) |
| `GET /api/clients/[id]/employees` | same | `canAccessClientHierarchy` | **No** — Phase 2F combined SQL | Target `company` + `employee_count` inside hierarchy SQL | **1 / 2** | `client360:hierarchy:auth\|access\|query\|map` | **403 first**; then 404 | Warm: client ~531 ms · route ~253 ms · **query ~0.22–0.26s** · auth ~0.27–0.34s | Auth share with sibling widgets; keep combined SQL | Low |
| `GET /api/clients/[id]/deals` | same | `canViewClientDeals` | **Conditional** `getClientOr404` only if empty **and** SUPER_ADMIN | None (list DTO only) | **1–2 / 2** (admin empty adds lookup) | `client360:deals:auth\|access\|query\|map\|clientLookup?` + `client360:deals` | **403 first** | Empty: client ~841–955 ms · route ~480–644 ms · access ≈0 · query+lookup sequential | Dealful re-measure; fold admin empty existence into list query | Low |
| `GET /api/clients/[id]/deals/[dealId]` | `getAuthenticatedUserFromRequest` | **`canViewClientDeals`** (Phase 2I.2) | **Conditional:** only if deal miss **and** SUPER_ADMIN | `dealResponseSelect` | **1–2 / 2** | `client360:dealDetail:auth\|access\|query\|map\|clientLookup?` | 403 then client/deal 404 | Probe: access **≈0**; query ~348–406; payload **389** B | ✅ 2I.2: no admin deal-id findMany | Low |
| `GET /api/clients/[id]/deals/participant-users` | `getAuthenticatedUserFromRequest` | **`canAccessDealParticipantPicker`** (Phase 2I.2) | **No** | N/A — global ACTIVE users | **~1 / ~2** | `client360:participantUsers:auth\|access\|query\|map` | **403 only** | Warm: client ~496; access **≈0**; query ~242–339; payload **968** B | ✅ 2I.2: no admin deal-id findMany | Low |
| `GET /api/clients/[id]/strategy-plans` | **`resolveClient360Context`** (`strategy:view`) | `strategy:view` (Phase 2I.3 **403-first**) | **Conditional:** empty list + SUPER_ADMIN | Plan list select | **1–2 / 2** | `client360:strategyList:auth\|access\|query\|map\|clientLookup?` | **403 first**; then 404 | Warm (2I.3): client ~1095 · route ~417 · auth 226 · access ≈0 · query 415 · payload 750 B | ✅ 2I.3 + **2J** | Low |
| `GET /api/clients/[id]/strategy-plans/[planId]` | **`resolveClient360Context`** (`strategy:view`) | `strategy:view` (Phase 2I.3 **403-first**) | **Conditional:** plan miss + SUPER_ADMIN | Plan detail loader | **~2+ / ~3+** | `client360:strategyDetail:auth\|access\|baseQuery\|relations\|map\|clientLookup?` | **403 first**; then client/plan 404 | Warm (2I.3): client ~1512 · route ~828 · auth 227 · access ≈0 · baseQuery 397 · relations 430 · payload 2265 B | ✅ 2I.3 + **2J** | Low–med |
| `GET /api/clients/[id]/workspace` | **`resolveClient360Context`** (`workspace:view`) | assignment-only (Phase **3A**) | **No** — miss from tab select | Tab selects (tasks / activity) | **1 / 2** | `client360:workspace:auth\|access` + nested `auth:bearer:jwt` / `auth:userLookup` + `strategyTasks\|activityNotes:query\|map` | **403 first**; then 404 | Strategy-tasks: client ~641–871 · route ~409–561 · payload **53** B (empty); auth ~225–311 dominated by User RTT | ✅ Phase **2N** measure + **3A** context + request-local auth memo | Low |
| `GET /api/clients/[id]/source-records` | **`resolveClient360Context`** (`sourceRecords:view`) | assignment-only | **Conditional** via `ensureClientExistsForPrivilegedMiss` | Source rows only | **1–2 / 2** | `client360:sourceRecords:auth\|access\|query\|map\|clientLookup?` | 403 then 404 | Warm empty: client ~721–816 · query ~242–302 · clientLookup when empty+admin | ✅ 2I.1 + **2J** | Low |
| `GET /api/clients/[id]/important-dates` | `getAuthenticatedUserFromRequest` | `canReadClientCore` | **No** (Phase 2I.1) — folded into `listImportantDatesForOwner` | Dates + legacy JSON via loader Client read | **~2 / ~3** | `client360:importantDates:auth\|access\|query\|map` | 403 then 404 | Warm: client ~600–744 · query ~221–514 · **no clientLookup** | ✅ 2I.1 (not 2J — loader fold) | Low |
| Team assignments | **No GET** | Team embedded on **core** | — | Core `assignments` / `assignedUsers` | N/A | — | — | — | Keep; avoid new list GET | — |
| `PUT .../details`, `PATCH .../follow-up` | `authorizeClientDetailsEdit` | RELATIONSHIP / admin | **Yes** `getClientOr404` | Mutation payloads | Medium | None | 403 then 404 | Mutation path | Optional fold into update `where` | Low |
| `PATCH /api/clients/[id]` (stage/fields) | `getAuthenticatedUserFromRequest` | pipeline / admin after load | Inline `findUnique` **before** non-admin field gates | Full row | Higher | None | **404 before** some 403s | Stage mutations | Prefer 403-first for outsiders | Medium |
| Legacy `PUT .../strategy` | `requireSuperAdminOrClientRole([DOCTOR])` | DOCTOR assignment | **Yes** | `strategyText` | Mutation | None | 403 then 404 | Legacy | Prefer strategy-plans | Low (legacy) |
| **Excluded (adjacent)** `GET /api/admin/leads/[id]/preview` | `requireSuperAdminFromRequest` | admin-only | Via LCC loader | LCC preview select | Admin | `leadCommandCenter:preview:*` | Admin 404 | Warm ~1.3–1.4s client | Not Client 360 ACL — keep out of shared C360 context | — |

#### Duplicate patterns (cross-cutting)

1. **Auth** is already mostly unified (`getAuthenticatedUserFromRequest` / wrappers); User lookup is request-cached via React `cache` where used — residual cost is still ~0.25–0.35s pooler RTT on warm paths.
2. **Two access styles:** inline boolean + early 403 (core, hierarchy, deals list) vs `require*` + `{ error }` (workspace, strategy list, deal detail, important-dates).
3. **`getClientOr404` placement:**
   - **Folded / absent (good):** core GET, hierarchy GET, deals list (mostly), workspace GET, important-dates, strategy list/detail GET (Phase 2I.3).
   - **After access (safe):** deal detail (conditional), source-records (conditional), details/follow-up.
   - **Before access (existence leak):** strategy **manage/delete** wrappers still 404-before-403 (mutations; out of 2I.3 GET scope).
4. **Heavy manage access used for view:** ✅ Phase 2I.2 fixed deal detail + participant-users GETs. Manage/create mutations still use `getDealAccessForClient`.
5. **Double Client reads:** ✅ Phase 2I.1 fixed important-dates. ✅ Phase 2I.3 strategy list/detail: no pre-access lookup; conditional clientLookup only on empty list / plan miss + SUPER_ADMIN.
6. **PERF coverage uneven:** core / hierarchy / deals / strategy / important-dates / source-records labeled; remaining Client 360 tabs still uneven.

#### Proposed shared context shape (Phase 2I — not implemented)

```ts
type Client360RouteNeed =
  | 'core'
  | 'hierarchy'
  | 'dealsView'
  | 'dealsManage'
  | 'strategyView'
  | 'workspace' // assignment-only today
  | 'detailsEdit';

type Client360RequestContext = {
  user: { id: string; role: UserRole; name: string | null; email: string };
  clientId: string;
  /** Only true after a positive existence proof (main query hit or intentional lookup). */
  clientExists: boolean | 'unknown';
  flags: {
    canReadCore: boolean;
    canReadHierarchy: boolean;
    canViewDeals: boolean;
    canViewStrategy: boolean; // today === canReadCore
    canEditDetails: boolean;
  };
  /** Lazy — do not hydrate on list/view paths. */
  dealAccess?: DealAccessForClient;
  /** Memoized STANDARD_USER assignment roles to avoid repeat findFirst/findMany. */
  assignmentRoles?: AssignmentRole[];
};
```

**Resolver contract (recommended):** `resolveClient360Context(request, clientId, need)`:

1. Auth once.
2. Run the **minimal** access query for `need` (admin short-circuit with 0 DB).
3. **Never** `getClientOr404` before denying access when the product rule is hide-existence (match core/hierarchy/deals list).
4. Lazily call `getDealAccessForClient` only for `dealsManage` / picker.
5. Prefer main resource `findFirst({ clientId })` null → 404 after access OK.

#### Recommendations

**Safest opportunities (low risk, clear RTT win):**

1. **Important-dates GET** — drop redundant `getClientOr404`; use loader miss as 404.
2. **Source-records GET** — drop `getClientOr404` after assignment-gated access (empty list OK).
3. **Deal detail GET** — switch view gate to `canViewClientDeals`; remove `getClientOr404` when detail query is already scoped by `clientId` (404 on miss).

**Highest-impact opportunities (more RTTs / heavier helpers):**

1. **Stop admin `deal.findMany` (all ids)** on deal detail + participant-users view/picker gates (same class of win as Phase 2G list).
2. **Strategy list + plan detail** — 403-first + remove pre-access `getClientOr404` (also fixes existence leak; access currently ~229 ms on plan detail includes that lookup).
3. **Request-scoped context** on Client 360 RSC page so core + deals + hierarchy don’t each re-run assignment/participant checks (page load, not only single APIs).

**Avoid / defer for now:**

- Changing hierarchy vs core ACL (deal-only blocked from hierarchy/workspace by design).
- Broad rewrite of all `require*` helpers in one PR.
- Archive / merge / commission / returnable mutation paths.
- LCC preview (admin surface; separate ACL).
- Inventing dealful deals numbers until DB has deals.

#### Proposed consolidation order → **Phase 2I**

| Step | Target | Why first |
|------|--------|-----------|
| **2I.1** | Important-dates + source-records: remove redundant `getClientOr404` | ✅ **Shipped** — list GET: dates fold existence into `listImportantDatesForOwner`; source-records conditional lookup (empty + SUPER_ADMIN only) |
| **2I.2** | Deal detail (+ optional participant-users): `canViewClientDeals` for view; lazy manage access | ✅ **Shipped** — detail GET uses `canViewClientDeals`; picker uses `canAccessDealParticipantPicker`; manage/create still use `getDealAccessForClient` |
| **2I.3** | Strategy list + plan detail: 403-first; fold/remove pre-access client lookup | ✅ **Shipped** — view GET 403-first; conditional clientLookup for empty list / missing plan + SUPER_ADMIN |
| **2I.4 / Phase 2J** | `resolveClient360Context` + adopt on 2–3 hottest GETs | ✅ **Shipped (2J)** — narrow helper; migrated source-records + strategy list/detail GETs |
| **2I.5 / Phase 2K** | Client 360 RSC page: resolve-once for core/deals/hierarchy flags | ✅ **Shipped (2K)** — `resolveClient360PageAccess`; SUPER_ADMIN skips deal-id findMany |
| **Phase 2L** | Post-2K Client 360 fan-out profile + defer non-critical client fetches | ✅ **Shipped** — source-records GET deferred until SectionCard expand |
| **Phase 2M** | Stabilize Client 360 access/fetch contracts (tests + docs + layer comments) | ✅ **Shipped** — load-guard tests; checklist; context boundary comments |
| **Phase 2N** | Measure default workspace `strategy-tasks` tab; trim only unnecessary eager work | ✅ **Shipped** — measured; already first-paint-only; PERF labels; select left unchanged |
| **Phase 3A** | Measure/reduce auth/session overhead on Client 360 **read** routes (within-request only) | ✅ **Shipped** — inventory; Request WeakMap + nested PERF; assignment request-cache; workspace + projection-milestones on `resolveClient360Context`; no cross-request User cache |
| **Phase 3B** | Optimize the single authenticated **User** lookup (PK + transport) | ✅ **Shipped** — documented lookup; no new index (PK); DIRECT_URL auth client (`lib/authUserPrisma.ts`); valid-JWT+missing-User skips session; PERF transport meta |
| **Phase 3C** | Optimize Client 360 **read** access-check RTTs (assignment/participant) | ✅ **Shipped** — `lib/accessCheckPrisma.ts`; nested `access:assignment` / `access:dealParticipant` PERF; indexes already present; domain queries stay on pooler |
| **Phase 3D** | Decompose/optimize workspace strategy-tasks domain query | ✅ **Shipped** — parallel Client+Tasks+legacy Strategy; nested PERF; empty path 1 pooler RTT; response shape unchanged |
| **Phase 4A** | Full warm-path timing waterfall + residual floor | ✅ **Shipped** — `reqId` ALS + `strategyTasks:waterfall`; probe script; residual ≈0 (cost still DB-adjacent) |
| **Phase 4B** | Auth-only baseline vs full strategy-tasks route | ✅ **Shipped** — PERF-gated `/api/perf/client360-workspace-auth-only`; domain dominates (~66–87% of route) |
| **Phase 4C** | Domain direct-read risk analysis (no migration) | ✅ **Shipped (docs + measure script)** — hybrid direct scalar/legacy + pooler tasks saves **~0 ms**; **do not migrate** |
| **Phase 4 close** | Deliverables + acceptance criteria | ✅ **Closed** — waterfalls, auth-only, parallel-leg, serialize, direct-risk, latency floor documented; **no behavior change** |

**Phase 2L note:** RSC flags remain UI-only; API routes stay authoritative for auth. No aggregate endpoints added.

### Phase 3A — Auth/session overhead (Client 360 reads)

> **Status:** ✅ Shipped July 21, 2026.  
> **Goal:** Find avoidable **within-request** auth/session duplication on authenticated Client 360 read routes; reduce only where safe.  
> **Guardrails:** No cross-request auth/permission cache (admin analytics `unstable_cache` is unrelated). Preserve 403-first / existence-hiding. RSC flags ≠ API auth. Response shapes unchanged.
>
> **Before/after (workspace `strategy-tasks`, same sample):**  
> - Before (2N): client ~673 · auth ~225–311 · query ~421 · payload 53 B  
> - After (3A): client ~741 · auth ~237 (jwt ~1–5 + **userLookup ~230–300**) · query ~465 · payload 53 B  
> Auth wall time unchanged in kind (dominated by one User RTT). Nested PERF proves no double JWT/session inside the route.

#### Inventory (read routes)

| Route | Auth entry | Duplicate auth in one request? |
|-------|------------|--------------------------------|
| `GET …/workspace` | `resolveClient360Context` (`workspace:view`) | No — single auth |
| `GET …/source-records` | `resolveClient360Context` (`sourceRecords:view`) | No |
| `GET …/important-dates` | `getAuthenticatedUserFromRequest` | No |
| `GET …/strategy-plans` (+ `[planId]`) | `resolveClient360Context` (`strategy:view`) | No |
| `GET …/projection-milestones` | `resolveClient360Context` (`strategy:view`) | No (was `requireStrategyViewAccess`) |
| `GET …/` core, employees, deals, deal detail, participant-users | `getAuthenticatedUserFromRequest` once | No |
| Mutations / `requireStrategyManage*` | Own auth (final authority) | Out of scope |

**Finding:** Routes already called auth once. Cost (~225–311 ms on workspace) is **one** Bearer JWT verify + **one** `User` findUnique (remote pooler RTT), not repeated session/JWT work inside the same handler. React `cache()` already deduped token/session User reads when the framework request store applies.

#### Changes

1. **Request WeakMap** on `getAuthenticatedUserFromRequest` — same `Request` object → one resolution (works outside RSC too).
2. **Nested PERF:** `auth:bearer:jwt`, `auth:userLookup`, `auth:session:getSession` (under route `*:auth` when enabled).
3. **Static** `verifyAuthToken` import (drop per-call dynamic import).
4. **Request-scoped** `hasClientAssignment` / `hasDealParticipantOnClient` via React `cache`.
5. **`requireStrategy*Access(..., { user })`** — pass already-resolved user downward.
6. **Workspace + projection-milestones GET** → `resolveClient360Context`; capability `workspace:view` (same assignment gate as before).
7. **Tests:** `npm run test:auth-request-scope`.

**Not done (by design):** Cross-request User/JWT cache — no invalidation-aware pattern for auth (unlike admin KPI cache).

#### Rollback

Revert `lib/authHelpers.ts`, `lib/clientStrategyPermissions.ts`, `lib/client360RequestContext.ts`, workspace + projection-milestones routes, and `scripts/test-auth-request-scope.ts` / package script.

### Phase 3B — Optimize authenticated User lookup

> **Status:** ✅ Shipped July 21, 2026.  
> **Goal:** Reduce wall time of the **one required** User lookup without weakening ACTIVE/existence checks or adding cross-request auth cache.

#### Current lookup shape (unchanged semantics)

| Step | Detail |
|------|--------|
| **Bearer key** | JWT `payload.id` (= `sub`) → `User.id` PK |
| **Session key** | Supabase `session.user.id` → same `User.id` PK |
| **Not used** | email, org id, external auth id as lookup keys |
| **Query** | `findUnique({ where: { id }, select: authUserSelect })` — **no joins/includes** |
| **Select** | `id`, `role`, `name`, `email`, `status` |
| **Index** | `User.id` `@id` (PK). EXPLAIN: DB **~1.5 ms**; tiny table may Seq Scan (8 rows) — Index Scan appears as table grows. **No migration.** |
| **Wall cost (3A)** | ~230–300 ms — almost entirely **Supabase pooler RTT** (`SELECT 1` ping ~same) |

#### Changes

1. **`lib/authUserPrisma.ts`** — dedicated Prisma singleton for auth User PK lookups via `DIRECT_URL` + `connection_limit=1` when available (opt-out: `AUTH_USER_LOOKUP_DIRECT=false`). Domain queries stay on pooler `prisma`.
2. PERF meta on `auth:userLookup`: `path=bearer|session`, `lookupKey=id`, `transport=direct|pooler`, `select=…`.
3. Valid JWT + missing User → **404** without session fallback (invalid JWT still falls back to session).
4. Kept `name`/`email` on select (shared with `/api/auth/token` + admin password verify); further narrowing would not cut RTT.
5. Tests extended in `test:auth-request-scope`.

#### Before / after (workspace `strategy-tasks`, sample client)

| Metric | Phase 3A | Phase 3B |
|--------|----------|----------|
| `auth:userLookup` | ~230–300 ms (pooler) | **~47–80 ms** warm direct (occasional ~100–150) |
| `client360:workspace:auth` | ~225–311 ms | **~51–56 ms** |
| Client total | ~673–741 ms | **~534 ms** |
| Payload | 53 B | 53 B |

Assigned STANDARD_USER probe (same workspace contract): auth **~63–99 ms** (`transport=direct`); client total higher when access pays assignment RTT on pooler.

#### Rollback

Set `AUTH_USER_LOOKUP_DIRECT=false` (instant opt-out) or revert `lib/authUserPrisma.ts` + auth helper wiring / tests / docs.

### Phase 3C — Read-route access-check RTTs (non-admin)

> **Status:** ✅ Shipped July 21, 2026.  
> **Goal:** Cut pooler RTT on Client 360 **read** assignment/participant existence checks without changing ACL semantics.

#### Inventory (read access helpers)

| Capability / gate | Helper chain | Existence queries |
|-------------------|--------------|-------------------|
| `workspace:view` / `sourceRecords:view` | `hasClientAssignment(userId, clientId)` | `client_assignments` findFirst `{ clientId, userId }` |
| `strategy:view` / important-dates / core | `canReadClientCore` → assignment then any deal participant | assignment + `DealParticipant` findFirst `{ userId, deal.clientId }` |
| `deals:view` / deal detail | `canViewClientDeals` | assignment with DEAL_VIEW roles; else DOCTOR participant |
| participant-users | `canAccessDealParticipantPicker` | assignment with DEAL_CREATE roles; else DOCTOR participant |
| projection-milestones GET | `strategy:view` via `resolveClient360Context` | same as strategy |

**Not moved off pooler:** `getDealAccessForClient` findMany (manage/RSC flags), domain list/detail queries, `getClientOr404` domain miss path.

#### Query / index / DB vs transport

| Check | Shape | Indexes | DB EXPLAIN | Pooler wall | Direct wall |
|-------|-------|---------|------------|-------------|-------------|
| Assignment | `findFirst` select `assignmentId,role` | `(clientId,userId)`, `userId`, `clientId`, … | **~0.04 ms** | ~250–320 ms | **~47–75 ms** warm |
| Participant-on-client | `findFirst` select `id` via `deal: { clientId }` | `DealParticipant(userId)`, `Deal(clientId,…)` | sub-ms | ~266 ms | **~46–74 ms** warm |

No new index (predicates already covered; tiny tables may Seq Scan).

#### Changes

1. **`lib/accessCheckPrisma.ts`** — DIRECT_URL + `connection_limit=1` for existence checks only (opt-out `ACCESS_CHECK_LOOKUP_DIRECT=false`). Separate from auth User client.
2. Wire `hasClientAssignment` / `hasDealParticipantOnClient` (+ optional roles) through it; `canViewClientDeals` / `canAccessDealParticipantPicker` reuse those helpers.
3. PERF: `access:assignment`, `access:dealParticipant` (transport/hit/roles); `${perfPrefix}:access` meta includes capability/role/allowed/transport.
4. React `cache()` request memoization preserved (Phase 3A).
5. Tests: `npm run test:access-check-lookup`.

**Default:** ON when `DIRECT_URL` is set (strong ~3–4× win; +1 direct connection vs auth-only). Connection risk: two dedicated direct clients (`connection_limit=1` each) — auth User + access checks — acceptable for long-running Node; opt out either flag independently.

#### Before / after (workspace `strategy-tasks`)

| Role | Before access (3B) | After access (3C warm) | Notes |
|------|--------------------|------------------------|-------|
| SUPER_ADMIN | ≈0 | ≈0 | no assignment query |
| STANDARD_USER assigned | ~250 ms pooler | **~58–59 ms** direct | `access:assignment hit=true` |
| STANDARD_USER denied | ~250 ms pooler | **~52–53 ms** direct | 403; no domain query; client **~101 ms** |

Warm SUPER_ADMIN client total **~450 ms** (auth ~45 + query ~400). Assigned STANDARD_USER client **~656 ms** (auth + access ~59 + query).

#### Rollback

`ACCESS_CHECK_LOOKUP_DIRECT=false`, or revert `lib/accessCheckPrisma.ts` + authHelpers/request-context wiring / test / docs. Auth User direct path (`AUTH_USER_LOOKUP_DIRECT`) unchanged.

### Phase 3D — Workspace strategy-tasks domain query

> **Status:** ✅ Shipped July 21, 2026.  
> **Goal:** Cut pooler domain cost for `GET …/workspace?tab=strategy-tasks` without changing `{ tab, strategyText, tasks }`.

#### Inventory (after auth/access)

| Call | Shape | Index | DB EXPLAIN | Role |
|------|-------|-------|------------|------|
| Client scalar | `findUnique` `{ id, strategyText }` | PK | **~0.04 ms** | always |
| Tasks + assignee | `findMany` by `clientId` + assignee select | `tasks(client_id)` | **~0.03 ms** | always |
| Legacy Strategy | `findMany` take 1 order `updatedAt` | *no `clientId` index* (tiny table Seq Scan **~0.1 ms**) | always (parallel) |

**Before:** one Prisma nested select → **3 sequential** SELECTs in a transaction (~400 ms wall).  
**After:** `Promise.all` of the three → **1 pooler wall RTT** (~240–300 ms warm).

Hybrid “fetch Strategy only if strategyText blank” was measured at **~520–560 ms** (two RTTs) on the empty first-paint sample — **rejected**. Semantic ignore of Strategy when `strategyText` is set remains in `resolveStrategyText`.

Domain stays on **pooler** (not direct). Optional follow-up: `@@index([clientId])` on `Strategy` (not required; DB already sub-ms).

#### Before / after (empty sample, payload **53 B**)

| Role | Before (3C) client | After (3D) client | Domain |
|------|--------------------|-------------------|--------|
| SUPER_ADMIN | ~450 ms | **~293 ms** | nested ~400 → parallel **~238 ms** |
| STANDARD_USER assigned | ~656 ms | **~475 ms** | parallel **~276–304 ms** |
| STANDARD_USER denied | ~101 ms | **~109 ms** | **no domain query** |

#### Rollback

Revert `loadStrategyTasksWorkspace` / workspace route to nested `client360StrategyTasksSelect` findUnique; restore prior contract test assertions if needed.

### Phase 4A — Workspace strategy-tasks warm waterfall (residual floor)

> **Status:** ✅ Shipped July 21, 2026.  
> **Goal:** Standardize one correlated warm-path waterfall for `GET …/workspace?tab=strategy-tasks` after 3B–3D; decide whether residual cost is still DB-adjacent or mostly route/runtime.  
> **Probe:** `BASE_URL=http://localhost:3001 npx tsx scripts/probe-workspace-strategy-tasks-waterfall.ts` (needs `PERF_LOGGING_ENABLED=true` on :3001).

#### Instrumentation

| Span | PERF op / meta |
|------|----------------|
| request received | `client360:workspace:strategyTasks:received` |
| auth/session total | `client360:workspace:auth` |
| auth:userLookup | `auth:userLookup` + `transport=direct` |
| access total | `client360:workspace:access` |
| access direct check | `access:assignment` (or access total when SUPER_ADMIN short-circuits) |
| domain total / parallelBase / clientScalar / tasks / legacyStrategy / map | `…:strategyTasks:*` + `transport=pooler` |
| response serialize/json | `…:strategyTasks:serialize` |
| route total | `…:strategyTasks:waterfall` (`routeTotalMs`, `residualMs`, `floorHint`) |

Also recorded: `payloadBytes`, `role`, `sampleClass`, `accessOutcome`, `reqId` (ALS + optional `x-perf-req-id` when PERF on). JSON body shape unchanged.

#### Warm waterfalls (empty sample `cmqv35szi…`, payload **53 B** / denied **21 B**)

| Span | SUPER_ADMIN | STANDARD_USER assigned | STANDARD_USER denied |
|------|------------:|-----------------------:|---------------------:|
| auth/session total | 65 | 57 | 41 |
| auth:userLookup (direct) | 63 | 56 | 40 |
| access total | 0 | 53 | 44 |
| access direct (`access:assignment`) | — | 53 | 43 |
| domain total (pooler) | 237 | 233 | **0** (no query) |
| · parallelBase | 236 | 233 | — |
| · clientScalar / tasks / legacy | ~200–236 | ~227–232 | — |
| · map | 0 | 0 | — |
| serialize/json | 0 | 0 | 0 |
| **route total (server)** | **302** | **344** | **85** |
| residual (route − authAccess − domain − serialize) | **0** | **0** | **0** |
| client round-trip | 312 | 355 | 90 |
| accessOutcome / floorHint | allowed / `domain_pooler_rtt` | allowed / `domain_pooler_rtt` | denied / `auth+access_only` |

**Verdict:** After Phases 3B–3D, **residual route/runtime ≈ 0 ms**. Remaining warm cost is still **database-adjacent** — one pooler RTT for domain (~230–240 ms) plus direct auth (~40–65 ms) and, for STANDARD_USER, one direct access check (~45–55 ms). Denied path confirms domain is skipped (~85 ms auth+access only).

#### Rollback

Remove ALS/`logPerfOp` waterfall wiring from `lib/performance.ts` + workspace strategy-tasks branch; delete probe script; keep 3B–3D transport clients.

### Phase 4B — Auth-only baseline vs full workspace strategy-tasks

> **Status:** ✅ Shipped July 21, 2026 (measurement-only; temporary PERF-gated route).  
> **Goal:** Separate auth/access floor from domain cost on the same ACL path as workspace `strategy-tasks`.  
> **Route:** `GET /api/perf/client360-workspace-auth-only?clientId=` — only when `PERF_LOGGING_ENABLED=true` (else 404). Same `resolveClient360Context(workspace:view)`; returns `{ ok: true }` (**11 B**); **no domain reads**.  
> **Probe:** `BASE_URL=http://localhost:3001 npx tsx scripts/probe-workspace-auth-only-baseline.ts`

#### Warm comparison (empty sample `cmqv35szi…`, second warm pass)

| Scenario | Meaning | Client ms | Route total | Auth | Access | Domain | Bytes |
|----------|---------|----------:|------------:|-----:|-------:|-------:|------:|
| SUPER_ADMIN auth-only | admin auth floor | 91 | **73** | 71 | 0 | **0** | 11 |
| SUPER_ADMIN full | admin + domain | 377 | **367** | 45 | 0 | **321** | 53 |
| STANDARD_USER assigned auth-only | allow floor | 119 | **105** | 41 | 63 | **0** | 11 |
| STANDARD_USER assigned full | allow + domain | 383 | **375** | 43 | 84 | **247** | 53 |
| STANDARD_USER denied full | denial floor | 111 | **102** | 39 | 62 | **0** | 21 |

Domain delta (full − auth-only, server): SUPER_ADMIN **~294 ms** · assigned STANDARD_USER **~270 ms**.  
Domain share of full route: SUPER_ADMIN **~87%** · assigned **~66%** (auth+access still material for non-admin).  
Denied full (~102 ms) ≈ assigned auth-only (~105 ms) — both are auth+access only.

**Verdict:** Remaining ~300–400 ms warm totals are **domain-dominated** (pooler parallel RTT), not map/serialize/runtime. Non-domain floor is ~40–75 ms (admin) or ~100–165 ms (STANDARD_USER auth+access). Further wins need fewer/cheaper domain RTTs (or accept pooler floor), not more auth micro-optimizations.

#### Rollback

Delete `src/app/api/perf/client360-workspace-auth-only/` + `scripts/probe-workspace-auth-only-baseline.ts`; remove docs rows. Product routes unchanged.

### Phase 4C — Domain direct-read risk analysis (no migration)

> **Status:** ✅ Analysis shipped July 21, 2026. **Product domain transport unchanged** (still pooler).  
> **Goal:** Decide whether any of the Phase 3D parallel domain legs should get a `DIRECT_URL` path — only with explicit connection-risk analysis.  
> **Measure (no product wiring):** `npx tsx scripts/measure-workspace-domain-direct-risk.ts`

#### Query classification

| Query | Shape | Direct candidate? | Why |
|-------|-------|-------------------|-----|
| Client scalar | `Client.findUnique` `{ id, strategyText }` PK | **maybe** | Tiny PK read; Postgres sub-ms; wall = RTT |
| Legacy Strategy | `Strategy.findMany` take-1 by `clientId` | **maybe** | Tiny fallback; semantic ignore when `strategyText` set; still fetched in parallel on empty first-paint |
| Tasks + assignee | `Task.findMany` + assignee select | **no by default** | List/domain payload; join; variable cardinality; connection budget |

#### Connection budget (current)

| Client | Transport | `connection_limit` | Role |
|--------|-----------|-------------------|------|
| `prisma` | pooler `DATABASE_URL` | pooler default | All domain list/detail |
| `authUserPrisma` | `DIRECT_URL` | **1** | Auth User PK only (3B) |
| `accessCheckPrisma` | `DIRECT_URL` | **1** | Read access existence only (3C) |

**Reserved today:** **2** direct slots per Node process (idle-held).  
**Hybrid would add:** +1 (or +2 if scalar∥legacy need concurrent true parallelism on direct).  
**Peak if hybrid:** **3–4** direct slots/process × instance count. Supabase **direct** caps are far tighter than pooler — risk of exhaustion / queueing under multi-instance load.  
**Also:** `connection_limit=1` **serializes** concurrent queries on that client (measured direct `Promise.all` three legs ≈ **164 ms** ≈ 3× single-leg RTT, not max-of-legs).

#### Measured legs (empty sample `cmqv35szi…`, 5 rounds, warm)

| Leg | Pooler avg / median | Direct avg / median |
|-----|--------------------:|--------------------:|
| `SELECT 1` ping | 290 / 279 | 62 / 55 |
| Client scalar | 285 / 257 | 49 / 47 |
| Tasks + assignee | **317 / 274** | 74 / 47 |
| Legacy Strategy | 305 / 260 | 57 / 46 |
| Parallel all three (same client) | 377 / 336 | 164 / 160 (limit=1 serializes) |

#### Hybrid compromise evaluated (only)

```text
direct tiny scalar + direct legacy fallback
pooler task list
```

| Model | Wall estimate | Notes |
|-------|--------------:|-------|
| All-pooler parallel | **max(legs) ≈ 317 ms** avg | Production Phase 3D shape |
| Hybrid (direct scalar/legacy + pooler tasks) | **max(49, 317, 57) ≈ 317 ms** | **Estimated savings ≈ 0 ms** |
| Bottleneck | `pooler_tasks_still_dominates` | Faster tiny legs do not move `parallelBase` |

Route PERF waterfalls (4A/4B) already showed the three pooler legs **co-dominant** (~230–300 ms each); speeding non-critical legs cannot beat the slowest pooler leg.

#### Decision

| Option | Decision | Reason |
|--------|----------|--------|
| Move tasks + assignee to direct | **Reject** | Broader domain list; needs connection budget; expands direct attack surface |
| Hybrid direct scalar/legacy + pooler tasks | **Reject for now** | **~0 ms** route gain while tasks stay on pooler; +1–2 reserved direct connections for no win |
| Move all three domain legs to direct | **Reject** | Needs `connection_limit≥3` for true parallel or accepts serialization; largest connection risk; out of Phase 4 “tiny first-paint” scope |
| Keep domain on pooler | **Accept** | Status quo; residual floor is one pooler RTT (~250–320 ms) |

**Revisit only if:** (1) production waterfalls show tasks **consistently faster** than scalar/legacy (so hybrid could move the max), **and** (2) ops approves a documented direct connection budget, **and** (3) a feature-flagged experiment measures real route delta before permanent wiring.

#### Rollback

N/A for product (no domain transport change). Delete `scripts/measure-workspace-domain-direct-risk.ts` + docs if analysis-only artifacts are retired.

### Phase 4 — Deliverables & acceptance (closed)

> **Status:** ✅ **Closed** July 21, 2026. Measurement + documentation only for workspace `strategy-tasks` after 3B–3D. **No product behavior / ACL / response-shape changes** in Phase 4 (PERF-gated probe route returns `{ ok: true }` and is not a product API).  
> **Sample:** empty client `cmqv35szi0000jp04jaejps9j` · payload **53 B** (allowed) / **21 B** (denied) · port **3001** · `PERF_LOGGING_ENABLED=true`.  
> **Probes:** `probe-workspace-strategy-tasks-waterfall.ts` · `probe-workspace-auth-only-baseline.ts` · `measure-workspace-domain-direct-risk.ts`

#### 1. Full warm waterfall

| Span | SUPER_ADMIN | STANDARD_USER assigned | STANDARD_USER denied |
|------|------------:|-----------------------:|---------------------:|
| request received | 0 | 0 | 0 |
| auth/session total | 40 | 45 | 41 |
| auth:userLookup (direct) | 40 | 44 | 40 |
| access total | 0 | 50 | 41 |
| access direct (`access:assignment`) | — | 49 | 40 |
| domain total (pooler) | **256** | **261** | **0** |
| · parallelBase | 256 | 261 | — |
| · clientScalar | 252 | 261 | — |
| · tasks | 255 | 260 | — |
| · legacyStrategy | 249 | 260 | — |
| · map | **0** | **0** | — |
| serialize/json | **0** | **0** | 0 |
| **route total** | **299** | **356** | **82** |
| residual (unaccounted) | **0** | **0** | **0** |
| client round-trip | 308 | 368 | 91 |
| payloadBytes | 53 | 53 | 21 |
| accessOutcome | allowed | allowed | denied |

Every warm span is accounted for (`residualMs=0`). Denied path performs **no domain query**.

#### 2. Auth-only / no-domain comparison

| Scenario | Route total | Auth | Access | Domain | Bytes |
|----------|------------:|-----:|-------:|-------:|------:|
| SUPER_ADMIN auth-only | **48** | 47 | 0 | 0 | 11 |
| SUPER_ADMIN full | **319** | 60 | 0 | **259** | 53 |
| STANDARD_USER assigned auth-only | **97** | 41 | 54 | 0 | 11 |
| STANDARD_USER assigned full | **335** | 64 | 48 | **222** | 53 |
| STANDARD_USER denied full | **~82–155** | ~40–113 | ~40–50 | **0** | 21 |

Domain ≈ **66–81%** of allowed full-route totals. Auth-only floors ≈ admin **~50 ms** · assigned **~100 ms**. Denied ≈ auth+access only (matches allow floor when warm).

#### 3. Parallel domain leg analysis

| Question | Answer |
|----------|--------|
| What determines `parallelBase`? | **`max(clientScalar, legacyStrategy, tasks)`** — one pooler wall RTT |
| Is `tasks` consistently the long pole? | **Co-dominant, not uniquely.** Warm route legs ≈ **249–261 ms** together; measure script pooler avgs scalar **285** / tasks **317** / legacy **305**. Any leg can win a given sample; **tasks is often tied for slowest** but not always alone |
| Do tiny scalar reads finish much faster? | **No on pooler** — still full pooler RTT (~250 ms). On DIRECT_URL they drop to **~47–50 ms**, but that does not shrink `parallelBase` while `tasks` stays on pooler |

#### 4. Serialization / mapping

| Step | Warm duration | Notes |
|------|--------------:|-------|
| `strategyTasks:map` | **0 ms** | `buildStrategyTasksWorkspace` on empty payload |
| `strategyTasks:serialize` | **0 ms** | `JSON.stringify` of **53 B** body |
| Conclusion | **Negligible** | Not a meaningful share of ~300–360 ms route totals |

#### 5. Direct-read candidate assessment

| Item | Assessment |
|------|------------|
| Candidates | Client scalar **maybe** · Legacy Strategy **maybe** · Tasks+assignee **no by default** |
| Connection risk | Already **2** reserved direct slots (3B+3C). Hybrid adds +1–2; Supabase direct caps tight; `connection_limit=1` serializes concurrent direct queries |
| Expected hybrid win | **~0 ms** (`max(directScalar, poolerTasks, directLegacy)` still ≈ pooler tasks) |
| Win bounded by slowest remaining pooler leg? | **Yes** — while tasks stay on pooler, speeding tiny legs cannot move `parallelBase` |
| Rollback plan | N/A (no domain migration). 3B/3C flags unchanged: `AUTH_USER_LOOKUP_DIRECT=false`, `ACCESS_CHECK_LOOKUP_DIRECT=false` |
| Decision | **Do not migrate** domain reads to direct |

#### 6. Documented latency floor (no further safe Phase-4 optimization)

| Role | Warm route floor | Dominant cost |
|------|-----------------:|---------------|
| SUPER_ADMIN allowed | **~300 ms** | auth direct (~40) + **1 pooler domain RTT (~250)** |
| STANDARD_USER assigned | **~350–360 ms** | auth+access direct (~90) + **1 pooler domain RTT (~260)** |
| STANDARD_USER denied | **~80–100 ms** | auth+access direct only (**no domain**) |

Further product wins need **fewer/cheaper domain RTTs** (query shape / locality / accept pooler floor) — not more auth micro-opts or unsafe direct domain lists.

#### Phase 4 acceptance criteria

| Criterion | Status |
|-----------|--------|
| No API response shape changes | ✅ `{ tab, strategyText, tasks }` unchanged |
| No authorization changes | ✅ Same `workspace:view` / `resolveClient360Context` |
| No mutation/manage authority changes | ✅ Read-path only; mutations untouched |
| No cross-request User or permission cache | ✅ Request-scoped only (WeakMap / React `cache`); admin `unstable_cache` unrelated |
| No broad domain list query moved to direct DB | ✅ Tasks stay pooler; 4C rejected hybrid/full direct |
| Current rollback flags preserved | ✅ `AUTH_USER_LOOKUP_DIRECT` / `ACCESS_CHECK_LOOKUP_DIRECT` |
| Every warm route span accounted for | ✅ `residualMs=0` on waterfall |
| Denied path performs no domain query | ✅ `domainMs=0` / no `strategyTasks:domain` spans |
| If no safe optimization remains, document latency floor | ✅ §6 above |

#### Client 360 data-loading checklist (Phase 2M)

| Situation | Allowed fetch timing | Anti-pattern |
|-----------|----------------------|--------------|
| Visible on first paint (core shell, default workspace tab) | Eager | — |
| Default workspace tab | Eager | Prefetch inactive tabs |
| Collapsed aside cards (e.g. source records) | First expand | Eager mount fetch |
| Inactive tabs / closed modals | Lazy on open | Eager mount fetch |
| Data already supplied by RSC props | Skip client GET on first paint (slice skip refs) | Duplicate first-paint GET |
| Read-only API auth | Route `resolveClient360Context` / light gates | Pre-access `getClientOr404`; page flags as API auth |
| Mutations | Route `require*` / `getDealAccessForClient` | Reusing RSC flags or view-only context |

Contracts encoded in `lib/client360LoadGuards.ts` + `npm run test:client360-load-guards`.

**Profiler note:** `scripts/profile-api-routes.ts` still probes `GET …/source-records` as a **route** microbench — that is not the Client 360 first-paint fan-out list. First paint must not include source-records until expand (Phase 2L).

**Key files for 2I:** `lib/authHelpers.ts`, `lib/clientStrategyPermissions.ts`, `lib/importantDateApi.ts`, `src/app/api/clients/[id]/deals/[dealId]/route.ts`, `src/app/api/clients/[id]/source-records/route.ts`, strategy plan routes, optional new `lib/client360RequestContext.ts`.

**Key files:** `lib/client360.ts`, `src/app/clients/[id]/page.tsx`, `Client360PageClient.tsx`, `DealInfoWidget.tsx`, `WorkspacePanel.tsx`, `ClientStrategyBuilderWidget.tsx`.

---

## 7. Lead Command Center refactor plan

**Current (docs):** Compact inbox, attention scoring, filters, preview drawer, bulk actions; lib `leadCommandCenter.ts`.

### Done — Split inbox vs preview payloads

1. Slim `LeadCommandCenterRow` for `GET /api/admin/leads` (no full `sources[]`, activity summary, tags, expectations/role).
2. Cap inbox source sample; use `_count` for `sourceRecordCount`; light activity timestamps for attention only.
3. `GET /api/admin/leads/[id]/preview` returns `LeadCommandCenterPreview`; drawer loads on open with loading/error/retry.
4. Merge selected loads preview details per selected id before opening `MergeClientsModal`.

### Phase A — Stop load-all-then-slice — **PARTIAL**

1. ✅ Apply Prisma `take`/`skip` + `orderBy lastModified desc, id desc` when only Prisma-native filters are active (default inbox, search, status, tags, follow-up, etc.).
2. ✅ Fallback explicitly when `duplicateEmail` / `duplicatePhone` / `needsAttention` / `latestSourceFrom|To` (or `LCC_SQL_PAGINATION=false` / unlimited limit): load-all → hydrate → post-filter → attention sort → slice. Perf logs include `dbPaginated` + `fallbackReason`.
3. Cap nested includes (e.g. sourceRecords: latest N only). ✅ (inbox sample + preview full history)
4. Still open: materialize attention / dup / latest-source so default sort and remaining filters can stay on the DB path.

**Partial (offset UX):** default `limit=50`, response `meta.total` / `hasMore` / `dbPaginated`, UI Load more + debounce/abort. Cursor still deferred.

### Phase B — Duplicate detection — **PARTIAL (phase 1 shipped)**

1. ✅ LCC list/preview no longer call full-table `loadDuplicateClientIds`; use candidate key peer lookup (`loadDuplicateClientIdsForCandidates`) with defensive caps.
2. Remaining options for stricter/exact + SQL pagination:
   - Short TTL cache of duplicate client ID set
   - Precomputed `hasDuplicateContact` flag maintained on ingest/merge
   - Dup panel only hits dedicated duplicates API (already exact via `leadDuplicates.ts`)
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

### Phase B — API DTOs (fat DTO) — **PARTIAL (Phase 2E)**

1. Introduce view-specific loaders:
   - **Detail GET (shared):** ✅ Phase 2E — `strategyPlanDetailBaseSelect` + parallel relation queries with `[perf]` substeps; same `formatStrategyPlanDetail` response shape
   - **List:** steps summary + economics fields needed for list cards — **OPEN**
   - **Board:** steps, connections, expenses (current board needs) — **OPEN** (still uses full detail DTO)
   - **Projection:** milestones + source links + suggestion inputs — **OPEN**
   - **Overview:** reuse `clientStrategyReportHelpers` from existing detail or a report-shaped select — **OPEN**
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

**Current (docs):** Per-widget APIs; shared `standardDashboardContext`; SQL deal aggregates; skeletons; admin analytics cached 600s; **sidebar + workspace shells** with active-module loading (Phase E).

### Phase A — Quick wins — **PARTIAL**

1. ✅ Deduplicate `/api/me/assignments` on standard dashboard (page → calendar + add-date modal).
2. ✅ Add `take` to `buildDealParticipationWidget` and `buildOpenTasksWidget` (limit 20; deal participation uses Deal `take` candidate pool then status sort).
3. Ensure all live widgets use shared context or aggregates — no accidental standalone full hydrates in hot paths.

### Phase B — Admin surfaces — **PARTIAL** (pipeline bounded default; cursor open)

1. Master Pipeline: ✅ server `status` / `assignedUserId` + per-status cap + meta. Still open: **cursor / load-more per column** (separate from layout Phase E). Keep mobile grouped list / desktop kanban.
2. Optional: light skeleton loaders on admin KPI/funnel (docs gap).
3. Keep 600s cache; document lag; add on-demand revalidate only if product requires fresher KPIs.

### Phase C — Commission read models (deeper)

1. Evaluate materialized summary for secured commission / company earnings to avoid hydrating all WON deals on cold cache.
2. Continue participant-backed preferred path; legacy fallback until backfill complete.

### Phase D — Legacy cleanup

1. Mark or remove `GET /api/get-dashboard-data` and `GET /api/dashboard/standard` from production use; migrate tests to per-widget routes.
2. Do not revive monolith in UI.

### Phase E — Sidebar / workspace layout (UI + loading boundary) — **SHIPPED**

> **Status:** ✅ Shipped July 21, 2026.  
> **Goal:** Reduce **initial dashboard fan-out** by mounting/fetching **only the active workspace module**.  
> **Non-goals preserved:** existing widget/admin **APIs reused** (same response shapes); **no auth changes**; **no DB schema / query changes for logging**; **no commission/returnable formula changes**; routes `/admin/leads`, `/admin/users`, `/admin/reconciliation` preserved.

| Surface | Behavior |
|---------|----------|
| **Standard shell** | `WorkspaceShell` + `StandardUserDashboardPage` + `?view=` (`home`, `clients`, `tasks`, `activity`, `calendar`, `deals`, `commission`, `returnables`) |
| **Super admin shell** | `WorkspaceShell` + `SuperAdminDashboardPage` + `?view=` (`home`, `pipeline`, `calendar`, `activity`, `analytics`, `revenue`, `leaderboards`); tools stay on standalone routes |
| **Mobile sidebar** | Hidden / **off-canvas** by default (`< lg`); hamburger opens drawer; nav closes drawer; workspace full width |
| **Desktop sidebar** | In-flow; **collapsible** (`crm-sidebar-collapsed`) |
| **Active module fetch rule** | Home is light (`/api/me/assignments` or `/api/admin/dashboard-kpis` only). Inactive modules: **do not mount** → no `useEffect` fetches. Active module owns its existing API(s) via `next/dynamic` |
| **Deep links** | `?view=` soft-nav; invalid → Home; `/admin#master-pipeline` → `?view=pipeline` |

**Key files (Phase E):** `src/components/layout/*`, `StandardUserDashboardPage`, `DashboardHomeView`, `standardDashboardViews`, `SuperAdminDashboardPage`, `AdminHomeView`, `adminDashboardViews`, LCC/users/reconciliation pages (shell wrap only).

**Contract probe:** `npm run probe:dashboard-shell` + UI reference § Measuring workspace shell loads.

#### Phase E follow-ups (open — separate from shipped layout)

| Follow-up | Notes |
|-----------|--------|
| **Rebaseline initial `/dashboard` and `/admin` API calls** | Record Home Network fan-out + `[perf]` for allowed Home APIs only. Do **not** invent timings; July 21 route microbench table remains valid for individual routes |
| **Optional nested routes later** | Promote `?view=` modules to nested App Router paths if product wants cleaner URLs / RSC boundaries — not required for fan-out win |
| **Admin pipeline load-more** | Remains **Phase B / Next Sprint #4** — cursor / load-more per column; independent of sidebar layout |
| **LCC SQL materialization** | Remains **Next Sprint #1 / Wave 4** — attention/dup/latest-source for full SQL pagination; independent of dashboard shell |

**Key files (ongoing A–D):** `lib/standardDashboardWidgets.ts`, `lib/standardDashboardContext.ts`, `lib/dashboardDealAggregates.ts`, `lib/adminAnalyticsCache.ts`, `MasterPipelineView`, `ImportantDatesCalendarWidget`.

---

## 10. iPad / Safari UX fixes

**Already shipped:** Global `-webkit-autofill` override in `globals.css` (dark text + inset box-shadow). Dashboard shells: mobile **off-canvas** sidebar (workspace full width) — see Phase E.

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

1. **Production/staging processor:** follow [`docs/BACKGROUND_JOBS_OPS.md`](./BACKGROUND_JOBS_OPS.md) — set `CRON_SECRET`, schedule every 1–5 minutes (`POST /api/tasks/process-background-jobs` or `npm run jobs:process`). Monitor with `npm run jobs:status`.
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

1. Single resolver per request for `canReadClientCore` + deal view/manage flags to cut duplicate queries — ✅ Phase **2J** API context + Phase **2K** RSC `resolveClient360PageAccess`.
2. Super-admin bypass remains; avoid loading all deal IDs when not needed. ✅ Phase 2G: list GET uses `canViewClientDeals`. ✅ Phase 2I.2: deal detail + participant-users light gates. ✅ Phase **2K**: `getDealAccessForClient` SUPER_ADMIN no longer `findMany` deal ids (`canManageAll` sufficient). Manage/create still use `getDealAccessForClient` for non-admin.

### Phase D — Cleanup

1. NextAuth placeholder route: remove or clearly dead-code when safe.
2. Middleware: docs note `/admin/*` session-only at edge — consider role check hardening separately (security, not only perf).

**Key files:** `lib/authHelpers.ts`, Client 360 API routes under `src/app/api/clients/**`, `authenticatedFetch` helpers.

---

## 13. Testing plan

### Baseline (before each phase)

```bash
PERF_LOGGING_ENABLED=true npm run dev   # or your usual port
# other terminal:
npx tsx scripts/profile-api-routes.ts
# Capture: LCC list (+ needsAttention / duplicateEmail), LCC preview, duplicates,
# pipeline, Client 360 workspace, strategy plan GET, search, important-dates-calendar,
# open-tasks, deal-participation, all-commission-returnable
# Default BASE_URL=http://localhost:3001; Auth via local JWT (no prod credentials in script)
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
- [ ] After layout Phase E: rebaseline **Home** `/dashboard` + `/admin` Network fan-out (allowed APIs only) via UI reference measuring section + `npm run probe:dashboard-shell` — **do not invent numbers**
- [ ] After next sprint: update UI reference with newly measured Home fan-out if recorded (keep July 21 API microbench history)

### Wave 1 — Indexes & query caps (low risk)

- [x] Migration: `ClientAssignment(clientId)` (+ composites) — **phase 3 shipped**
- [x] Migration: `Client(status)` (and composites) — **phase 3 shipped**
- [x] Migration: `Notification(recipientUserId, isRead, …)` — **phase 3 shipped**
- [x] Migration: `Client(company)`, `Task(clientId)`, `ClientDocument(clientId)`, source/participant composites + `pg_trgm` — **phase 3 shipped**
- [x] Cap deal-participation and open-tasks queries with `take` — **shipped** (limit 20)
- [x] Cap hierarchy colleagues with `take` (50) + `colleaguesHasMore` — **SHIPPED**
- [x] Hierarchy GET: eliminate clientLookup via combined target+colleagues SQL (Phase 2F) — **SHIPPED**
- [x] Deduplicate dashboard `/api/me/assignments` — **PARTIAL** (standard `/dashboard`; admin calendar is super-admin and skips)

### Wave 2 — Mobile viewport & code-splitting (low risk)

- [ ] Convert tall modals from `vh` → `dvh` (Deal Edit first)
- [x] `next/dynamic` for Strategy Plan detail / Board / Projection / heavy strategy modals — **shipped**
- [ ] `next/dynamic` for `DealEditModal` — **OPEN**
- [x] Lazy Strategy Board/List/Projection by active view — **shipped**

### Wave 3 — Client 360 refresh & payloads (medium risk)

- [x] Scoped refresh API in `Client360PageClient` — **PARTIAL** (`refreshClient360Slices`; details migrated; others still `all`)
- [ ] Stop strategy refetch on unrelated mutations — **OPEN**
- [x] Slim deals list DTO; lazy-load full participants — **PARTIAL** (list omits notes; edit fetches full detail)
- [x] Deals list GET: `canViewClientDeals` + conditional clientLookup (Phase 2G) — **SHIPPED** (dealful re-measure when DB has deals)
- [ ] Request-scoped access resolution on Client 360 page — **OPEN**
- [ ] Optional Client 360 skeletons — **OPEN**

### Wave 4 — Lead Command Center (medium–high risk)

- [x] DB-level `take`/`skip` on primary list path — **PARTIAL** (Prisma-native filters; post-filter fallback remains)
- [x] Remove per-request full-table dup scan (list **and** preview); candidate peer lookup — **phase 1 shipped** (exact panel path unchanged; precompute/TTL still open)
- [x] Narrow sourceRecords include (inbox sample) — **shipped**
- [x] Extend LCC smoke tests for pagination — **PARTIAL** (dbPaginated / fallback paths asserted)
- [ ] Split LCC page components — **OPEN**

### Wave 5 — Admin pipeline & dashboard depth (medium–high risk)

- [x] Pipeline server filters + per-status limit + meta — **PARTIAL** (cursor / load-more still open — **separate from layout**)
- [x] Dashboard Phase E — sidebar / workspace shells + active-module loading — **SHIPPED** (no auth/API/DB/commission changes)
- [ ] Rebaseline Home `/dashboard` + `/admin` first-paint API fan-out (Network + `probe:dashboard-shell`) — **OPEN** (do not invent numbers)
- [ ] Optional: promote `?view=` to nested routes — **OPEN** (later)
- [ ] Admin skeleton polish (optional)
- [ ] Plan commission summary/read-model spike (design only → implement if approved)

### Wave 6 — Strategy Planner maintainability (medium risk)

- [x] Detail GET narrow base select + parallel timed relations (Phase 2E) — **PARTIAL** (still one shared detail DTO for all views)
- [ ] View-specific plan selects per Board / List / Projection / Overview — **OPEN**
- [ ] Split `StrategyPlanDetailView` modules — **OPEN**
- [ ] Mobile accordion / board scroll fixes
- [ ] Keep all strategy unit/integration tests green

### Wave 7 — Auth normalization (medium risk)

- [x] Phase 2H: Client 360 auth/access/lookup audit (read-only) — **SHIPPED (docs)**
- [x] Phase 2I.1: Drop redundant `getClientOr404` on important-dates + source-records GET — **SHIPPED**
- [x] Phase 2I.2: Deal detail / participant-users light view gate — **SHIPPED**
- [x] Phase 2I.3: Strategy list/detail 403-first + fold client lookup — **SHIPPED**
- [x] Phase 2J (= 2I.4): `resolveClient360Context` on source-records + strategy list/detail GETs — **SHIPPED**
- [x] Phase 2K (= 2I.5): Client360Page resolve-once access + manage flags — **SHIPPED**
- [x] Phase 2L: Client 360 initial fan-out profile + defer source-records until expand — **SHIPPED**
- [x] Phase 2M: Stabilize Client 360 access/fetch contracts (load-guard tests + docs) — **SHIPPED**
- [x] Phase 2N: Measure workspace strategy-tasks; no unnecessary eager trim — **SHIPPED**
- [x] Phase 3A: Measure/reduce within-request auth/session overhead on Client 360 reads — **SHIPPED**
- [x] Phase 3B: Optimize single authenticated User lookup (direct transport) — **SHIPPED**
- [x] Phase 3C: Optimize Client 360 read access-check RTTs (assignment/participant direct) — **SHIPPED**
- [x] Phase 3D: Parallelize workspace strategy-tasks domain query — **SHIPPED**
- [x] Phase 4A: Strategy-tasks warm waterfall + residual floor — **SHIPPED** (residual ≈0; cost still DB/pooler RTT)
- [x] Phase 4B: Auth-only baseline vs full strategy-tasks — **SHIPPED** (domain ~66–87% of route; PERF-gated probe route)
- [x] Phase 4C: Domain direct-read risk analysis — **SHIPPED** (no migration; hybrid ~0 ms gain; tasks stay pooler)
- [x] Phase 4 close: Deliverables + acceptance — **SHIPPED** (latency floor documented; no product behavior change)
- [ ] Finish remaining Client 360 session-only routes / inventory — **PARTIAL**
- [ ] Update auth-sensitive tests

### Wave 8 — Background jobs

- [x] Durable queue + enqueue + retries/backoff — **SHIPPED**
- [x] Sync recalculate route retained for compat — **SHIPPED**
- [x] Logging + FAILED visibility (ops polish) — **PARTIAL** (`jobs:status` + runbook; alerting still env-specific)
- [x] Cron / scheduled `jobs:process` runbook — **SHIPPED** (docs); enable schedule per env — **OPEN (ops)**
- [ ] Bulk-assign job batching review under load — **OPEN**
- [x] Runbook: replay failed returnable jobs — **SHIPPED** (`BACKGROUND_JOBS_OPS.md`)

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
| W3.3 | Access resolve-once | **Done (Phase 2K)** | `resolveClient360PageAccess` on Client360Page; APIs still authoritative |
| W4.1 | LCC SQL pagination | **Medium** (partial shipped) | Default path DB-paginated with lastModified sort; post-filter fallback still load-all; attention order differs on DB path |
| W4.2 | Dup scan removal/cache | **Medium** | Stale duplicate badges |
| W5.1 | Pipeline pagination | **Medium** | Kanban empty columns / drag assumptions |
| W5.2 | Commission read models | **High** | Formula drift vs live calc |
| W6.1 | Strategy view DTOs | **Medium** | Missing fields break Board/Projection |
| W6.2 | Split Strategy components | **Medium** | Regression in planner UX |
| W7.1 | Auth Bearer+session unify | **Medium** | Accidental auth bypass if helper misused |
| W7.2 | Phase 2I lookup/access consolidation | **Low–Medium** | Existence leak if 403/404 order wrong; ACL family mix-ups |
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
| **Auth User direct (3B)** | `AUTH_USER_LOOKUP_DIRECT=false` or revert `lib/authUserPrisma.ts` |
| **Access-check direct (3C)** | `ACCESS_CHECK_LOOKUP_DIRECT=false` or revert `lib/accessCheckPrisma.ts` |
| **Phase 4A waterfall PERF** | Revert ALS/`logPerfOp` waterfall on workspace strategy-tasks; delete probe script (no product behavior) |
| **Phase 4B auth-only probe route** | Delete `/api/perf/client360-workspace-auth-only` + baseline probe script (404 when PERF off already) |
| **Phase 4C domain direct analysis** | No product rollback (domain never moved). Optional: delete measure script + docs. |
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
| Dashboard over-fetch / duplicate assignments | ✅ Next sprint #3 shipped (take + standard dashboard dedupe); ✅ **Phase E** active-module Home fan-out reduced |
| Dashboard Home rebaseline after layout | Next sprint #6 / W5 remaining |
| Modal `dvh` + DealEdit dynamic import | W2 remaining |
| Client 360 `router.refresh` fan-out + deals DTO | Next sprint #2 / W3 |
| LCC post-filter load-all + attention sort not in SQL | Next sprint #1 remaining / W4 (**separate** from dashboard shell) |
| Admin pipeline load-more / cursor | Next sprint #4 / W5 (**separate** from dashboard shell) |
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
