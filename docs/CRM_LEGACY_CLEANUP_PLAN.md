# CRM Legacy Cleanup Plan

> Planning document only — derived from `docs/DATABASE_AND_UI_REFERENCE.md` and current code.  
> **Do not treat this as permission to delete production data.** Execute phases after audits and backfills pass.

**Last updated:** July 21, 2026  
**Related:** `docs/DATABASE_AND_UI_REFERENCE.md`, `docs/deal-participant-migration.md`, `docs/CRM_PERFORMANCE_REFACTOR_PLAN.md`

---

## Goals

1. Reduce dual-write / dual-read complexity without breaking Client 360, LCC, dashboards, or commission math.
2. Make “canonical” stores obvious (table rows over JSON/mirrors; participants over assignment pools).
3. Retire dead routes and unused models only after callers and tests are gone.
4. Keep money-critical paths (`DealParticipant`, returnables, secured commission) correct throughout.

---

## Inventory (nine legacy paths)

### 1. `Client.important_dates` JSON dual-write

| | |
|--|--|
| **Current purpose** | Rollback mirror of `ClientImportantDate` rows as `{ label, date }` (no time). Readers prefer table rows when any exist; fall back to JSON only when the client has **zero** table rows. Mutations dual-write via `syncLegacyImportantDatesJson`. |
| **Risk of removal** | **Medium.** Clients still only on JSON (never edited after migration) disappear from calendar until backfilled; list APIs that fall back to JSON would empty if column dropped without a final backfill. |
| **Dependencies** | `lib/importantDates.ts`, `lib/importantDateApi.ts`, `PUT .../details`, important-dates CRUD, merge JSON merge step, Client 360 `importantDates` payload, tests `test:important-dates` / `test:important-dates-calendar`. |
| **Migration / backfill** | Audit: clients with JSON length > 0 and **zero** table rows. Backfill remaining into `client_important_dates` (invalid dates skipped, same as migration `20260715184000`). Calendar already table-only — fix those owners first. |
| **Tests needed** | Count audit script; backfill dry-run; calendar shows previously JSON-only owners; list APIs unchanged after dual-write stop; merge still correct. |
| **Never remove yet** | Table `client_important_dates` itself; API/UI for date+time. |

---

### 2. `Client.email` / `Client.phone` scalar mirrors vs `ClientContact`

| | |
|--|--|
| **Current purpose** | Primary mirrors of first/`isPrimary` contacts for LCC columns, legacy search scalars, merge field choices, simple displays. Full multi-value lives in `client_contacts`. `replaceClientContacts` keeps mirrors in sync. |
| **Risk of removal** | **High** if dropped early. Many queries still select `Client.email`/`phone`; search uses both scalars and contacts; dup detection uses both. |
| **Dependencies** | `lib/clientContacts.ts`, create/details/ingest, LCC inbox select, global search, duplicates, merge, dashboards. |
| **Migration / backfill** | Already backfilled in `20260715211000_add_client_contacts`. Ongoing: ensure every non-empty scalar has a matching contact row; fix orphans (contact without mirror / mirror without contact). |
| **Tests needed** | `test:client-contacts`; search/dupe with contact-only and scalar-only; create/update keeps mirrors = primary. |
| **Never remove yet** | `client_contacts` table; normalized match fields. Scalars should stay as **denormalized primaries** until all readers use contacts (long-term). |

---

### 3. Legacy client-level `DOCTOR` assignments

| | |
|--|--|
| **Current purpose** | Historical team rows. **New** `DOCTOR` client assignments rejected (`400`). Still grant deal view/create/manage-all via `getDealAccessForClient`, strategy manage via `canManageClientStrategy`, dashboard “legacy doctor” client list, and legacy commission/returnable occupancy. |
| **Risk of removal** | **High** while any user relies on client-level DOCTOR for access or legacy commission math. Removing rows without deal-level `DealParticipant` DOCTOR rows locks users out of deals/strategy. |
| **Dependencies** | Assignments API reject path, `AssignedTeamWidget` collapsed legacy list, deal access, strategy permissions, `calculate*` legacy pools, returnable recalc (`isUserStillDoctor` on client assignment). |
| **Migration / backfill** | For each legacy DOCTOR assignment: ensure `DealParticipant` DOCTOR on relevant deals (or explicit business decision). Audit count of `ClientAssignment` where `role = DOCTOR`. Prefer participant backfill + access via deal participants before deleting assignment rows. |
| **Tests needed** | Assignment POST rejects DOCTOR; legacy DOCTOR still can view/manage per current matrix until cutover; after cutover, only deal DOCTOR participants manage. |
| **Never remove yet** | `AssignmentRole.DOCTOR` enum value (historical rows + code paths) until participant migration complete and access rules rewritten. |

