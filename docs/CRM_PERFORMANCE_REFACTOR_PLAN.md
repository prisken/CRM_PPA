# CRM Performance & Maintainability Refactor Plan

> **Purpose:** Prioritized plan to improve CRM speed, maintainability, and mobile/iPad reliability without changing product rules.  
> **Sources of truth:** `docs/DATABASE_AND_UI_REFERENCE.md` + codebase audit (July 2026).  
> **Scope of this document:** Planning only. Do not treat unchecked items as shipped.  
> **Deployment branch:** `deploy`  
> **Measurement:** `PERF_LOGGING_ENABLED=true` + `npx tsx scripts/profile-api-routes.ts`

**Last updated:** July 21, 2026

---

## Table of contents

1. [Refactor goals](#1-refactor-goals)
2. [Current bottlenecks](#2-current-bottlenecks)
3. [Route-level performance concerns](#3-route-level-performance-concerns)
4. [Database / index concerns](#4-database--index-concerns)
5. [Client 360 refactor plan](#5-client-360-refactor-plan)
6. [Lead Command Center refactor plan](#6-lead-command-center-refactor-plan)
7. [Strategy Planner refactor plan](#7-strategy-planner-refactor-plan)
8. [Dashboard refactor plan](#8-dashboard-refactor-plan)
9. [iPad / Safari UX fixes](#9-ipad--safari-ux-fixes)
10. [Background job refactor plan](#10-background-job-refactor-plan)
11. [Auth normalization plan](#11-auth-normalization-plan)
12. [Testing plan](#12-testing-plan)
13. [Step-by-step implementation checklist](#13-step-by-step-implementation-checklist)
14. [Risk level for each task](#14-risk-level-for-each-task)
15. [Rollback notes](#15-rollback-notes)

---

## 1. Refactor goals

| Goal | Success signal |
|------|----------------|
| **Faster list surfaces** | Lead Command Center and Master Pipeline respond with SQL-limited pages; no full-table duplicate scans on every request |
| **Cheaper Client 360 mutations** | Aside/widget mutations do not always re-run full RSC `loadClient360PageData` + strategy refetch |
| **Bounded dashboard queries** | Widgets use `take` / shared context; no duplicate `/api/me/assignments` |
| **Predictable mobile UX** | Tall modals use `dvh`; Safari autofill remains readable; Strategy Planner usable on iPad |
| **Reliable side effects** | Returnable recalculation has retries/observability (not fire-and-forget only) |
| **Simpler auth** | One authentication path (Bearer **or** session) for Client 360 mutation routes |
| **Maintainable Strategy Planner** | Split mega-components; thinner DTOs per view (Board / List / Projection / Overview) |
| **Safe rollout** | Each phase measurable with `[perf]` logs; migrations reversible or additive indexes only |

**Non-goals (preserve product rules):**

- No compounding / IRR / ROI / yield in Strategy Planner
- Backend must not overwrite saved projection milestone values
- Commission formulas and assignment occupancy limits stay as documented
- Do not remove participant-backed vs legacy fallback until backfill is complete and audited

---

## 2. Current bottlenecks

Aligned with shipped performance work already in the reference (`loadStandardDashboardContext`, Client 360 `Promise.all`, admin `unstable_cache` 600s, phase 1/2 indexes) — remaining bottlenecks:

| Area | Bottleneck | Primary symbols |
|------|------------|-----------------|
| **Lead Command Center** | Fetch all matching clients, then slice; full-table duplicate ID scan every list/search | `fetchLeadCommandCenterRows`, `loadDuplicateClientIds` (`lib/leadCommandCenter.ts`) |
| **Master Pipeline** | Loads all clients; filters in browser | `GET /api/admin/pipeline`, `MasterPipelineView` |
| **Client 360 refresh** | Every mutation → `router.refresh()` + `refreshKey++` | `Client360PageClient.triggerDataRefresh` |
| **Client 360 deals** | All deals × all participants in one payload | `getClient360DealsData`, `dealResponseSelect` |
| **Admin / dashboard commission** | Hydrate WON deals + participants (cached 10 min for admin; per-request for standard context) | `adminAnalyticsCache`, `fetchWonDealsWithParticipants*`, `standardDashboardContext` |
| **Dashboard widgets** | Unbounded findMany then `.slice(0, 20)`; duplicate assignments fetch | `buildDealParticipationWidget`, `buildOpenTasksWidget`, `ImportantDatesCalendarWidget` |
| **Strategy Planner** | Large static chunks; full plan include for every view | `StrategyPlanDetailView` (~1.9k LOC), `StrategyPlannerBoard` (~1.6k), `strategyPlanDetailInclude` |
| **Auth** | Repeated `canReadClientCore` / access checks; session-only vs Bearer+session split | `lib/authHelpers.ts`, Client 360 page |
| **Background jobs** | Fire-and-forget returnable recalc; log-only failures | `scheduleReturnableRecalculation` |
| **Indexes** | Hot paths still missing `ClientAssignment(clientId)`, `Client(status)`, `Notification`, etc. | `prisma/schema.prisma` |
| **Legacy paths** | Old dashboard monolith routes; `Strategy`/`Document` models | Docs known limitations |

---

## 3. Route-level performance concerns

Use `PERF_LOGGING_ENABLED=true` and extend `[perf]` tags where missing (Client 360 RSC, LCC, pipeline, strategy plan GET).

| Route / surface | Concern | Target direction |
|-----------------|---------|------------------|
| `GET /api/admin/leads` | In-memory pagination after full match set; dup scan | DB `take`/`skip` (or cursor); cached/precomputed dup flags |
| `GET /api/admin/leads/duplicates` | Heavy email/phone grouping | Dedicated query + indexes; optional TTL cache |
| `GET /api/admin/pipeline` | Unbounded client list | Server filters + cursor/limit |
| Client 360 RSC (`/clients/[id]`) | Full core+deals+hierarchy on every `router.refresh` | Targeted revalidation / client-only widget refresh |
| `GET /api/clients/[id]/strategy-plans/[planId]` | Deep include (steps, expenses, milestones, sources, deals) | View-specific selects (board vs list vs projection) |
| `GET /api/dashboard/widgets/*` | Some widgets still hydrate large deal graphs | Prefer SQL aggregates; cap list widgets |
| `GET /api/me/assignments` | Called twice on dashboard load | Share from page → calendar props |
| Admin funnel/KPIs/leaderboards | Cold miss hydrates all/YTD WON deals | Keep cache; add summary tables or narrower aggregates |
| `GET /api/admin/all-commission-returnable` | Full reconciliation list (~220–250 ms warm) | Pagination + filters server-side |
| Activity feed APIs | Assignment-scoped correlated SQL — OK at moderate scale | Monitor; ensure LIMIT always applied |
| Legacy `GET /api/dashboard/standard`, `GET /api/get-dashboard-data` | Compat/tests only; risk of accidental use | Deprecate gate or remove after test migration |

**Already healthy (do not regress):**

- Per-widget dashboard endpoints + skeleton loaders
- `fetchDealAggregatesByClientIds` SQL GROUP BY
- Activity feed `UNION ALL` with limit
- Admin analytics auth-before-cache + `force-dynamic`
- Client 360 lazy workspace tabs

---

## 4. Database / index concerns

### Already shipped (keep)

| Migration / area | Covers |
|------------------|--------|
| Phase 1 `20260617003208_add_performance_indexes` | Deals, interactions, activity logs, read status |
| Phase 2 `20260624084311_add_performance_indexes_phase_2` | Assignments (`userId`), tasks (`assigneeId,status,dueDate`), deals, returnables |
| Phase 3 `20260721020000_add_performance_indexes_phase_3` | Client filters, assignment `clientId`, notifications, tasks/documents/`dealId` returnables, source `(clientId, receivedAt)`, `pg_trgm` search GINs |
| Strategy / contacts / important dates | Plan/milestone/contact indexes as in schema |

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

### Recommended next indexes (additive) — largely shipped in phase 3

| Priority | Index | Why |
|----------|-------|-----|
| Done | `ClientAssignment(clientId)` / composites | Auth, LCC, hierarchy |
| Done | `Client(status)` / `(status, lastModified)` | LCC, funnel, pipeline |
| Done | `Notification(recipientUserId, …)` | Inbox |
| Done | `Task(clientId)`, `ClientDocument(clientId)`, `CommissionReturnable(dealId)` | Client 360 / returnables |
| Done | `pg_trgm` on Client + contact value | ILIKE search |
| Later | Occupancy partial uniques | After data cleanup |

1. LCC: push `LIMIT` into Prisma/`findMany` before post-filters where post-filters allow; otherwise materialize attention/dup flags.
2. Duplicate detection: avoid full-table scan per LCC request — use `GET /api/admin/leads/duplicates` path + short TTL cache or nightly snapshot.
3. Company hierarchy: `take` + order colleagues.
4. Deal participation / open tasks: `take` at DB layer.
5. Won-deal hydrates: long-term replace with pre-aggregated commission read models.

---

## 5. Client 360 refactor plan

**Current (docs):** Server `Promise.all` for core + deals + hierarchy; workspace tabs lazy; mutations call `router.refresh()`.

### Phase A — Refresh narrowing (high impact, medium risk)

1. Split `triggerDataRefresh` into scopes: `core` | `deals` | `hierarchy` | `workspace` | `strategy` | `all`.
2. Default aside mutations (details, team, hierarchy) to client refetch of that widget **or** soft state update — avoid full RSC refresh when possible.
3. Keep `router.refresh()` for stage change, merge, archive, and true server-prop dependencies.
4. Strategy widget: refetch plans/detail only when strategy mutations succeed — not on every `refreshKey` from unrelated widgets.

### Phase B — Payload slimming

1. Deals list: summary DTO (id, name, status, type, totals, participant count) without full participant trees.
2. Expand participants on deal edit / single-deal GET only.
3. Activity workspace: keep caps (300/300); consider content truncation for list rows.
4. Hierarchy: limit colleagues; paginate if needed.
5. Avoid legacy `client360Include` unbounded paths in any live route.

### Phase C — Auth / load once

1. Resolve access once per request (`canReadClientCore`, deal access) and pass down — stop repeated checks on page load.
2. Align Client 360 APIs with Bearer+session (see §11) so `authenticatedFetch` is consistent.

### Phase D — UX polish

1. Skeleton loaders for Client 360 (docs: currently pulse placeholders only).
2. Dynamic-import `DealEditModal` from `DealInfoWidget`.

**Key files:** `lib/client360.ts`, `src/app/clients/[id]/page.tsx`, `Client360PageClient.tsx`, `DealInfoWidget.tsx`, `WorkspacePanel.tsx`, `ClientStrategyBuilderWidget.tsx`.

---

## 6. Lead Command Center refactor plan

**Current (docs):** Compact inbox, attention scoring, filters, preview drawer, bulk actions; lib `leadCommandCenter.ts`.

### Done — Split inbox vs preview payloads

1. Slim `LeadCommandCenterRow` for `GET /api/admin/leads` (no full `sources[]`, activity summary, tags, expectations/role).
2. Cap inbox source sample; use `_count` for `sourceRecordCount`; light activity timestamps for attention only.
3. `GET /api/admin/leads/[id]/preview` returns `LeadCommandCenterPreview`; drawer loads on open with loading/error/retry.
4. Merge selected loads preview details per selected id before opening `MergeClientsModal`.

### Phase A — Stop load-all-then-slice

1. Apply Prisma `take`/`skip` (or cursor) to the primary client query for the default inbox path.
2. Document which post-filters (`needsAttention`, dup flags, latest-source) break pure SQL pagination — migrate those filters to indexed columns or computed fields over time.
3. Cap nested includes (e.g. sourceRecords: latest N only). ✅ (inbox sample + preview full history)

### Phase B — Duplicate detection

1. Remove full-table `loadDuplicateClientIds` from every list/search request.
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

## 7. Strategy Planner refactor plan

**Product constraints (do not break):** Timeline economics are planning arithmetic only; suggestions require advisor **Use suggested values**; backend never overwrites saved milestones; Overview is read-only.

### Phase A — Bundle / render

1. Dynamic-import `StrategyPlanDetailView`, large modals (`StrategyProjectionMilestoneEditModal`, step/expense modals).
2. Lazy-load Board vs List vs Projection by active view preference (not all three heavy trees at once).
3. Cap strategy refetch: only on strategy mutations and plan switch.

### Phase B — API DTOs

1. Introduce view-specific loaders:
   - **List:** steps summary + economics fields needed for list cards
   - **Board:** steps, connections, expenses (current board needs)
   - **Projection:** milestones + source links + suggestion inputs
   - **Overview:** reuse `clientStrategyReportHelpers` from existing detail or a report-shaped select
2. Keep write APIs validating via `clientStrategyValidation.ts` unchanged in behavior.

### Phase C — Code structure

1. Split `StrategyPlanDetailView` into container + Board/List/Projection tabs.
2. Extract shared display formatting (`strategyTimelineEconomicsDisplay`, `formatMoney`) — already partially done.
3. Prefer pure helpers in `lib/clientStrategyTimelineCalculations.ts` / projection / report helpers for tests; keep UI thin.

### Phase D — Mobile

1. Board: touch-friendly scroll; avoid requiring hover-only actions.
2. Projection modal: sectioned accordion on small screens; `90dvh` max height.
3. Overview print path: verify iPad Safari print layout separately (browser print only).

**Key files:** `lib/clientStrategyPlans.ts`, `lib/clientStrategyReportHelpers.ts`, `lib/clientStrategyTimelineCalculations.ts`, `ClientStrategyBuilderWidget.tsx`, `StrategyPlannerBoard.tsx`, `StrategyPlanDetailView.tsx`, projection/step/expense modals, overview page/components.

---

## 8. Dashboard refactor plan

**Current (docs):** Per-widget APIs; shared `standardDashboardContext`; SQL deal aggregates; skeletons on standard dashboard; admin analytics cached 600s.

### Phase A — Quick wins

1. Deduplicate `/api/me/assignments` (page loads once; pass CLIENT/LEAD visibility into `ImportantDatesCalendarWidget`).
2. Add `take` to `buildDealParticipationWidget` and `buildOpenTasksWidget`.
3. Ensure all live widgets use shared context or aggregates — no accidental standalone full hydrates in hot paths.

### Phase B — Admin surfaces

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

## 9. iPad / Safari UX fixes

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

## 10. Background job refactor plan

**Current (docs):** Assignment add/remove → `scheduleReturnableRecalculation` → fire-and-forget `POST /api/tasks/recalculate-returnables`; no retry queue. Suitable for Inngest/Vercel Cron.

### Phase A — Observability (low risk)

1. Structured log on schedule + success/failure with `userId`, `clientId`, duration.
2. Metric/counter or admin-visible “last recalc error” optional.
3. Idempotent endpoint behavior already expected — preserve it.

### Phase B — Reliability

1. Introduce job table or use Inngest/Vercel Cron / queue:
   - Enqueue on assignment change
   - Worker runs `recalculateReturnablesForUserOnClient`
   - Retry with backoff; dead-letter after N failures
2. Keep synchronous path available for admin scripts (`recalculate-commission-returnables.ts`).

### Phase C — Scope control

1. Avoid recalculating entire org on single assignment change.
2. Batch bulk-assign carefully (debounce or one job per user-client pair).

**Key files:** `scheduleReturnableRecalculation` call sites (assignment APIs, bulk assign), `POST /api/tasks/recalculate-returnables`, returnable generation libs.

---

## 11. Auth normalization plan

**Current (docs known limitation):** Bearer+session on dashboard/returnables/details/employees/Client 360 core; session-only on interactions, strategy, tasks, deals.

### Phase A — Inventory

1. List every route using `getAuthenticatedUser()` vs `getAuthenticatedUserFromRequest()`.
2. Confirm all client `fetch` helpers send `credentials: 'same-origin'` and optional Bearer.

### Phase B — Unify Client 360 mutations

1. Migrate session-only Client 360 routes to `getAuthenticatedUserFromRequest` (Bearer **or** session fallback).
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

## 12. Testing plan

### Baseline (before each phase)

```bash
PERF_LOGGING_ENABLED=true npm run dev
npx tsx scripts/profile-api-routes.ts
# Capture: LCC list, pipeline, Client 360 load, dashboard widgets, strategy plan GET
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
| Full | `npm run test:all` (needs running server) |
| Typecheck / build | `npx tsc --noEmit`, `npm run build` |

### New / extended tests (as phases land)

| Change | Test |
|--------|------|
| LCC pagination | Assert SQL limit behavior; smoke test pagination + filters |
| Indexes | Migration apply on staging; `EXPLAIN` on hot queries (optional script) |
| Client 360 refresh scopes | Component or integration: details save does not refetch strategy |
| Auth unification | Same route succeeds with session cookie and with Bearer+cookie |
| Returnable jobs | Fake queue: retry on failure; idempotent second run |
| Modal `dvh` | Manual iPad checklist (no browser E2E required initially) |

### Manual QA checklist

- [ ] Standard dashboard widgets load independently; calendar dates correct for CLIENT/LEAD
- [ ] Admin KPIs within 10 min cache expectation; pipeline paginates/filters
- [ ] LCC inbox, search, filters, preview, bulk, merge, duplicates panel
- [ ] Client 360: stage, details, deals, team, hierarchy, workspace tabs
- [ ] Strategy: Board / List / Projection / Overview; suggestions still click-to-apply
- [ ] iPad Safari: login autofill, Deal Edit, Strategy milestone modal, LCC drawer
- [ ] Assignment change eventually updates returnables (after job phase: reliably)

---

## 13. Step-by-step implementation checklist

Execute in order unless a later item is explicitly pulled forward as a quick win.

### Wave 0 — Measure

- [ ] Enable `PERF_LOGGING_ENABLED` on staging/local; record baseline timings for LCC, pipeline, Client 360, widgets, strategy GET
- [ ] Note production DB size (#clients, #deals, #WON deals, #source records)

### Wave 1 — Indexes & query caps (low risk)

- [ ] Migration: `ClientAssignment(clientId)` (+ unique/composite with `userId` if appropriate)
- [ ] Migration: `Client(status)` (and/or composite with sort columns used by LCC)
- [ ] Migration: `Notification(recipientUserId, isRead, …)`
- [ ] Migration: `Client(company)`, `Task(clientId)`, `ClientDocument(clientId)`, optional source/participant composites
- [ ] Cap deal-participation and open-tasks queries with `take`
- [ ] Cap hierarchy colleagues with `take`
- [ ] Deduplicate dashboard `/api/me/assignments`

### Wave 2 — Mobile viewport & code-splitting (low risk)

- [ ] Convert tall modals from `vh` → `dvh` (Deal Edit first)
- [ ] `next/dynamic` for `DealEditModal`, `StrategyPlanDetailView`, heavy strategy modals
- [ ] Lazy Strategy Board/List/Projection by active view

### Wave 3 — Client 360 refresh & payloads (medium risk)

- [ ] Scoped refresh API in `Client360PageClient`
- [ ] Stop strategy refetch on unrelated mutations
- [ ] Slim deals list DTO; lazy-load full participants
- [ ] Request-scoped access resolution on Client 360 page
- [ ] Optional Client 360 skeletons

### Wave 4 — Lead Command Center (medium–high risk)

- [ ] DB-level `take`/`skip` on primary list path
- [ ] Remove per-request full-table dup scan; cache or precompute
- [ ] Narrow sourceRecords include
- [ ] Split LCC page components
- [ ] Extend LCC smoke tests for pagination

### Wave 5 — Admin pipeline & dashboard depth (medium–high risk)

- [ ] Pipeline server filters + cursor/limit
- [ ] Admin skeleton polish (optional)
- [ ] Plan commission summary/read-model spike (design only → implement if approved)

### Wave 6 — Strategy Planner maintainability (medium risk)

- [ ] View-specific plan selects
- [ ] Split `StrategyPlanDetailView` modules
- [ ] Mobile accordion / board scroll fixes
- [ ] Keep all strategy unit/integration tests green

### Wave 7 — Auth normalization (medium risk)

- [ ] Migrate Client 360 session-only routes to Bearer+session
- [ ] Slim/`cache` deal access helpers
- [ ] Update auth-sensitive tests

### Wave 8 — Background jobs (higher ops risk)

- [ ] Logging + failure visibility
- [ ] Queue/Cron/Inngest with retries
- [ ] Bulk-assign job batching
- [ ] Runbook: replay failed returnable jobs

### Wave 9 — Legacy retirement (after deps cleared)

- [ ] Deprecate legacy dashboard monolith routes
- [ ] Plan retirement of Prisma `Strategy` / `Document` if unused
- [ ] Update `DATABASE_AND_UI_REFERENCE.md` shipped/performance tables + known limitations

---

## 14. Risk level for each task

| ID | Task | Risk | Notes |
|----|------|------|-------|
| W1.1 | Assignment `clientId` index | **Low** | Additive migration; verify unique constraints |
| W1.2 | Client `status` index | **Low** | Additive |
| W1.3 | Notification indexes | **Low** | Additive |
| W1.4 | Company / task / document indexes | **Low** | Additive; watch migration time on large tables |
| W1.5 | Widget `take` caps | **Low** | Confirm UI still shows enough rows |
| W1.6 | Dedupe assignments fetch | **Low** | Calendar filter regression risk small |
| W2.1 | `vh` → `dvh` | **Low** | Visual QA on iPad |
| W2.2 | Dynamic imports | **Low** | Loading flash; Suspense fallbacks |
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
| W8.1 | Returnable queue | **High** (ops) | Missed liabilities if jobs fail silently again |
| W9.1 | Remove legacy routes/models | **High** | Hidden consumers / scripts |

**Risk legend:** Low = additive/reversible · Medium = behavior change needing careful QA · High = money, auth, or data-loss adjacent.

---

## 15. Rollback notes

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
| **Auth helper migration** | Revert route to `getAuthenticatedUser()`; ensure cookies still sent |
| **Returnable queue** | Re-enable fire-and-forget `fetch`; run `npx tsx scripts/recalculate-commission-returnables.ts` to repair |
| **Commission read models** | Serve from live hydrate path; invalidate cache keys |
| **Legacy route removal** | Restore route files from git; keep tests pointing at restored paths |

**Release practice:**

1. Ship Wave 1–2 behind normal `deploy` with migrate deploy on Vercel build.
2. For Wave 3–5, prefer feature flags or dual-read for one release.
3. Never force-push `deploy`; revert with forward-fix commits.
4. After each wave: update this plan checkboxes + `DATABASE_AND_UI_REFERENCE.md` performance / known-limitations rows.

**Data safety:** No refactor in this plan should rewrite deal amounts, milestone saved values, or merge history. Returnable jobs must remain idempotent and must not overwrite **paid** returnable rows (existing rule).

---

## Appendix A — Priority map (audit → waves)

| Audit theme | Wave |
|-------------|------|
| Missing indexes | W1 |
| Dashboard over-fetch / duplicate assignments | W1 |
| Modal `dvh` + dynamic imports | W2 |
| Client 360 `router.refresh` fan-out | W3 |
| Large Client 360 deal payloads | W3 |
| LCC load-all + dup scan | W4 |
| Admin pipeline all-data | W5 |
| Strategy component bloat | W6 |
| Mixed auth patterns | W7 |
| Silent background jobs | W8 |
| Legacy paths | W9 |

## Appendix B — Related documents

- `docs/DATABASE_AND_UI_REFERENCE.md` — schema, APIs, permissions, performance architecture, known limitations
- `docs/deal-participant-migration.md` — participant backfill (commission correctness before aggressive read models)
- `docs/USER_MANUAL_*.md` — end-user behavior to preserve during UX changes

---

*This plan does not modify application code by itself. Implement only after explicit approval per wave.*
