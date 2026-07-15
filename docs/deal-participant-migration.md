# Deal participant migration guide

This guide covers deploying the deal-level commission model (`DealParticipant` + `DealType`), backfilling existing deals, and validating dashboards, Client 360, and returnables after go-live.

---

## 1. Why this revamp is needed

### Doctors are per deal

Previously, doctor commission shares were inferred from **client-level** `DOCTOR` assignments and fixed pool formulas. That model breaks down when:

- Different deals on the same client involve different doctors
- Doctor splits vary by deal (e.g. one doctor on Deal A, two doctors splitting 60% on Deal B)
- Marketing deals route most commission to an external partner, not doctors

**New rule:** doctors are assigned on each **deal** via `DealParticipant` rows with role `DOCTOR`. Client-level doctor assignment is no longer used for new deals.

### Client team is only relationship + follow-up

The **Assigned Team** widget and `POST /api/clients/[id]/assignments` now support:

| Role | Client assignment | Deal participant |
|------|-------------------|------------------|
| Relationship Officer | Yes | Yes (per deal) |
| Follow-up Officer (`ACCOUNT_SERVICE`) | Yes | Yes (per deal) |
| Doctor | Legacy only (read/collapsed) | Yes (per deal) |

Client-level assignments seed default relationship/follow-up users when applying a deal template, but commission authority lives on the deal.

---

## 2. New model

### `DealParticipant`

One row per commission recipient on a deal.

| Field | Purpose |
|-------|---------|
| `role` | `RELATIONSHIP`, `FOLLOW_UP`, `DOCTOR`, `COMPANY`, `EXTERNAL_PARTNER` |
| `userId` | Internal user (relationship, follow-up, doctor) |
| `externalName` | External label (PPA / partner / vendor) |
| `commissionPercent` | Share of `deal.totalCommission` (must total 100% on WON deals) |
| `commissionAmount` | Optional fixed amount; otherwise derived from percent |
| `isReturnableRequired` | Doctor only — generates `CommissionReturnable` when deal is WON |
| `returnablePercent` / `returnableAmount` | Explicit doctor returnable (amount overrides percent) |

Templates and helpers: `lib/dealCommissionTemplates.ts`, `lib/dealParticipants.ts`, `lib/dealParticipantCalculations.ts`.

### `DealType`

Added on `Deal.dealType` with default `CUSTOM`.

| Type | Typical split (percent of commission) |
|------|----------------------------------------|
| `MARKETING` | PPA 15 · Relationship 5 · External partner 80 |
| `INVESTMENT` | PPA 20 · Relationship 10 · Follow-up 10 · Doctors 60 (split evenly) |
| `MEDICAL` | PPA 20 · Relationship 10 · Follow-up 10 · Doctor 60 |
| `CUSTOM` | Same default as Investment/Medical until edited |

Deal Edit modal applies templates on demand (does not silently overwrite participants when deal type changes).

**Prisma migrations:**

- `20260702090904_add_deal_participants` — `DealType`, `DealParticipant` table
- `20260702094324_add_deal_participant_returnables` — returnable fields on `DealParticipant`

---

## 3. Pre-deploy checklist

1. **Backup the database** (full snapshot before schema change).
2. **Deploy application code** that includes the new deal participant UI and calculation paths.
3. **Run migrations on the target environment:**

   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

   Production `npm run build` already runs `prisma migrate deploy`.

4. Confirm migration history shows both deal-participant migrations applied.
5. Smoke-test on staging: create a deal with participants, mark WON, confirm returnables (if configured).

---

## 4. Backfill steps

Backfill creates `DealParticipant` rows for **existing deals that have no participants**, using legacy client-level assignments and the historical 20/10/10/60 pool split.

### 4.1 Dry run

```bash
npm run backfill:deal-participants:dry
```

Optional: limit batch size for review:

```bash
npx tsx scripts/backfill-deal-participants.ts --dry-run --limit=50
```

### 4.2 Review warnings

The script prints a summary and **warnings**, for example:

- Deals with no relationship or follow-up assignment at client level (rows created with blank `userId`)
- Multiple doctors — pool split evenly across client-level `DOCTOR` assignments
- **Doctor returnable fields are not inferred** — all doctors default to `isReturnableRequired = false`