---

### 4. Legacy commission fallback (deals without participants)

| | |
|--|--|
| **Current purpose** | `commissionModel: LEGACY_FALLBACK` when a deal has zero `DealParticipant` rows. Secured commission, company earnings, and some returnable paths use client-assignment pool rates (`lib/commissionCalculations.ts`). |
| **Risk of removal** | **Critical (money).** Wrong commissions/returnables if fallback removed before 100% participant coverage and returnable config. |
| **Dependencies** | `formatDealResponse`, Deal Info amber warning, dashboard performance metrics, admin KPIs, returnable generation/recalc, `npm run audit:legacy-commission`, `backfill:deal-participants`, `verify:deal-participants`. |
| **Migration / backfill** | 1) `audit:legacy-commission` → 2) `backfill:deal-participants:dry` → 3) backfill → 4) verify → 5) configure doctor returnables on deals → 6) `recalculate-commission-returnables` → 7) only then refuse empty-participant WON deals / remove fallback. |
| **Tests needed** | Existing participant + returnable suites; post-backfill audit = 0 fallback WON deals (or agreed exceptions); secured commission parity checks on sample deals. |
| **Never remove yet** | Fallback code and pool constants until audit is clean **and** product signs off. Do not drop `DealParticipant` or returnable explicit fields. |

---

### 5. Legacy dashboard monolith endpoints

| | |
|--|--|
| **Current purpose** | `GET /api/dashboard/standard` — shared context + all widgets (tests / profiling / backward compat). `GET /api/get-dashboard-data` — older client list. Live UI uses per-widget routes. |
| **Risk of removal** | **Low–medium.** Breaks `test:http` / activity tests / `profile-api-routes` if deleted without updating scripts. No live UI dependency if widgets stay. |
| **Dependencies** | `lib/standardDashboard.ts`, `loadStandardDashboardContext`, `scripts/test-activity-apis.ts`, `scripts/profile-api-routes.ts`, docs perf baselines. |
| **Migration / backfill** | None for data. Update tests to hit per-widget routes (or one thin smoke). |
| **Tests needed** | Replace monolith assertions with widget + `/api/me/assignments` coverage. |
| **Never remove yet** | Per-widget APIs and `loadStandardDashboardContext` shared helpers (still useful). |

---

### 6. Legacy `Strategy` + `Document` vs `strategyText` + Strategy Planner

| | |
|--|--|
| **Current purpose** | Old named `Strategy` / strategy-linked `Document` models. Client 360 free-text uses `Client.strategyText` (`PUT .../strategy`). Structured planning uses `ClientStrategyPlan` (+ steps/expenses/milestones). `resolveStrategyText` may fall back to old Strategy rows for display. User delete cleans `strategy` by `authorId`. |
| **Risk of removal** | **Medium** for table drop (historical text loss). **Low** if unused in UI and only empty/orphan rows remain. Confusing to remove `strategyText` while Strategy Planner exists — free-text and planner serve different jobs. |
| **Dependencies** | `lib/client360.ts` resolve, user DELETE, Prisma relations, possibly unused UI. `ClientDocument` (client file uploads) is **not** the legacy `Document` model — do not conflate. |
| **Migration / backfill** | Export/archive any non-empty `Strategy` descriptions into `strategyText` or notes if still valuable. Confirm no API routes CRUD `Strategy`/`Document` in live app. |
| **Tests needed** | Client 360 still shows strategy text; planner unaffected; user delete still succeeds without Strategy rows. |
| **Never remove yet** | `Client.strategyText`, `ClientStrategyPlan` tree, `ClientDocument` uploads. |

---

### 7. NextAuth placeholder route

