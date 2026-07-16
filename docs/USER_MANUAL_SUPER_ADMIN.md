# Profit Pulse Ally CRM
## Super Admin Manual

**Version:** 1.2 · **Audience:** Super administrators

---

## 1. Introduction

Super admins have full organizational visibility and control: analytics, master pipeline, Lead Command Center, user management, commission reconciliation, client archive/delete, team assignments, duplicate merge, and unrestricted pipeline changes.

This manual covers super-admin-specific features. For standard assignee workflows (dashboard widgets, role-based pipeline rules, My Statements), see the **Standard User Manual**.

---

## 2. Getting started

### Sign in

1. Open the CRM login page.
2. Enter email and password.
3. Click **Sign in**.

A fresh JWT is issued on login for API access.

### Your home screens

| Route | Purpose |
|-------|---------|
| `/admin` | Admin Dashboard—org-wide analytics and master pipeline |
| `/admin/leads` | Lead Command Center—inbox, triage, duplicates, merge |
| `/admin/users` | User management |
| `/admin/reconciliation` | Global commission returnable audit |
| `/dashboard` | Personal dashboard (optional) |

### Sign out

Use **Sign Out** in any admin header.

---

## 3. Super admin capabilities

| Capability | Standard user | Super admin |
|------------|:-------------:|:-----------:|
| Admin dashboard & analytics | ❌ | ✅ |
| Lead Command Center | ❌ | ✅ |
| User management | ❌ | ✅ |
| Global reconciliation | ❌ | ✅ |
| Add lead from dashboard | ✅ | ❌* |
| Add lead/client from admin | ❌ | ✅ |
| Set any pipeline stage | ❌ | ✅ |
| Manage team assignments | ❌ | ✅ |
| Archive / delete client | ❌ | ✅ |
| Bulk lead operations | ❌ | ✅ |
| Merge duplicate clients | ❌ | ✅ |
| Merge selected leads (2–10) | ❌ | ✅ |
| Command palette—all clients | ❌ | ✅ |

\*Use **+ Add Lead / Client** on the Admin Dashboard instead.

### Lead creation (admin)

1. Admin Dashboard → **+ Add Lead / Client**.
2. Enter client details; optionally set initial pipeline stage.
3. Submit—**no auto-assignment**; assign team manually on Client 360.

---

## 4. Admin dashboard

**Route:** `/admin`

### Header actions

- **+ Add Lead / Client**
- **Lead Command Center**
- Back to standard dashboard, Account Settings, Sign Out

### Sections

| Section | Purpose | Export |
|---------|---------|--------|
| **KPI bar** | Committed revenue, potential revenue, commission YTD, pipeline velocity, active deals | — |
| **Company earnings** | PPA (`COMPANY`) share from won deals with participant rows; legacy 20% fallback when no participants | — |
| **Conversion funnel** | Count per stage + conversion rates | PDF / CSV |
| **Revenue tracker** | Revenue and profit over time | PDF / CSV |
| **Leaderboards** | Top performers by commission and deals closed | PDF / CSV |
| **Recent activity** | Org-wide activity feed (~100 items) | — |
| **Master pipeline** | Kanban (desktop) / list (mobile); filter by status and assignee | — |

Click any pipeline card to open **Client 360**.

Analytics (funnel, KPIs, revenue, leaderboards) are cached ~10 minutes. Pipeline and activity are live.

---

## 5. Lead Command Center

**Route:** `/admin/leads`

Triage leads, fix data quality, run bulk operations, and merge duplicates.

### Tabs

| Tab | Purpose |
|-----|---------|
| **Inbox** | Compact lead table with attention scoring |
| **Duplicates** | Email/phone duplicate groups with pairwise merge |

### Cleaner inbox layout

The inbox uses a **compact** layout so you can scan more leads at once:

- **Display density** — toolbar toggle **Compact** / **Comfortable** (also in Account Settings). Preference is saved in your browser.
- **Dense rows** — status, sources, and tags show as small pills (up to two visible, then `+N` for more). Long text is truncated; blank fields show **—**.
- **Primary row action** — **Preview** opens the side drawer. Open Client 360 from inside the drawer.