Resolve or note any deals that need manual follow-up in Deal Edit before marking WON.

### 4.3 Run backfill

```bash
npm run backfill:deal-participants
```

### 4.4 Verify

```bash
npm run verify:deal-participants
```

This read-only script reports:

- WON deals without participants (legacy)
- WON deals whose participant percents do not total 100%
- Participants missing both `userId` and `externalName`
- Doctors with returnable required but missing amount/percent

---

## 5. Post-backfill checks

### Dashboards

- **Standard user:** “My secured commission” sums the user’s participant rows on WON deals (`calculateUserSecuredCommissionFromDealParticipants`).
- **Standard user:** “My deal participation” widget lists deals where the user appears as a participant.
- **Super admin:** Leaderboards and company earnings use participant rows when present; legacy assignment fallback for deals still without participants.

```bash
npm run test:deal-participants
npm run test:deal-participant-api
```

### Client 360 deal cards

- Open several clients with backfilled and new deals.
- Confirm participant list, role labels, percents, and amounts display in **Deal Info**.
- Confirm relationship/follow-up users match expectations; doctors appear per deal.

### Returnables

- For deals with explicit doctor returnables (`isReturnableRequired = true`), mark WON and confirm `CommissionReturnable` rows in **My Statements** / admin reconciliation.
- Backfilled doctors do **not** auto-generate returnables until configured per deal.

```bash
npm run test:deal-returnables
npx tsx scripts/recalculate-commission-returnables.ts   # if recalc needed after bulk edits
```

### Reconciliation

- Admin **Reconciliation** / commission returnable views should align with participant-backed amounts.
- Compare a sample of pre-migration WON deals (legacy) vs post-backfill deals (participant-backed).

---

## 6. Rollback notes

This migration is **additive**:

- New columns (`Deal.dealType`) and table (`DealParticipant`) — no drops of `client_assignments` or existing deal columns.
- **Old client assignments are preserved** (including legacy `DOCTOR` rows) for audit and legacy fallback.
- **Fallback calculations remain** in code for deals without participants:
  - Secured commission: `calculateMySecuredCommissionWithLegacyFallback`
  - Company earnings: 20% overhead when no `COMPANY` participant row
  - Returnables: `createLegacyCommissionReturnablesForWonDeal` using client-level doctors

Rolling back **application code** without rolling back schema is safe short-term: the app ignores empty participant lists and uses legacy paths.

Rolling back **schema** (dropping `DealParticipant`) would lose participant data — only consider with a DB restore from backup.

---

## 7. Known limitations

### Legacy client-level doctors retained for audit

- Existing `DOCTOR` rows in `client_assignments` are **not deleted** by backfill or deployment.
- UI shows them in a collapsed “Legacy doctor assignments” section; new doctor assignments at client level are blocked.
- Operators must assign doctors per deal going forward.

### Returnable formula v1 is participant-based but may need business review

- Returnables on participant-backed deals use **explicit** per-doctor fields, not the old pool-liability formula.
- Backfill does not guess returnable amounts — configure in Deal Edit before WON.
- Legacy deals without participants still use `calculateDoctorCommissionReturnableAmount()` until backfilled and configured.
- Finance should review a sample of WON deals after migration to confirm returnable totals match policy.

### Other operational notes

- `PROPOSED` deals may save with participant totals ≠ 100%; `WON` requires 100%.
- Marketing deals use `EXTERNAL_PARTNER` for vendor/partner share; PPA (`COMPANY`) percent comes from template (15%), not a hardcoded 20% global rate.
- Deal API routes authenticate via Supabase session; integration scripts test via Prisma + shared libraries (see `scripts/test-deal-participant-api.ts`).

---

## Quick reference

| Task | Command |
|------|---------|
| Dry-run backfill | `npm run backfill:deal-participants:dry` |
| Write backfill | `npm run backfill:deal-participants` |
| Verify deals | `npm run verify:deal-participants` |
| Unit tests (calculations) | `npm run test:deal-participants` |
| Integration test (DB flow) | `npm run test:deal-participant-api` |
| Returnable unit tests | `npm run test:deal-returnables` |
| Apply migrations | `npx prisma migrate deploy` |

For schema and API detail, see `docs/DATABASE_AND_UI_REFERENCE.md` (sections **Deal**, **DealParticipant**, commission returnables).
