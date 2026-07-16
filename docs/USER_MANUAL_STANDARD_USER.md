# Profit Pulse Ally CRM
## Standard User Manual

**Version:** 1.3 · **Audience:** Standard users (Relationship, Follow-up, and deal participants including doctors)

---

## 1. Introduction

Profit Pulse Ally CRM helps you manage assigned clients through the sales pipeline—from new lead to active client. Your access depends on your **account role** (Standard User) and how you are involved with each client:

- **Client-level team** — Relationship Officer or Follow-up Officer (Account Service)
- **Deal-level participation** — Doctor, Relationship, Follow-up, or other commission roles on specific deals

This manual covers everything a standard user needs for day-to-day work.

---

## 2. Getting started

### Sign in

1. Open the CRM login page.
2. Enter your **email** and **password**.
3. Click **Sign in**.

If your account is **deactivated**, you cannot sign in. Contact a super admin.

### Sign up (new accounts)

1. Go to **Sign up**.
2. Enter full name, email, and password (minimum 8 characters).
3. Submit—you are taken to your **Dashboard**.

New accounts are created as **Standard Users**.

### Sign out

Use **Sign Out** in the dashboard header.

### Your home screen

After login you land on **Dashboard** (`/dashboard`)—your personal workspace for assigned clients.

---

## 3. Your roles explained

### Account role

You are a **Standard User**. You cannot access the Admin Dashboard, Lead Command Center, or user management.

### Client-level assignment roles

| Role | Max per client | Typical responsibilities |
|------|----------------|--------------------------|
| **Relationship Officer** | 1 | Contact, qualify, edit client details, early pipeline stages, create/view deals |
| **Follow-up Officer** (Account Service) | 1 | Service delivery, active-client stage, create/view deals |
| **Doctor** (legacy) | — | **No longer assigned at client level.** Doctors are added on each **deal** instead. |

You may hold different client-level roles on different clients.

### Deal-level participation

On each deal, commission is split across **participants** (Relationship, Follow-up, Doctor, PPA, External partner). If you appear on a deal’s participant list, your commission for that deal is based on your **participant row**—not only your client assignment.

See **My Deal Participation** on your dashboard for every deal where you earn commission.

### What you can do—quick reference

| Action | Relationship | Follow-up | Doctor (on deal) |
|--------|:------------:|:---------:|:----------------:|
| Edit client details | ✅ | ❌ | ❌ |
| Log calls, emails, meetings, notes | ✅ | ✅ | ✅* |
| Strategy & tasks | ❌ | ❌ | ✅* |
| View deals | ✅ | ✅ | ✅ |
| Create / edit deals | ✅ | ✅ | ✅ (deals you can manage) |
| Advance pipeline (see §6) | Early stages | Active client | Strategy session* |
| Upload documents | ✅ | ✅ | ✅* |
| Add lead from dashboard | ✅ | ✅ | ✅ |

\*Requires client assignment **or** deal-level doctor participation where applicable.

---

## 4. Dashboard

**Route:** `/dashboard`

### Header

| Button | Purpose |
|--------|---------|
| **+ Add Lead** | Create a new lead manually (you become Relationship owner) |
| **Returnable Statements** | Shown if you have doctor returnable obligations on Won deals |
| **Account Settings** | Edit display name; set **display density** (Comfortable / Compact) |
| **Sign Out** | End session |

### Widgets

Dashboard sections use a **cleaner, compact layout**—collapsible **My Work** and **Performance** panels, tighter spacing on client/task lists, and truncated text where needed. Widget density follows your **display density** preference (see §10).

| Widget | What it shows |
|--------|----------------|
| **My Assigned Clients** | Clients where you are **Relationship** or **Follow-up** officer (client-level ownership). Click to open Client 360. |
| **My Deal Participation** | Deals where you are a **commission participant** (doctor, relationship, follow-up, etc.)—your % and amount per deal |
| **My Secured Commission** | Your total earned commission on **Won** deals (from your participant rows) |
| **My Commission Returnable** | Current month unpaid returnable total (doctors with returnable obligations only) |
| **My Tasks** | Open tasks; check box to mark complete |
| **Recent Activity** | Notes, calls, emails, meetings, system events on your clients |

