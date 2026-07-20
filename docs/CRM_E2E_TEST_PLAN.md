# CRM E2E Test Plan (Playwright)

> **Status:** Plan only — Playwright is **not** installed or configured in this repo yet.  
> **Source of truth for product behavior:** `docs/DATABASE_AND_UI_REFERENCE.md`  
> **Created:** July 21, 2026

## Current state

| Check | Result |
|-------|--------|
| `@playwright/test` in `package.json` | ❌ Not present |
| `playwright.config.*` | ❌ None |
| `e2e/` or `tests/e2e/` specs | ❌ None |
| npm scripts (`test:e2e`, etc.) | ❌ None |
| Lockfile mention | Optional peer of Next.js only (`peerDependenciesMeta` optional) — **not installed** |

Do **not** treat Next’s optional `@playwright/test` peer as project E2E tooling.

**Existing coverage (non-E2E):** `npm run test:unit`, `test:integration`, `test:http` / `test:all:with-http` (see §14 of the database/UI reference). Those scripts do **not** replace browser E2E.

---

## Goals

1. Protect the highest-value CRM UI flows with browser automation.
2. Keep E2E lean: smoke + critical path, not full visual regression.
3. Prefer stable selectors (`data-testid`) added when Playwright is introduced; until then, plan against current labels/routes.
4. Isolate destructive flows (merge) to disposable fixtures.

---

## Prerequisites (when installing later)

### Install (deferred — do not run until approved)

```bash
npm init playwright@latest
# or: npm i -D @playwright/test && npx playwright install
```

Suggested layout:

```
playwright.config.ts
e2e/
  auth.setup.ts
  login.spec.ts
  dashboard-standard.spec.ts
  dashboard-admin.spec.ts
  client-360.spec.ts
  important-dates.spec.ts
  deal-participants.spec.ts
  strategy-planner.spec.ts
  lead-command-center.spec.ts
  merge-leads.spec.ts
  webkit-form-color.spec.ts
  fixtures/
    users.ts
    seed.ts          # optional Prisma seed for E2E clients/plans
```

### Runtime requirements

| Need | Notes |
|------|--------|
| App server | `npm run dev` or `npx playwright` `webServer` → `next start` after build |
| Base URL | `http://localhost:3000` (match `TEST_BASE_URL` convention) |
| Env | Same `.env` as local CRM (`DATABASE_URL`, Supabase keys) |
| Test users | One **STANDARD_USER** (with RELATIONSHIP client) + one **SUPER_ADMIN** |
| Secrets | `E2E_STANDARD_EMAIL` / `E2E_STANDARD_PASSWORD` / `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` (never commit) |

### Auth strategy

Login UI flow (documented):

```
/login → Supabase signInWithPassword → User.status check
      → POST /api/auth/token → localStorage.token
      → /dashboard
```

Recommended Playwright approach:

1. **UI login once** in `auth.setup.ts` (storageState per role).
2. Or **session cookie + token** seeded via API if UI login is flaky — still assert one UI login smoke test.
3. Middleware protects `/dashboard`, `/admin/*`, `/clients/*`; unauthenticated → `/login`.
4. Role for `/admin` is **not** enforced in middleware — assert 403/redirect UX and API behavior for standard users separately.

### Selectors policy

Before writing many specs, add `data-testid` on:

| Area | Suggested ids |
|------|----------------|
| Login | `login-email`, `login-password`, `login-submit` |
| Dashboard widgets | `widget-assigned-clients`, `widget-open-tasks`, `widget-activity`, `widget-performance`, `widget-important-dates-calendar` |
| Client 360 | `client-360-header`, `client-details-edit`, `workspace-tab-strategy-planner` |
| Strategy view toggle | `strategy-view-board`, `strategy-view-list`, `strategy-view-projection` |
| Projection modal | `projection-milestone-modal`, `apply-suggested-values` |
| LCC | `lcc-filter-panel`, `lcc-row`, `lcc-preview-drawer`, `lcc-merge-selected` |
| Deal modal | `deal-edit-modal`, `deal-participants-section` |

Until then, use role/label locators from the tables below.

### CI recommendation (later)

- Job: Chromium only on PR; nightly Chromium + WebKit.
- `test:e2e` **not** part of `npm run test:all` (server + credentials).
- Optional `test:e2e:webkit` for flow 13.

---

## How to run (after install)