### Inbox presets

Quick preset buttons above the table apply common filter combinations (toggle on/off):

| Preset | What it shows |
|--------|----------------|
| **Attention** | Leads flagged as needing attention |
| **New** | New Lead stage |
| **Unassigned** | No relationship owner |
| **Duplicates** | Possible duplicate email or phone |
| **Follow-up** | Overdue or due-today follow-ups |

Leads still sort by **attention score** (higher = needs action sooner) unless you change filters.

### Search and advanced filters

- **Search** (always visible): name, company, email, phone, lead source
- **Filters** button — opens the **advanced filters** panel (collapsed by default):

| Control | Options |
|---------|---------|
| **Status** | All active stages or a specific stage (including Archived) |
| **Assignee** | Filter by relationship owner |
| **Tags** | Filter by one or more tags |
| **Date range** | Created or last-modified window |
| **Filter chips** | Needs attention · Missing phone · Missing email · Unassigned · Duplicate email · Duplicate phone · Overdue · Due today · No next action · Google Forms · Profit Pulse Ally |

### Inbox columns

Name/Company · Status · Sources · Tags · Contact · Owner · Follow-up · Last activity · Attention · Actions

### Bulk actions (checkboxes → bottom bar)

| Action | Notes |
|--------|-------|
| **Merge selected** | 2–10 leads; see §6 |
| **Add tags** | Existing tags or create new inline |
| **Assign relationship** | Skips clients that already have a relationship owner |
| **Change status** | Bulk pipeline update |
| **Add bulk note** | System note on all selected |

**Merge selected** is disabled when fewer than 2 or more than 10 leads are selected.

### Preview drawer

Click **Preview** on a row (or tap a mobile card) to open the drawer without leaving the inbox.

| Section | Contents |
|---------|----------|
| **Summary** | Name, status, priority, owner; **Open Client 360**; optional **Add quick note** |
| **Contact** | Email and phone (copy buttons) |
| **Follow-up** | Priority, next action, next follow-up date — save updates attention scoring |
| **Attention** | Score and reasons (collapsible) |
| **Sources and tags** | Source badges, tag pills, source record summary (collapsible) |
| **Recent activity** | Last activity timestamp and summary (collapsible) |

Follow-up edits use the same fields as Client 360 and affect filters (Overdue, Due today, No next action).

### Duplicates tab

- Groups by normalized **email** or **phone**
- Compare status, sources, assignments, activity, deals
- **Open all** — all clients in group in new tabs
- **Merge** — pairwise merge; see §7

### Attention score factors

New lead with no activity, missing contact info, unassigned, no source record, recent source update, duplicate email/phone, 7+ days no activity, nurturing 30+ days, overdue/today follow-up, no next action on new leads.

---

## 6. Merging selected leads (inbox)

Use this when you want to combine **2 to 10** leads you selected in the **Inbox** tab (not limited to automatic duplicate groups).

1. In the inbox, select **2–10** leads using the row checkboxes.
2. Click **Merge selected** in the bottom bulk-action bar.
3. **Step 1 — Surviving record:** Choose which lead stays active (canonical). All other selected leads will be archived after their data is moved.
4. **Step 2 — Final client data:** For each field, choose a value from one of the selected records, **Blank**, or **Custom** (type your own text). **Name is required** — you cannot continue without a final name.
5. **Step 3 — Review:** Confirm surviving record, records to be archived, and final field values. Optionally enter a **reason**. Check **I understand the other selected records will be archived.**
6. Click **Merge clients**.

### What happens

- All non-surviving selected leads are set to **Archived**.
- Interactions, deals, tasks, documents, activity logs, source records, tags, and assignments move to the surviving client (with role limits and conflict logging).
- One **merge audit** row is written per archived lead.
- The inbox refreshes after a successful merge.

### Tips

- Review deals and relationship owners before merging large groups.
- You can also start a multi-lead merge from **Client 360** → **More actions** → **Merge clients** (search and add related records there).