| | |
|--|--|
| **Current purpose** | `/api/auth/[...nextauth]` with placeholder credentials. Live auth is Supabase + JWT (`POST /api/auth/token`). `Providers` may still wrap legacy `SessionProvider`. |
| **Risk of removal** | **Low** if nothing imports NextAuth session for API auth. Confirm no env-dependent prod reliance on `NEXTAUTH_SECRET` beyond `lib/jwt.ts` (JWT signing shares the secret name in docs). |
| **Dependencies** | `next-auth` package, `Providers.tsx`, env `NEXTAUTH_SECRET` (also used for app JWTs — **keep secret**, remove route carefully). |
| **Migration / backfill** | None. Remove route + unused NextAuth config; keep JWT signing. Strip `SessionProvider` if unused. |
| **Tests needed** | Login, token issue, Bearer APIs, middleware session redirects. |
| **Never remove yet** | Supabase auth, `POST /api/auth/token`, `lib/jwt.ts`, `NEXTAUTH_SECRET` (or rename later with migration). |

---

### 8. Polymorphic `activity_read_status` IDs

| | |
|--|--|
| **Current purpose** | Composite PK `(activity_log_id, user_id)` marks feed items read. `activity_log_id` may be an `Interaction.id` **or** `ClientActivityLog.id` (no FK). |
| **Risk of removal / redesign** | **Medium–high.** Wrong unread badges if IDs collide across tables or mark-read targets the wrong source. Schema change needs dual-write period. |
| **Dependencies** | `lib/activityFeed.ts`, `POST /api/activity/mark-read`, dashboard activity widgets (standard + superadmin). |
| **Migration / backfill** | Introduce `activity_source` enum (`INTERACTION` \| `SYSTEM_LOG`) + composite uniqueness; backfill by probing both tables; keep old column until readers updated. |
| **Tests needed** | Mark-read for interaction vs system log; unread counts; no cross-table collision cases in fixtures. |
| **Never remove yet** | Read tracking feature itself; do not add a single FK until source is explicit. |

---

### 9. Archived client restore limitations

| | |
|--|--|
| **Current purpose** | Soft archive via `POST .../archive` → `status: ARCHIVED`. Merge sets duplicates to `ARCHIVED`. No dedicated un-archive API; super admin can `PATCH` status (docs / super-admin manual). Funnel/advance logic exclude `ARCHIVED`. |
| **Risk of “cleanup”** | Treating archive as hard-delete loses audit trail. Blind restore can reintroduce duplicates post-merge. |
| **Dependencies** | Archive modal, LCC filters, funnel, merge, permissions (archived often hidden). |
| **Migration / backfill** | Product decision: formal `POST .../restore` with guards (block restore if merge-archived without admin override). Optional: distinguish `ARCHIVED` vs `MERGED` status later. |
| **Tests needed** | Archive → invisible in default lists; PATCH restore; merge-archived restore policy. |
| **Never remove yet** | Soft-archive (do not force hard-delete only); `LeadMergeAudit`. |

---

## What should never be removed yet

1. **Money path:** `DealParticipant`, explicit returnable fields, participant-backed secured commission / company earnings.
2. **Canonical CRM stores:** `ClientImportantDate`, `ClientContact`, `ClientStrategyPlan` (+ nested), `ClientDocument` (uploads).
3. **Auth:** Supabase session + JWT token route; deactivated-user checks.
4. **Soft archive + merge audit** history.
5. **Assignment roles `RELATIONSHIP` / `ACCOUNT_SERVICE`** (active team model).
6. **Primary email/phone mirrors** until every reader is contact-based (treat as denormalized, not “dead”).

---

## Safe retirement sequence

Execute in order; stop if audits fail.

```text
Phase A — Observe & backfill (no deletions)
  A1. Important dates: audit JSON-only clients → backfill table → calendar QA
  A2. Contacts: audit scalar/contact drift → repair mirrors
  A3. Commission: audit:legacy-commission → dry backfill → backfill → verify
  A4. Legacy DOCTOR assignments: inventory + map to deal participants
  A5. Strategy/Document: count non-empty Strategy rows; decide archive vs ignore

Phase B — Stop writing legacy (keep reading)
  B1. Important dates: stop dual-write; keep JSON column nullable unused
  B2. Dashboard: point remaining tests at widgets; deprecate monolith in docs
  B3. NextAuth: remove route + SessionProvider if unused; keep JWT secret

Phase C — Stop reading legacy
  C1. Important dates: remove JSON fallback readers after A1 clean
  C2. Commission: reject create/update WON without participants (or force defaults)
  C3. DOCTOR client assignment: remove access grants once participants cover users
  C4. strategyText fallback from Strategy table: remove after A5

Phase D — Drop schema / code
  D1. Drop Client.important_dates column
  D2. Remove LEGACY_FALLBACK branches (after C2 + long soak)
  D3. Delete /api/dashboard/standard + /api/get-dashboard-data
  D4. Drop Strategy + Document tables (after export)
  D5. Optional: activity_read_status source column migration
  D6. Optional: formal client restore API (feature, not deletion)
```