### My Assigned Clients (relationship / follow-up ownership)

This widget lists clients where you own the **client-level** relationship or follow-up role.

| Column | Meaning |
|--------|---------|
| **Client** | Link to Client 360 |
| **Client role** | Relationship Officer or Follow-up Officer |
| **Status** | Pipeline stage |
| **Deal value** | Aggregated deal value on the client |

**Doctors:** you are **not** listed here for doctor work alone. Doctor involvement appears under **My Deal Participation**. If you still have an old client-level doctor assignment, it may appear in a collapsed **Legacy doctor client assignments** section—use **My Deal Participation** for current doctor deals.

### My Deal Participation

This widget lists every deal where **you** appear on the participant list—most often as a **Doctor**, but also if you are relationship or follow-up on that specific deal.

| Column | Meaning |
|--------|---------|
| **Deal** / **Client** | Links to Client 360 |
| **Type** | Marketing, Investment, Medical, or Custom |
| **Status** | Proposed, Won, Lost, On Hold |
| **My roles** | Your participant role(s) on this deal |
| **My %** | Your commission percent on this deal |
| **My commission** | Dollar amount (Won deals count toward secured commission) |

Use this widget to see where you earn on each deal, separate from client-level ownership.

### Activity feed tips

- Expand a client group to see recent items.
- Expanding marks items as read.
- Click an entry to open that client’s **Activity & Notes** tab.

### Adding a lead manually

1. Click **+ Add Lead**.
2. Enter **name** (required) and optional company, email, phone, etc.
3. Submit.

The client is created as **New Lead** and you are auto-assigned as **Relationship** owner.

---

## 5. Command palette (quick search)

**Shortcut:** `⌘K` (Mac) or `Ctrl+K` (Windows)

Available on Dashboard, Client 360, and My Statements.

| Key | Action |
|-----|--------|
| ⌘K / Ctrl+K | Open or close search |
| ↑ / ↓ | Move between results |
| Enter | Open selected client |
| Esc | Close |

1. Open the palette.
2. Type at least one character (name, company, email, or phone).
3. Select a client to open **Client 360**.

**Note:** Standard users only see **assigned clients** in search results (up to 10).

---

## 6. Pipeline stages

| Stage | Meaning |
|-------|---------|
| **New Lead** | Just entered the system |
| **Contacted** | Initial outreach done |
| **Nurturing** | Ongoing qualification |
| **Strategy Session** | Strategy work in progress |
| **Active Client** | Active engagement |
| **Archived** | Closed out |

### Who can advance one stage

| Your role | Can advance when client is in |
|-----------|------------------------------|
| Relationship | New Lead, Contacted, Nurturing |
| Doctor | Strategy Session |
| Account Service | Active Client |

1. Open Client 360.
2. Click **Move to Next Stage** (when your role allows).
3. Review the checklist reminders in the confirmation modal.
4. Confirm.

You **cannot** skip stages or set arbitrary stages—that requires a super admin.

Every stage change is logged on the client activity timeline.

---

## 7. Client 360

**Route:** `/clients/[id]`

### Layout

- **Left:** Workspace tabs (Strategy & Tasks, Activity & Notes)
- **Right:** Summary widgets (details, deals, team, hierarchy, source records)—compact cards with collapsible sections for extended details and source history

### Workspace tabs

#### Strategy & Tasks *(Doctor or super admin only—you need Doctor role)*

- Edit strategy text.
- Create, edit, complete, and delete tasks (title, description, due date, assignee).

#### Strategy Planner — Timeline Economics & Projection Journey *(when you have Strategy Planner access)*

