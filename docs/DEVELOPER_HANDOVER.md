# Profit Pulse Ally CRM — Developer Handover Document

**Purpose:** Give a developer full understanding of how this CRM works — front and back — so they can make precise recommendations on improving the system and UI.

**Author:** Adam (OpenClaw assistant) · **Date:** 2026-09-01 · **App:** https://crm-ppa-nine.vercel.app

---

## 1. System Overview

The CRM is the operational hub for **Profit Pulse Ally** — a financial advisory business (insurance/wealth). It manages:

- **Leads** (inbound from multiple channels) → **clients** through a sales pipeline
- **Client 360° records** — contacts, deals, tasks, interactions, important dates, documents, strategy plans
- **Strategy planning** — per-client financial strategy plans with steps, expenses, and income projections
- **Commission tracking** — deal participants, commission splits, returnables, reconciliation
- **Product recommendations** — an AI-assisted engine (questionnaire → traits → ranked product shortlist)
- **Team management** — users with roles (SUPER_ADMIN / STANDARD_USER), assignments, leaderboards

The product serves two audiences:
- **Super admins** (the owner): full pipeline, all leads, analytics, revenue, leaderboards, user management, reconciliation
- **Standard users** (relationship officers): their assigned clients, tasks, deals, commission, statements

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 15** (App Router, React Server Components + Client Components) |
| Language | TypeScript |
| Database | **PostgreSQL via Supabase** (pooler: port 6543 transaction mode; DIRECT_URL 5432 session mode for migrations/transactions) |
| ORM | **Prisma 6** (28 models) |
| Auth | **Supabase Auth** (email/password) + app JWT (`lib/jwt.ts`) + NextAuth cookie scaffolding |
| Middleware | `src/middleware.ts` — route protection + redirects |
| Hosting | **Vercel** (project `crm-ppa`, production alias `crm-ppa-nine.vercel.app`) |
| Git | GitHub `prisken/CRM_PPA`, branch **`deploy`** (deploy-on-push to Vercel) |
| Styling | Tailwind CSS + custom UI primitives (`src/components/ui/`) |
| Docs | `docs/` (DATABASE_AND_UI_REFERENCE.md is the 218KB reference) |

---

## 3. Sources of Truth (read these first)

1. **`prisma/schema.prisma`** — the complete data model (28 models). This is the ground truth for all data.
2. **`docs/DATABASE_AND_UI_REFERENCE.md`** (218KB) — exhaustive API + data reference generated from the codebase. The single best deep-dive.
3. **`docs/BACKGROUND_JOBS_OPS.md`** — background job processor ops (must be scheduled in prod).
4. **`src/app/api/**`** — every API route (see §7).
5. **`lib/**`** (62 modules) — business logic, auth, access checks, commission calcs, strategy, recommendation engine.
6. **`src/components/**`** — UI components (workspace shell, widgets, modals).
7. **`.env`** — Supabase URL/keys, DATABASE_URL (6543 pgbouncer), DIRECT_URL (5432), NEXTAUTH_SECRET, CRON_SECRET.

---

## 4. Authentication & Authorization

### Flow
- Login page → `supabase.auth.signInWithPassword` → session stored in **cookie `sb-<ref>-auth-token`** (Supabase) + **localStorage `token`** (app JWT).
- `src/middleware.ts` runs on `/`, `/dashboard*`, `/admin*`, `/my-statements`, `/clients*`, `/login`, `/signup`:
  - No session + protected path → redirect `/login`
  - Session + `/login` → redirect `/dashboard`
- Server-side auth: `getAuthenticatedUserFromRequest(request)` in `lib/authHelpers.ts` — resolves **Bearer JWT** OR **session cookie**, then looks up the `User` row and checks `ACTIVE` status.
- Client-side auth: `src/hooks/useUserProfile.ts` → `supabase.auth.getUser()` → profile fetch.

### Roles & permissions
- `UserRole` enum: **SUPER_ADMIN** and **STANDARD_USER**.
- Permission helpers in `lib/`:
  - `canReadClientCore(userId, role, clientId)` — core read gate
  - `resolveClient360PageAccess(...)` — granular per-page access (deal access, hierarchy, strategy)
  - `clientStrategyPermissions`, `importantDatePermissions`, `leadDuplicates`, `pipelinePermissions`
- **Data isolation:** standard users see only their **assigned clients** (`ClientAssignment` rows); super admins see everything.