---

## 7. Merging duplicate clients (Duplicates tab)

For email/phone duplicate **groups** detected automatically:

1. **Duplicates** tab → **Merge** on a group (2+ clients).
2. Choose **canonical client** (keep).
3. Choose **duplicate client** (will be archived).
4. Under **Final client data**, for each field pick a value from either client, **Blank**, or **Custom** (type a new value). **Name is required.**
5. Optionally enter a **reason**.
6. Type the **duplicate client’s name** to confirm.
7. Click **Merge clients**.

### What happens

- Interactions, deals, tasks, documents, activity logs, strategies, and most source records move to canonical.
- Assignments merge with deduplication (role limits enforced; conflicts logged).
- Duplicate set to **Archived**.
- System note and **merge audit** record created.

### Warnings

- Multiple relationship owners may cause assignment conflicts.
- Won deals on both clients affect commission—review before merging.

---

## 8. Client 360 (super admin)

**Route:** `/clients/[id]`

Super admins have **full access** on every client.

### Header (admin-only)

| Action | Detail |
|--------|--------|
| **More actions** menu | **Merge clients** (multi-record picker) · **Archive client** |
| **Pipeline dropdown** | Set **any** stage immediately |

**Merge clients** opens a search picker to add related records, then the same multi-step merge wizard as inbox **Merge selected** (§6).

### Full edit rights

- Client details, deals, strategy, tasks, interactions
- Team assignments (relationship and follow-up only at client level; see below)
- Document upload and delete
- All pipeline stages without role restrictions


**Client Strategy Overview (read-only report):** Open Client 360 → **Strategy Planner** → open a plan → **View client overview**. Presents a client-facing strategy map, summary cards, perks, and disclaimer at `/clients/[id]/strategy-plans/[planId]/overview`. View permission only — editing stays in Board / List / Projection. Values are advisor-entered; no automatic year-by-year projection. Browser **Print** only (no built-in PDF or share link). **← Back to Strategy Planner** returns to the workspace tab.

### Client team management (Assigned Team widget)

Use **Assigned Team** on Client 360 to set the **client-level** team. These roles seed deal templates but commission splits are configured **per deal**.

| Role | Max per client | How to assign |
|------|----------------|---------------|
| **Relationship Officer** | 1 | **Assign** → Relationship Officer |
| **Follow-up Officer** | 1 | **Assign** → Follow-up Officer (Account Service) |
| **Doctor** | — | **Not assignable at client level** for new operations |

**Doctors are added to deals**, not the client team. Legacy client-level doctor rows may still appear in a collapsed **Legacy doctor assignments** section for audit only.

When you apply a deal template, relationship and follow-up users are pre-filled from the client team when possible.

### Deal creation and participants

Open **Deal Info** on Client 360 → **Add Deal** or **Edit** on an existing deal.

#### Step 1 — Deal basics

- **Name**, **Deal Value**, **Total Commission**, **Status**
- **Deal Type** — Marketing, Investment, Medical, or Custom

Changing deal type does **not** automatically overwrite participants. Use **Apply {type} template** when you want template percentages.

#### Step 2 — Apply commission template (optional)

Click **Apply Marketing template** (or Investment / Medical / Custom). If participants already exist, confirm replacing current percentages.

Templates preserve relationship, follow-up, and doctor **users** where possible when re-applied.

#### Step 3 — Add or edit participants

Use quick-add buttons or edit rows in the participant table:

| Button | Adds row for |
|--------|----------------|
| **+ Relationship** | Relationship Officer |
| **+ Follow-up** | Follow-up Officer |
| **+ Doctor** | Doctor (internal user) |
| **+ External partner** | Vendor / marketing partner (external name) |
| **+ PPA** | Company row (Profit Pulse Ally) |

- **Internal rows** (Relationship, Follow-up, Doctor) — pick a user from the searchable dropdown (active users).
- **External rows** (PPA, External partner) — enter or accept the external name. PPA defaults to *Profit Pulse Ally*.