```bash
# Terminal A
npm run dev

# Terminal B
npx playwright test
npx playwright test --project=chromium
npx playwright test --project=webkit          # iPad/Safari color smoke
npx playwright test e2e/login.spec.ts
npx playwright show-report
```

Config sketch:

```ts
// playwright.config.ts (proposed)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // safer with shared DB fixtures
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/standard.json' },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], storageState: 'playwright/.auth/standard.json' },
      dependencies: ['setup'],
    },
    {
      name: 'ipad',
      use: { ...devices['iPad Pro 11'], storageState: 'playwright/.auth/standard.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Proposed npm scripts (when installing):

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:webkit": "playwright test --project=webkit --project=ipad"
```

---

## Priority matrix

| # | Flow | Role | Risk if broken | Priority |
|---|------|------|----------------|----------|
| 1 | Login | Any | Blocks everything | P0 |
| 2 | Standard dashboard widgets | Standard | Daily workflow blind | P0 |
| 3 | Super admin dashboard | Super admin | Ops blind | P0 |
| 4 | Client 360 opens | Standard / Admin | Core CRM | P0 |
| 5 | Client details edit | RELATIONSHIP / Admin | Data integrity | P1 |
| 6 | Important Dates CRUD | RELATIONSHIP / Admin | Schedule / calendar | P1 |
| 7 | Deal participant edit | Manage deals | Commission correctness | P0 |
| 8 | Strategy Board/List/Projection switch | Strategy view | Planner UX | P1 |
| 9 | Projection milestone + suggestions | Strategy manage | Silent overwrite risk | P0 |
| 10 | Client Strategy Overview | Strategy view | Client-facing report | P1 |
| 11 | LCC filter + preview | Super admin | Lead ops | P1 |
| 12 | Merge selected leads | Super admin | Irreversible archive | P0 |
| 13 | WebKit form typing color | Any | iPad usability | P1 |

---

## Flow specifications

### 1. Login

| | |
|--|--|
| **Route** | `/login` |
| **Components** | `src/app/login/page.tsx` |
| **Steps** | Open `/login` → fill Email `#email` → Password `#password` → click **Sign in** |
| **Expect** | Navigate to `/dashboard`; `localStorage.token` set when `/api/auth/token` succeeds; logo + “Welcome back” visible pre-login |
| **Negative** | Bad password → error text, stay on `/login`; deactivated user → “account has been deactivated” |
| **API** | Supabase auth + `POST /api/auth/token` |
| **Fixtures** | Active standard + admin users |

### 2. Standard dashboard widgets load

| | |
|--|--|
| **Route** | `/dashboard` |
| **Auth** | Standard user storageState |
| **Steps** | After login, wait for parallel widget fetches to settle (no infinite skeletons) |
| **Expect** | Key sections/widgets render without fatal error UI: assigned clients, open tasks, activity feed, performance/secured commission (if assigned), Schedule / Important Dates calendar, Add Lead control |
| **Network** | Soft-assert `GET /api/dashboard/widgets/*` return 200 (or documented empty payloads) |
| **Out of scope** | Exact KPI numbers (covered by lib/integration tests) |
| **Related APIs** | `/api/dashboard/widgets/assigned-clients`, `open-tasks`, `activity-feed`, `performance-metrics`, `deal-participation`, `important-dates-calendar`, etc. |

### 3. Super admin dashboard loads

| | |
|--|--|
| **Route** | `/admin` (and/or admin nav from header) |
| **Auth** | Super admin |
| **Steps** | Navigate to `/admin` → wait for KPIs / funnel / pipeline / activity sections |
| **Expect** | Page renders; no auth bounce to login; org widgets load (cached analytics OK) |
| **Negative** | Standard user opening `/admin` should not see privileged data (assert empty/forbidden UX or redirect — document actual shipped behavior in first implementation) |
| **Related APIs** | `/api/admin/dashboard-kpis`, `funnel-data`, `revenue-tracker`, `leaderboards`, `pipeline`, activity feed |

### 4. Client 360 opens

| | |
|--|--|
| **Route** | `/clients/[id]` |
| **Steps** | From dashboard assigned clients (or command palette ⌘K) open a known client |
| **Expect** | Header shows client name; workspace tabs present; Deal Info / Details / Team widgets mount; deep link `#strategy-planner` opens Strategy Planner tab when allowed |
| **Negative** | Outsider / unassigned standard user → 403 / access denied pattern (match API `canReadClientCore`) |
| **Fixture** | Seeded client id with assignment for standard user |