---

## 5. Data Model (28 tables — key ones)

| Model | Purpose |
|---|---|
| `User` | Staff accounts (role, status ACTIVE/DEACTIVATED) |
| `Client` | Leads AND clients (single table; `status` = pipeline stage). Has `profileTraits` (JSON, recommendation traits) + `recommendedProducts` (JSON, curated shortlist) |
| `ClientContact` | Emails/phones (normalized, deduped) |
| `ClientImportantDate` | Calendar events per client (label, scheduledAt, all-day flag) |
| `ClientAssignment` | Which users own which clients |
| `Interaction` | Activity log entries (notes) |
| `Deal` | Sales deals per client (value, type, status) |
| `DealParticipant` | Who shares the deal + commission %/amount |
| `CommissionReturnable` | Returnable commission tracking |
| `Strategy` | Legacy strategy docs |
| `ClientStrategyPlan` | Structured per-client strategy plans (goal, expected outcome, owner) |
| `ClientStrategyStep` | Steps within a plan (linked deals, amounts, income expectations, timeline) |
| `ClientStrategyExpense` | Expenses per plan |
| `ClientStrategyProjectionMilestone` (+Step/Expense) | Income projection timelines |
| `Task` | To-dos per client |
| `Tag` / `ClientTag` | Tagging (many-to-many) |
| `ClientSourceRecord` | Inbound lead provenance (source, externalId, payload) |
| `LeadMergeAudit` | Merge history for dedupe |
| `BackgroundJob` | Async job queue (processed by cron or manual) |
| `Notification`, `ClientDocument`, `Document`, `ClientActivityLog`, `ActivityReadStatus` | Supporting tables |

---

## 6. Architecture Patterns

- **Route handlers** (`src/app/api/**/route.ts`) — every mutation is an authenticated API call.
- **RSC (React Server Components)** for initial page data (e.g., `Client360Page` fetches core data server-side), then **client components** take over for interactivity.
- **Widget pattern:** `Client360PageClient` composes widgets (details, deals, team, hierarchy, source records, recommended products) in a sidebar + workspace panel.
- **WorkspacePanel tabs:** Strategy & Tasks · Strategy Planner · Activity & Notes · **Product Recommendations** — each tab lazy-loads its own data (API only on mount).
- **Performance discipline:** heavy views (pipeline kanban, calendars, charts) are lazy-mounted per `?view=`; Home fetches only cached KPIs. `lib/performance.ts` wraps queries with timing.
- **Auth propagation:** `lib/authenticatedFetch.ts` attaches the token to client-side API calls.
- **Background jobs:** `lib/backgroundJobs.ts` + `/api/tasks/process-background-jobs` (CRON_SECRET guarded). Used for async work (sheet sync etc.).
- **Integrations webhooks:** Google Forms, Profit Pulse Ally, LeadGen (n8n → CRM) — all POST leads into `Client` with source provenance.

---

## 7. API Surface (grouped)

**Auth:** `/api/auth/token`, `/api/auth/register`, `/api/auth/[...nextauth]`

**Dashboard:**
- `/api/get-dashboard-data`
- `/api/dashboard/standard`, `/api/dashboard/superadmin`
- `/api/dashboard/widgets/*` (activity-feed, assigned-clients, deal-participation, important-dates-calendar, open-tasks, performance-metrics)

**Clients (360°):**
- `/api/clients`, `/api/clients/[id]` (GET/PATCH)
- `/api/clients/[id]/details`, `/archive`, `/assignments`, `/assignments/[id]`
- `/api/clients/[id]/deals` + `[dealId]` + `/participant-users`
- `/api/clients/[id]/interactions` + `[interactionId]`
- `/api/clients/[id]/important-dates` + `[dateId]`
- `/api/clients/[id]/tasks` + `[taskId]`
- `/api/clients/[id]/documents` + `[documentId]`
- `/api/clients/[id]/employees`, `/follow-up`, `/quick-note`, `/source-records`, `/workspace`
- `/api/clients/[id]/tags/[tagId]`

**Strategy:**
- `/api/clients/[id]/strategy`, `/strategy-plans` + `[planId]` (+ steps, connections, expenses, projection-milestones, reorder)

**Recommendations (AI):**
- `/api/clients/[id]/profile-traits` (GET/PUT — trait picker)
- `/api/clients/[id]/recommendations` (GET — diverse top-5 + comparisons + stars)
- `/api/clients/[id]/recommended-products` (GET/PUT — curated shortlist)
- `/api/products`, `/api/products/[slug]/matching-clients` (reverse targeting)