#### Step 4 — Split doctor pool (multiple doctors)

When two or more doctor rows exist, click **Split doctor pool evenly** to divide the template doctor percent across them (e.g. 60% → 30% + 30%).

#### Step 5 — Validate total 100%

The modal shows **Total: X%**:

| Status | Proposed deal | Won deal |
|--------|---------------|----------|
| Total ≠ 100% | Can save (warning) | **Cannot save** — must total 100% |
| Total = 100% | Green | Required to mark **Won** |

### Deal type examples (on $10,000 total commission)

**Marketing deal**

| Participant | % | Amount |
|-------------|---|--------|
| PPA (Company) | 15 | $1,500 |
| Relationship Officer | 5 | $500 |
| External Partner | 80 | $8,000 |
| Follow-up Officer | 0 | $0 |

**Investment deal** (two doctors — 60% split evenly)

| Participant | % | Amount |
|-------------|---|--------|
| Relationship Officer | 10 | $1,000 |
| Follow-up Officer | 10 | $1,000 |
| PPA (Company) | 20 | $2,000 |
| Doctor A | 30 | $3,000 |
| Doctor B | 30 | $3,000 |

**Medical deal** (one doctor)

| Participant | % | Amount |
|-------------|---|--------|
| Relationship Officer | 10 | $1,000 |
| Follow-up Officer | 10 | $1,000 |
| PPA (Company) | 20 | $2,000 |
| Doctor | 60 | $6,000 |

### Doctor returnables (on WON deals)

For each **Doctor** participant row in Deal Edit:

1. Check **Returnable required**
2. Enter **Returnable % of commission** and/or **Fixed returnable amount** (fixed overrides %)
3. Save the deal as **Won**

Returnables are generated for qualifying doctor participants when the deal is marked **Won**. Backfilled deals do not auto-configure returnables — set them per deal.

### Archive / delete modal

| Tab | Confirmation | Result |
|-----|--------------|--------|
| **Archive** | Type client name | Status → Archived; data retained |
| **Permanently delete** | Client name + **your admin password** | Irreversible; redirects to master pipeline |

**Un-archive:** Set status back via pipeline dropdown (no dedicated un-archive button).

---

## 9. User management

**Route:** `/admin/users`

| Action | Steps |
|--------|--------|
| **Deactivate** | User menu → Deactivate → type name → confirm. Blocks login. |
| **Permanently delete** | User menu → Delete → type name + admin password → confirm. |

You **cannot** deactivate or delete your own account. No in-app reactivate—requires database intervention.

---

## 10. Global reconciliation

**Route:** `/admin/reconciliation`

Audit **all** commission returnables organization-wide.

- Filter by user, status (Unpaid/Paid), period
- Review returnables **per deal** — each row links to the source WON deal and client
- Compare doctor participant returnable config on Client 360 **Deal Info** with amounts shown here before marking paid
- Counterpart to **My Statements** (per-doctor self-service)

**Typical review flow**

1. Filter **Unpaid** for the current period.
2. Open the linked client/deal from a returnable row.
3. Confirm doctor participant rows, commission %, and **Returnable required** settings match policy.
4. After payment, doctors mark their own rows paid in **My Statements**; use reconciliation to verify org-wide totals.

---

## 11. Commission reference

### Deal-level participants (current model)

Commission splits live on **`DealParticipant`** rows per deal. Client-level doctor assignments are legacy only.

| Deal type | Default template (%) |
|-----------|------------------------|
| **Marketing** | PPA 15 · Relationship 5 · External partner 80 · Follow-up 0 |
| **Investment** | PPA 20 · Relationship 10 · Follow-up 10 · Doctors 60 (split evenly) |
| **Medical** | PPA 20 · Relationship 10 · Follow-up 10 · Doctor 60 |
| **Custom** | Same starting point as Investment/Medical until edited |

**Secured commission** (dashboards) sums each user's participant rows on WON deals. **Company earnings** (admin KPI) sums **PPA / COMPANY** participant rows—not a flat 20% when participants exist.