### 5. Client details edit

| | |
|--|--|
| **Route** | `/clients/[id]` |
| **Auth** | RELATIONSHIP assignee or SUPER_ADMIN |
| **Steps** | Client Details → **Edit** → change a safe field (e.g. notes / next action / company) → Save |
| **Expect** | Modal closes; updated value visible; `PUT /api/clients/[id]/details` 200 |
| **Negative** | User without RELATIONSHIP (and not admin) → Edit hidden or save 403 |
| **Cleanup** | Restore original value or use E2E-only client |

### 6. Important Dates CRUD

| | |
|--|--|
| **UI** | `ImportantDatesPanel` on Client Details / Lead Details; also lead preview |
| **Auth** | SUPER_ADMIN or RELATIONSHIP |
| **Steps** | Create date+time → assert list row → edit time → create date-only → delete one |
| **Expect** | Display uses UTC wall day; timed shows time; date-only shows “No time set” (or equivalent); activity log entries created |
| **Calendar** | Optional follow-up: `/dashboard` or `/admin` Schedule widget shows the event in range |
| **APIs** | `GET/POST /api/clients/[id]/important-dates`, `PUT/PATCH/DELETE .../[dateId]` |
| **Lib coverage already** | `npm run test:important-dates`, `test:important-dates-calendar` — E2E validates UI wiring only |

### 7. Deal participant edit flow

| | |
|--|--|
| **UI** | `DealInfoWidget` → `DealEditModal` |
| **Steps** | Open deal → Edit → review/edit participant % / roles (template apply if shown) → Save → reopen |
| **Expect** | Participants persist; percents sum validation surfaces errors for invalid WON configs; COMPANY row present for new deals; doctor returnable fields visible when applicable |
| **Critical** | Do not silently drop participants; LEGACY_FALLBACK only for empty-participant historical deals |
| **APIs** | Client deals CRUD under `/api/clients/[id]/deals` |
| **Lib coverage** | `test:deal-participants`, `test:deal-participant-api`, `test:deal-returnables` |

### 8. Strategy Planner Board / List / Projection switch

| | |
|--|--|
| **UI** | Workspace tab **Strategy Planner** → open a plan (`StrategyPlanDetailView`) |
| **Storage** | `localStorage` key `crm-client-strategy-planner-view` = `board` \| `list` \| `projection` |
| **Steps** | Toggle Board → List → Projection → reload page |
| **Expect** | Correct view mounts (`StrategyPlannerBoard` / list / `StrategyProjectionJourneyView`); preference survives reload; Outcome Summary on Board/List only (not Projection) |
| **Deep link** | `/clients/[id]#strategy-planner` |

### 9. Projection milestone create/edit with suggested values

| | |
|--|--|
| **UI** | Projection view → create/edit milestone modal (`StrategyProjectionMilestoneEditModal`) |
| **Product rules** | Suggestions **never** overwrite saved milestone fields unless advisor explicitly applies; backend stores manual values only |
| **Steps** | Create milestone with manual totals → open edit → select source(s) → verify suggestions shown → **Apply** suggestions → save → reopen and confirm persisted values unchanged on reopen without Apply |
| **Negative** | Out-of-range year rejected; step from another plan rejected |
| **APIs** | `/api/clients/[id]/strategy-plans/[planId]/projection-milestones` |
| **Lib coverage** | `test:strategy-projection`, `test:client-strategy` |

### 10. Client Strategy Overview opens

| | |
|--|--|
| **Route** | `/clients/[id]/strategy-plans/[planId]/overview` |
| **Entry** | **View client overview** from Strategy Planner |
| **Expect** | Read-only report (`ClientStrategyOverviewReport`); node map is CSS layout (no DnD); **← Back to Strategy Planner** → `/clients/[id]#strategy-planner` |
| **Negative** | No edit controls for milestones on overview; unauthorized user blocked |
| **Lib coverage** | `test:strategy-report` |

### 11. Lead Command Center filter and preview drawer