**Admin:**
- `/api/admin/pipeline`, `/leads` (+bulk-*, duplicates, merge), `/dashboard-kpis`, `/funnel-data`, `/revenue-tracker`, `/leaderboards`, `/tags`, `/users`, `/all-commission-returnable`

**Leads:** `/api/leads/[id]/important-dates*`

**Reports:** `/api/reports/funnel`, `/leaderboards`, `/revenue`

**Search:** `/api/search/clients`

**Me:** `/api/me/assignments`, `/api/me/commission-returnable`

**Integrations:** `/api/integrations/google-forms/leads`, `/profit-pulse-ally/members`, `/leadgen/leads`

**Jobs:** `/api/tasks/process-background-jobs`, `/tasks/recalculate-returnables`, `/tasks/[taskId]/complete`

**Misc:** `/api/notifications*`, `/api/commission-returnable/[id]`, `/api/user/profile`, `/api/users/[id]*`, `/api/activity*`, `/api/perf/client360-workspace-auth-only`

---

## 8. Feature Walkthrough (with screenshots)

### 8.1 Login (`/login`)
![Login](01-login.png)
Supabase email/password. On success, writes the Supabase session cookie + app JWT token. Signup route exists but is typically disabled for public use.

### 8.2 Dashboard — Home (standard user)
![Dashboard Home](02-dashboard-home.png)
Role-aware landing. Shows: welcome, "at a glance" (assigned client count), quick-access tiles (My Clients, Tasks, Activity, Calendar, Deals, Commission). Only fetches light data — heavy sections load on demand via `?view=`.

### 8.3 Dashboard — My Clients
![My Clients](03-dashboard-clients.png)
List of clients assigned to the current user (via `ClientAssignment`). Row actions, status pills, contact info.

### 8.4 Dashboard — Tasks / Activity / Calendar / Deals / Commission
![Tasks](04-dashboard-tasks.png)
![Activity](05-dashboard-activity.png)
![Calendar](06-dashboard-calendar.png)
![Deals](07-dashboard-deals.png)
![Commission](08-dashboard-commission.png)
Each is a widget-backed view. Calendar shows `ClientImportantDate` rows. Commission shows secured commission from `DealParticipant` calculations.

### 8.5 My Statements (`/my-statements`)
![My Statements](09-my-statements.png)
Commission/returnable statements for the logged-in user.

### 8.6 Product Targeting (`/products`)
![Products](10-products.png)
**Reverse targeting:** pick a product → see which clients (with saved traits) are the best fit, scored with matched traits + persona overlap. Feeds the recommendation engine's data (`lib/data/product-personas.json`, 89 products, 15 personas, 112 traits).

### 8.7 Admin — Home
![Admin Home](11-admin-home.png)
Clean executive home: 4 shortcut cards (LCC, Pipeline, Calendar, Reports). KPI snapshot was removed in the 2026-09 UI cleanup for speed.

### 8.8 Admin — Lead Command Center (LCC)
![Lead Command Center](12-admin-leads.png)
The daily lead hub: inbox of all leads with **attention scores** (unassigned, missing contact, no activity 7 days, nurturing 30+ days), stage pills, source tags, owner, filters (Attention/New/Follow-up), Duplicates tab (merge UI), bulk actions (assign, status, note, tags, delete), lead preview drawer.

### 8.9 Admin — Pipeline
![Pipeline](13-admin-pipeline.png)
Kanban of leads/clients by stage (master pipeline view). Draggable/mutating pipeline stages.

### 8.10 Admin — Calendar / Activity / Analytics / Revenue / Leaderboards
![Admin Calendar](14-admin-calendar.png)
![Admin Activity](15-admin-activity.png)
![Analytics](16-admin-analytics.png)
![Revenue](17-admin-revenue.png)
![Leaderboards](18-admin-leaderboards.png)
Analytics = KPI bar + company earnings + conversion funnel. Revenue = revenue tracker chart. Leaderboards = commission/deal rankings.

### 8.11 Admin — Reconciliation & User Management
![Reconciliation](19-admin-reconciliation.png)
![User Management](20-admin-users.png)
Reconciliation = global commission returnables. Users = deactivate/delete accounts.