### Legacy pools (deals without participants)

| Pool | Rate |
|------|------|
| Doctor | 60% |
| Relationship | 10% |
| Account Service | 10% |
| Company overhead | 20% |

Used only when a deal has no participant rows (until backfill). See `docs/deal-participant-migration.md` for migration steps.

### Returnables

- Generated when deal → **Won**
- **Participant-backed deals:** one returnable per doctor participant with **Returnable required** + returnable % or fixed amount
- **Legacy deals** (no deal participants): still use client doctor assignments and the historical formula
- Backfill does **not** infer doctor returnables — set them per deal in Deal Edit after `npm run backfill:deal-participants`
- Assignment changes trigger background recalculation (legacy deals only)
- Super admin audits per deal via **Reconciliation** (§10); doctors mark own as paid in My Statements

---

## 12. Lead ingestion (automated)

| Source | Endpoint | Match order |
|--------|----------|-------------|
| **Google Forms** | Webhook | source+externalId → email → phone |
| **Profit Pulse Ally** | Member webhook | same |
| **Manual** | Admin add / dashboard add | — |

Creates **New Lead** + source record + system log on create; safe merge on update (no status downgrade).

View source history on Client 360 **Lead Source Records** widget and in LCC preview.

---

## 13. Command palette

**Shortcut:** `⌘K` / `Ctrl+K`

- Search **all** non-archived clients (up to 10 results)
- Shows status, sources, attention score and reasons
- Enter or click → Client 360

---

## 14. Tags

| Action | Where |
|--------|-------|
| Create tags | Lead Command Center bulk tags (inline) or `POST /api/admin/tags` |
| Assign | LCC bulk **Add tags** |
| Filter | LCC inbox tag chips |
| Remove from client | API only (`DELETE /api/clients/[id]/tags/[tagId]`)—no Client 360 tag UI yet |

---

## 15. Daily workflow (recommended)

1. **Lead Command Center** → use **Attention** or **Follow-up** presets; open **Filters** for advanced triage.
2. **Preview** leads in the drawer; update follow-up fields without leaving the inbox.
3. Bulk assign relationship owners and tags; **Merge selected** when you have 2–10 related leads to combine.
4. **Duplicates** tab → merge confirmed duplicate groups (§7).
5. **Admin dashboard** → review pipeline and KPIs.
6. **Client 360** → relationship/follow-up assignments, deals & participants, merge, archive, stage changes as needed.
7. **Reconciliation** → review unpaid returnables per deal after WON deals are configured.

---

## 16. Troubleshooting

| Problem | What to try |
|---------|-------------|
| “Failed to load leads” | Sign out and sign in; hard refresh; check error status code |
| Inbox shows Prisma/schema error | Run `npm run dev` (regenerates Prisma client) or `npx prisma generate` then restart dev server |
| Merge disabled in inbox | Select between 2 and 10 leads inclusive |
| Merge name required | Set a final **Name** in step 2 (Custom is allowed) |
| Merge assignment conflicts | Review relationship occupancy; resolve manually before merge |
| Analytics stale | Funnel/KPIs cache ~10 min—wait or refresh |
| Won deal won't save | Participant percentages must total **100%** when status is Won |
| Company earnings looks wrong | Check PPA participant % on deal (Marketing = 15%, not 20%) |
| No returnables after Won | Doctor row needs **Returnable required** + % or fixed amount |
| User cannot sign in after deactivate | Expected—reactivate requires DB change |

---

## 17. Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘K / Ctrl+K | Command palette |
| Esc | Close palette / modals |
| ↑↓ + Enter | Navigate palette |

---

## 18. Admin route reference

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard |
| `/admin/leads` | Lead Command Center |
| `/admin/users` | User management |
| `/admin/reconciliation` | Commission audit |
| `/clients/[id]` | Client 360 |
| `/dashboard/settings` | Account settings (display name, display density) |

---

*Profit Pulse Ally CRM · Super Admin Manual · For assignee day-to-day workflows see the Standard User Manual.*