---

## Quick cleanup tasks (low risk, near-term)

| # | Task | Outcome |
|---|------|---------|
| Q1 | Script: count clients with legacy important-dates JSON and 0 table rows | Unblocks calendar gaps |
| Q2 | Script: count `LEGACY_FALLBACK` WON deals; run `audit:legacy-commission` on schedule | Visibility |
| Q3 | Script: count `ClientAssignment` where `role = DOCTOR` | Access risk inventory |
| Q4 | Confirm live UI never calls `/api/dashboard/standard` or `/api/get-dashboard-data` | Safe deprecation |
| Q5 | Confirm NextAuth route unused in browser network / imports | Safe delete candidate |
| Q6 | Count `Strategy` / `Document` rows with content | Decide export |
| Q7 | Docs-only: mark monolith + NextAuth as “deprecated, remove in Phase B/D” in SoT | Align team |
| Q8 | Ensure every create/update path that sets email/phone also writes `ClientContact` (already intended) | Drift prevention |

---

## Long-term cleanup tasks

| # | Task | Depends on |
|---|------|------------|
| L1 | Stop important-dates dual-write; later drop JSON column | Q1 + backfill |
| L2 | Finish deal participant backfill; remove assignment-pool commission fallback | Q2 + business sign-off |
| L3 | Migrate legacy DOCTOR access to deal participants only; then delete/ignore client DOCTOR rows | Q3 + L2 |
| L4 | Delete dashboard monolith endpoints; update HTTP tests | Q4 |
| L5 | Remove NextAuth placeholder; slim Providers | Q5 |
| L6 | Archive/drop `Strategy` + `Document` models | Q6 |
| L7 | Typed activity read receipts (`source` + id) | Feed redesign capacity |
| L8 | Dedicated client restore API (+ optional MERGED vs ARCHIVED) | Product |
| L9 | Make `ClientContact` sole source in LCC/search UI; keep scalars as write-through cache only | Contacts maturity |
| L10 | Clarify free-text `strategyText` vs Strategy Planner (UI copy / optional migrate text into a plan note) | Product |

---

## Per-area checklist template (use when executing)

For each legacy path:

- [ ] Audit query / counts in prod or staging  
- [ ] Backfill dry-run reviewed  
- [ ] Backfill applied  
- [ ] Tests updated / green  
- [ ] Dual-write stopped (if applicable)  
- [ ] Dual-read stopped  
- [ ] Code removed  
- [ ] Schema migration (if dropping columns/tables)  
- [ ] SoT doc updated (`DATABASE_AND_UI_REFERENCE.md`)  

---

## Suggested owners / commands (existing tooling)

```bash
# Commission legacy
npm run audit:legacy-commission
npm run backfill:deal-participants:dry
npm run backfill:deal-participants
npm run verify:deal-participants
npx tsx scripts/recalculate-commission-returnables.ts

# Related tests
npm run test:deal-participants
npm run test:deal-returnables
npm run test:deal-participant-api
npm run test:important-dates
npm run test:important-dates-calendar
npm run test:client-contacts
npm run test:client-strategy
```

---

## Out of scope for this plan

- Rewriting Strategy Planner timeline/projection product rules  
- Hard-deleting archived clients by default  
- Removing multi-email/phone product support  
- Changing middleware `/admin` role enforcement (auth hardening, separate track)  
- Inngest/external queue migration beyond existing `BackgroundJob` table  

---

## Summary recommendation

| Priority | Focus |
|----------|--------|
| **Do first** | Important-dates JSON-only backfill; commission participant audit/backfill; DOCTOR assignment inventory |
| **Do soon** | Deprecate dashboard monolith + NextAuth route (code deletion after caller check) |
| **Do later** | Drop fallback commission math; drop JSON column; drop Strategy/Document; typed activity reads |
| **Do not rush** | Removing email/phone scalars; removing soft-archive; removing participant returnable model |