Use **Strategy Planner** on Client 360 to build illustrative plans: what the client invests, what income is expected, what expenses or premiums apply, and selected projection checkpoints.

**Board / List — strategy items**

When editing a strategy item (investment item), you can enter:

- **Invest** amount
- **Timeline** start and end year
- **Income** amount and frequency (monthly, yearly, one-time, or custom)
- Income start and end year
- **Capital back** amount and capital return year

Cards show compact totals such as total income, capital back, and **illustrative** position when those figures can be calculated from what you entered. Missing values show as a dash (—).

**Board / List — expenses**

Expenses can include amount, frequency, start year, and end year. Cards show total expense over the timeline when computable, plus which strategy item covers the expense when linked.

**Projection Journey**

Projection Journey is designed for manually selected milestone years and scenarios. It does not generate a full year-by-year projection. Use it to present important points in the client's investment journey, such as the initial investment, income checkpoints, exit scenarios, and total asset position.

Open a plan → **Projection** to add or edit milestones. For each milestone you can:

1. Choose year, title, and type.
2. Select which **strategy items** contribute.
3. Select which **expenses** contribute.
4. Review suggested values (income/expenses/net for that year, cumulatives, capital returned, illustrative total position).
5. Click **Use suggested values** if you want to apply those suggestions — they are **not** applied automatically while you type.

Helper calculations use simple planning rules (for example monthly × 12, yearly as-is, one-time in the start year, inclusive year ranges). They do **not** include growth, compounding, IRR, ROI, yield, or guaranteed returns. Saved figures remain under your control.

> Values are illustrative and based on advisor-entered assumptions. Actual results may vary. This view is for planning and presentation purposes only.

#### Client Strategy Overview *(when you have Strategy Planner access)*

A **read-only** presentation page for clients — separate from Board, List, and Projection management.

- Open a plan → **View client overview** (beside the Board / List / Projection toggle).
- Route: `/clients/[id]/strategy-plans/[planId]/overview`.
- Shows a strategy snapshot, summary cards (investment, income, expenses, capital back, illustrative total position), a **Client Strategy Map** (goal → milestones → outcome) with yearly cashflow figures and contributing item chips, plan perks, disclaimer, and suggested next steps.
- Milestones and figures are **manually entered** by the advisor (or applied from suggestions when editing); the report does not auto-generate every year.
- Use **Print** in the browser for a hard copy; use **← Back to Strategy Planner** to return to the workspace tab.

> Values are illustrative and based on advisor-entered assumptions. Actual results may vary. This view is for planning and presentation purposes only.

#### Activity & Notes *(all assignees)*

- View manual interactions and system events.
- Filter: All, Notes, Emails, Calls, Meetings, System.
- Add call, email, meeting, or note.
- Edit or delete **your own** manual entries.

### Right-column widgets

| Widget | What you can do |
|--------|-----------------|
| **Client details** | View all fields; **Edit** if you are Relationship assignee |
| **Deal info** | Participant list per deal (who earns what %); your share highlighted; **edit** if you can create/manage that deal |
| **Assigned team** | View Relationship and Follow-up officers; legacy doctors collapsed (view only—super admin manages assignments) |
| **Company hierarchy** | View colleagues; **Add employee lead** at same company |
| **Lead source records** | View ingestion history (read-only) |

### Documents

- **Upload:** Any assignee.
- **Delete:** Super admin only.

### Adding an employee lead

From **Company hierarchy**, add a colleague at the same company. A new **New Lead** is created and you become Relationship owner.

---

## 8. Deals and tasks

### Deals (Client 360 → Deal Info)

Each deal shows:

- Deal name, value, total commission, type, and status
- **Participant list** — who earns from the deal (Relationship, Follow-up, Doctor, PPA, External partner) with % and amounts
- **Your share** — if you are on the participant list, your commission for that deal is shown

If you can create or manage the deal, use **Add Deal** / **Edit** to:

- Select **deal type** and **apply a commission template**
- Add participant rows (relationship, follow-up, doctors, PPA, external partner)
- Split the doctor pool across multiple doctors
- Set doctor **returnable** fields before marking **Won**

**Won** deals require participant percentages to total **100%**. Won deals count toward **My Secured Commission** and may generate returnables for doctors with **Returnable required**.

Who can edit depends on your deal access (relationship/follow-up assignee, deal-level doctor participant, or super admin).

### Tasks *(Doctor client assignee or as configured)*

- Manage on **Strategy & Tasks** tab.
- Statuses: Pending, In Progress, Completed, Cancelled.
- Complete from Client 360 or **My Tasks** on your dashboard.

---

## 9. Commission and returnables

### How commission is calculated (deal participants)

Commission is based on **deal participant rows**, not only your client assignment.

For each **Won** deal where you appear as a participant:

```
your commission = deal total commission × your participant %
```

**My Secured Commission** on the dashboard sums **your** participant amounts across all Won deals (relationship, follow-up, doctor, or any role where you have a participant row).

Example on a $10,000 commission Investment deal:

| If you are… | Typical % | Your amount |
|-------------|-----------|-------------|
| Relationship participant | 10% | $1,000 |
| Follow-up participant | 10% | $1,000 |
| Doctor participant (one of two) | 30% | $3,000 |

Deals without participant rows may still use older client-assignment formulas until backfilled by an admin.

### Legacy pool reference (older deals only)

| Pool | Share |
|------|-------|
| Doctor | 60% |
| Relationship | 10% |
| Account Service | 10% |
| Company overhead | 20% |

### Secured commission (dashboard)

**My Secured Commission** = total of your participant earnings on **Won** deals. Check **My Deal Participation** for the per-deal breakdown.

### My Statements (`/my-statements`)

For users with **doctor returnable** obligations on Won deals.

- Commission **returnables** grouped by month.
- Columns: client, deal, amount, status (Unpaid / Paid).
- Check **Mark as Paid** when settled.

Returnables are generated from **doctor participant** rows when a deal is marked **Won** and **Returnable required** is set on that doctor row.

---

## 10. Account settings

**Route:** `/dashboard/settings`

- Edit **display name**.
- **Display density** — choose **Comfortable** or **Compact** for dashboard widgets and Client 360 side panels. Saved in your browser; default is **Comfortable** for standard users.
- **Email** is read-only—contact an admin to change.
- Password is managed at login/signup (no in-app password change).

---

## 11. Daily workflow (recommended)

1. Open **Dashboard** → review **My Assigned Clients**, **My Deal Participation**, tasks, and activity.
2. Press **⌘K** to jump to a client.
3. Log calls and notes on **Activity & Notes**.
4. Advance pipeline when your role allows.
5. On Client 360 **Deal Info**, confirm participant lists on active deals.
6. Doctors: check **My Statements** for unpaid returnables.

---

## 12. Troubleshooting

| Problem | What to try |
|---------|-------------|
| Cannot sign in | Check credentials; confirm account is not deactivated |
| Cannot edit client details | Confirm you are Relationship assignee on that client |
| Cannot create deals | Confirm you are relationship/follow-up assignee or deal-level doctor with manage access |
| Secured commission seems low | Check **My Deal Participation**—only **Won** deals and your participant % count |
| Not listed under My Assigned Clients | Expected for doctors assigned only on deals; see **My Deal Participation** |
| Cannot advance pipeline | Confirm your role matches the current stage (see §6) |
| Command palette empty | Type at least one character; you only see assigned clients |
| Returnables look wrong after team change | Wait a few seconds and refresh |

---

## 13. Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘K / Ctrl+K | Open command palette |
| Esc | Close palette / modals |
| ↑↓ + Enter | Navigate palette results |

---

*Profit Pulse Ally CRM · Standard User Manual · For super-admin features see the Super Admin Manual.*