| | |
|--|--|
| **Route** | `/admin/leads` |
| **Auth** | Super admin |
| **Steps** | Open LCC → expand filters → set `needsAttention` / `missingPhone` / search → open a row preview drawer |
| **Expect** | Row list updates; drawer shows preview fields (sources, tags, follow-up, activity summary); closing drawer returns to list |
| **APIs** | `GET /api/admin/leads`, `GET /api/admin/leads/[id]/preview` |
| **Lib coverage** | `test:lead-command-center` (smoke, not UI) |

### 12. Merge selected leads

| | |
|--|--|
| **Route** | `/admin/leads` |
| **UI** | Select 2–10 rows → **Merge selected** → `MergeClientsModal` (`manual-multi`) |
| **Steps** | Use **dedicated E2E fixture clients only** → choose canonical → optional field overrides → confirm merge |
| **Expect** | Success; duplicates **ARCHIVED**; interactions/activity/source records on canonical; audits written |
| **APIs** | `POST /api/admin/leads/merge-multiple` |
| **Safety** | Never run against production data; prefer ephemeral seed + teardown; soft-assert conflicts UI if any |
| **Lib coverage** | `test:merge-custom-fields` (longer tx timeout in `lib/clientMerge.ts`) |

### 13. iPad / WebKit form typing color smoke test

| | |
|--|--|
| **Why** | Safari/iPad autofill historically painted white text on white backgrounds; fixed in `src/app/globals.css` via `-webkit-autofill` + `-webkit-text-fill-color: #111827` |
| **Projects** | `webkit` + `iPad Pro 11` (or similar) |
| **Steps** | Login page: focus email/password, type text; Client details / Add Lead modal: type into text inputs |
| **Expect** | Computed style: text fill / color is dark (not near-white); caret visible; no white-on-white after autofill simulation if Playwright can trigger autofill |
| **Assert sketch** | `getComputedStyle` → `-webkit-text-fill-color` or `color` luminance check; screenshot optional on failure |
| **Mobile** | Also confirm inputs use ≥16px font on narrow viewports (globals.css media query) to avoid iOS zoom |

---

## Test data strategy

1. **Stable users** in staging/dev DB (env credentials).
2. **Ephemeral clients** created in `beforeAll` via Prisma or admin API; tagged name prefix `E2E … ${runId}`.
3. **Merge / delete** only those prefixed records.
4. Prefer read-only asserts on shared demo clients for dashboard smoke.
5. Strategy plan fixtures: one plan with ≥1 step + income for suggestion tests.

---

## Mapping to existing automated tests

| E2E flow | Already covered (non-UI) |
|----------|---------------------------|
| Login | Partial: `test-user-management.ts` (HTTP) |
| Dashboards | Partial: commission/activity HTTP scripts |
| Client 360 access | `test:client-access` |
| Important Dates | `test:important-dates`, `test:important-dates-calendar` |
| Deal participants | `test:deal-participants`, `test:deal-participant-api`, `test:deal-returnables` |
| Strategy / projection / overview math | `test:client-strategy`, `test:strategy-projection`, `test:strategy-timeline`, `test:strategy-report` |
| LCC | `test:lead-command-center` |
| Merge | `test:merge-custom-fields` |
| WebKit color | **None** — E2E-only |

E2E should assert **navigation, visibility, and user-visible persistence**, not re-prove pure calculation helpers.

---

## Implementation checklist (when approved)

- [ ] Add `@playwright/test` + browsers; commit `playwright.config.ts`
- [ ] Add `data-testid`s for critical controls (small PR)
- [ ] Auth setup projects + storageState
- [ ] Implement P0 specs (1, 2, 3, 4, 7, 9, 12)
- [ ] Implement P1 specs (5, 6, 8, 10, 11, 13)
- [ ] Document secrets in `.env.example` (names only)
- [ ] Wire CI Chromium job; keep out of `test:all`
- [ ] Link this plan from `DATABASE_AND_UI_REFERENCE.md` §14
- [ ] Update this doc status to “Playwright installed”

---

## Out of scope (v1 E2E)

- Full commission reconciliation UI matrix
- Webhook lead ingestion (covered by `test:lead-ingestion`)
- PDF manuals generation
- Background job processor UI
- Visual pixel diffs / Percy
- Multi-browser matrix beyond Chromium + WebKit/iPad smoke

---

## Decision log

| Date | Decision |
|------|----------|
| 2026-07-21 | Playwright **not** installed; this plan created instead of adding E2E specs |
| 2026-07-21 | Keep browser E2E separate from `npm run test:all` (DB unit/integration stay default) |