### 8.12 Client 360° (the heart)
![Client 360](21-client-360.png)
Per-client page: **left = Workspace** (tabs: Strategy & Tasks, Strategy Planner, Activity & Notes, Product Recommendations); **right sidebar** = Recommended Products shortlist, Lead Details (contacts, dates), Deal Info, Assigned Team, Company Hierarchy, External Source Records.

### 8.13 Client Workspace — Strategy & Tasks
![Strategy & Tasks](22-client-workspace-tasks.png)
Per-client strategy text + task list with assignees and due dates.

### 8.14 Client Workspace — Product Recommendations (AI)
![Product Recommendations tab](23-client-workspace-product-recs.png)
**The recommendation journey:** 18-question MCQ (fact-finding baseline, skippable, sectioned) → auto-picks traits → collapsible trait groups for fine-tuning → diverse top-5 (one per category, ★ suitability) → compare-in-category with stars → add to shortlist (also available from the sidebar picker). Backed by `lib/recommendationEngine.ts` (scoreClientDiverse, suitabilityStars, compareCategory, EMOTIONAL_CATEGORIES relaxation).

### 8.15 Client Workspace — Activity & Notes
![Activity & Notes](24-client-workspace-activity.png)
Interaction log per client; can post notes (role-gated).

### 8.16 Client Workspace — Strategy Planner
![Strategy Planner](25-client-strategy-planner.png)
Structured plan builder: steps, linked deals, expenses, income projections (milestones) with timeline economics.

### 8.17 Admin — Lead Preview Drawer
![Lead Preview](26-admin-lead-preview.png)
Quick view of a lead from LCC: details + actions without leaving the list.

---

## 9. The Product Recommendation Engine (built 2026-08-31)

- **Data** (`lib/data/`): `product-personas.json` (89 products × features/audience/personas/signals/price_tier/product_fit), `personas.json` (15 HK-market personas with signal vocab), `trait-vocabulary.json` (112 pickable traits in 7 groups), `trait-questionnaire.json` (18 questions → trait mapping).
- **Scoring** (`lib/recommendationEngine.ts`): signal hit ×2.0 + persona overlap ×1.0 + price-tier sensitivity (±1.5); emotional categories (savings/investment/retirement/ILAS) get relaxed soft-signal bonuses.
- **Diversity:** `scoreClientDiverse` returns top-N with one product per category.
- **Comparison:** `compareCategory` + `suitabilityStars` (score → 1-5★) shown in the compare panel.
- **Reverse:** `matchClientsForProduct` + `/api/products/[slug]/matching-clients` — product → best-fit clients.
- **UI:** questionnaire → traits → recommendations all inside the client Workspace tab; curated shortlist widget in the sidebar (`recommended-products` PUT).

---

## 10. Known Areas for Improvement (candidate list — verify before acting)

1. **Data freshness:** `lib/data/*.json` (products/personas) are copied from the research pipeline — need a sync script or shared source.
2. **Background job scheduler:** README says production must schedule the processor every 1–5 min; verify it's actually scheduled (Vercel cron / external) — earlier absence caused stale lead-sync behavior.
3. **Connection pool:** session-mode pooler caps at 15 connections; `connection_limit=2` is set per instance — monitor for exhaustion under load.
4. **Client 360 payload:** the page loads core + deals + hierarchy server-side — consider streaming or splitting for large datasets.
5. **Recommendation engine weights** are simple (2.0/1.0) — calibrate against real sales outcomes.
6. **UI density:** display density toggle exists (compact/comfortable) — audit default for different roles.
7. **Search:** `/api/search/clients` relies on pg_trgm indexes (created via raw SQL, not in schema.prisma) — any Prisma migration must NOT drop them (see `20260721020000_add_performance_indexes_phase_3`).

---

## 11. How to Run Locally

```bash
cd ~/Crm\ PPA\ Ci
npm install
# .env needs: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY, DATABASE_URL (6543), DIRECT_URL (5432), NEXTAUTH_SECRET, NEXTAUTH_URL=http://localhost:3000
npm run dev        # dev server on :3000 (runs prisma generate first)
npm run build      # prisma generate && prisma migrate deploy && next build
npm run start      # prod build
```

**Deploy:** push to `deploy` branch → Vercel auto-builds. `vercel deploy --prod --yes` for manual.

**Test scripts:** `scripts/test-*.ts` cover lead ingestion, admin pipeline, client access, strategy projection, deal participants, etc.
