# Feature 7 — A/R-Based Billing Model

> Applies to: **platform billing for all clients** (replaces the placeholder flat fees)
> Priority: High — must be defined before launch; powers real invoicing (via Payoneer at launch).
> Status: not implemented. Current code bills flat $99 + $299 mock line items.

## 1. The actual pricing model

The flat **$299 managed service fee is a placeholder** and is replaced by a
percentage-of-A/R fee, tiered by the client's A/R volume, with a discounted rate for
factoring clients. The **$99/mo platform (app) fee** remains as the base subscription.

### Rate table

| Client A/R volume | Standard rate | Factoring rate |
|---|---|---|
| Under $100k | 1.25% | 0.70% |
| $100k – $250k | 1.00% | 0.60% |
| $250k – $500k | 0.90% | **0.50%** ⚠ |
| Over $500k | *not specified — presumed custom/negotiated* |

> ⚠ **Assumption to confirm:** the source note said "5% with factoring" for the $500k
> tier — assumed to be a typo for **0.5%**, since factoring rates are lower than
> standard at every other tier. Confirm before implementation.

```
monthly bill = $99 platform fee + rate(tier, factoring?) × total COLLECTED for the month
```

### The fee base: collected amounts (DECIDED)

The fee applies **monthly, on the total collected amount for that month** — i.e. the
sum of **confirmed payments** received in the billing period (not invoiced volume, not
outstanding balance). Implications:

- The base is computed from confirmed `payments` rows in the period
  (`getConfirmedPaymentTotal` semantics, aggregated per client per month). Pending
  payments (spec 02) never count until confirmed; reversed payments (spec 06) are
  excluded, and a reversal after billing generates a credit on the next bill.
- **Write-offs cost Credyx the fee automatically** — uncollected money is never billed.
  This makes the hidden write-off approval (spec 01) even more important: the abuse
  shifts from "avoid the fee on this invoice" to **under-reporting collections**
  (collect off-platform, write the invoice off on-platform, pay fees on nothing).
  Credyx's approval is the only check that the balance is genuinely uncollectable.
- **Force-close (spec 03, Managed only) needs an explicit fee rule now:** since only
  collected money bills, a force-closed load would otherwise never generate a fee.
  Proposed: force-closing adds a one-time fee line item of `rate × invoice amount` to
  the month's bill (this preserves force-close's original purpose of locking in the
  fee on collections Credyx worked). Confirm.
- Accurate payment data becomes revenue-critical: specs 02 (Credyx confirms payments)
  and 06 (corrections) are prerequisites for billing integrity.

## 2. Open definitions (remaining)

| # | Question | Why it matters | Suggested default |
|---|---|---|---|
| 1 | ~~What is the A/R base?~~ | **DECIDED: total collected (confirmed payments) in the month.** | — |
| 2 | **Tier evaluation window** — is the rate tier picked from this month's collected volume, or a trailing average? | Clients hovering near $100k/$250k boundaries would bounce between rates monthly; a slow collections month would also (perversely) earn a better rate tier. | This month's collected volume for v1 (matches "monthly basis"); revisit if rate-bouncing becomes a problem |
| 3 | **Does the rate apply to the whole base or marginally per bracket?** | At $101k collected: flat 1.0% on all of it, or 1.25% on the first $100k + 1.0% above? Flat-tier creates a cliff where collecting $1 more lowers the total bill. | Flat rate on the whole base (simpler; cliffs acceptable at these magnitudes) — confirm |
| 4 | **What qualifies as "factoring"?** Client factors their invoices with a third party — verified how? Self-declared at enrollment, NOA on file in the doc vault, or admin-set? | It halves the rate; needs to be admin-controlled, not self-served. | Admin-set flag, evidence = NOA in document vault |
| 5 | **Interaction with per-batch `fee_terms`** — clients already have per-invoice collection fee terms (`clients.fee_terms`, used in `invoiceFees.ts`). Is the A/R percentage *the same fee* (i.e. fee_terms become tier-derived), or a separate platform charge on top? | Double-charging risk, and specs 01/03 (write-off/force-close fee rules) hang off `fee_terms`. | The A/R rate **is** the collection fee — the monthly collected-base computation replaces per-batch fee calculation as the billing source of truth; batch fee views become estimates |
| 6 | Do **both tiers** (Managed and Self-Service) pay the A/R percentage, at the same rates? | Managed includes Credyx labor; a single rate table implies the service level doesn't affect price. | Same table for v1; revisit if Managed needs a premium |
| 7 | Rate for **over $500k** | Table is open-ended. | Custom/negotiated, admin-set override |
| 8 | **Force-close fee amount** (Managed) | Collected-only billing means force-closed loads never bill unless explicitly charged (see §1). | One-time line item: `rate × invoice amount` at force-close — confirm |

## 3. Data model changes

### `Client` type / `clients` table

```ts
// src/types/client.ts
factoring?: boolean              // admin-set; halves-ish the rate per table
ar_rate_override?: number        // optional negotiated rate (e.g. >$500k clients)
```

```sql
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS factoring BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ar_rate_override NUMERIC;
```

### Rate table as config

```ts
// src/config/arBillingRates.ts
export interface ArRateTier {
  maxVolume: number | null   // null = no upper bound
  standardPct: number
  factoringPct: number
}

export const AR_RATE_TIERS: ArRateTier[] = [
  { maxVolume: 100_000, standardPct: 1.25, factoringPct: 0.7 },
  { maxVolume: 250_000, standardPct: 1.0,  factoringPct: 0.6 },
  { maxVolume: 500_000, standardPct: 0.9,  factoringPct: 0.5 }, // ⚠ confirm 0.5
  { maxVolume: null,    standardPct: NaN,  factoringPct: NaN }, // custom — requires override
]
```

### Billing computation service

```ts
// src/services/arBillingService.ts
export function getClientCollectedVolume(clientId: string, period: BillingPeriod): number
// sum of CONFIRMED payment amounts received in the period for the client's invoices
// (excludes pending and reversed payments — specs 02/06)

export function resolveArRate(client: Client, collectedVolume: number): number
// override → rate table lookup by collected volume + factoring flag

export function computeMonthlyBill(clientId: string, period: BillingPeriod): {
  appFee: number            // $99
  collectedVolume: number
  ratePct: number
  arFee: number             // ratePct × collectedVolume
  adjustments: BillingLineItem[]  // force-close fees, reversal credits
  total: number
  lineItems: BillingLineItem[]
}
```

### Credyx bill records (needed for the payment deadline / lock rule)

Monthly bills must be first-class records, not ephemeral line items:

```ts
// src/types/billing.ts
export interface ClientBill {
  id: string
  client_id: string
  period: string            // e.g. '2026-07'
  issued_at: string
  due_at: string            // issued + 30 days (payment terms — confirm)
  amount: number
  status: 'open' | 'paid' | 'overdue' | 'written_off'
  paid_at?: string
  payoneer_reference?: string
  line_items: BillingLineItem[]
}
```

```sql
CREATE TABLE IF NOT EXISTS client_bills (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  period TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  paid_at TIMESTAMPTZ,
  payoneer_reference TEXT,
  line_items JSONB NOT NULL DEFAULT '[]',
  UNIQUE (client_id, period)
);
```

## 3b. Non-payment: 3-month deadline → account lock (DECIDED)

**Rule: a client has 3 months to pay a bill; after that, their account is locked.**

### Escalation timeline (per bill, from issue date)

| Age | Action |
|---|---|
| Issue | Bill created, Payoneer payment request sent |
| +30 days (1 month unpaid) | In-app notification + email reminder; `PlanBillingPanel` shows overdue banner |
| +60 days (2 months unpaid) | Stronger warning on every portal page: "Account will be locked on {date}" |
| +90 days (3 months unpaid) | **Account locked** |

### What "locked" means

- New client status: `suspended` (extend `client_status` enum) — distinct from
  `pending`/`inactive` so it's reversible and reportable.
- `ClientRouteGuard` routes suspended clients to a **billing lock screen** (a variant
  of `ClientPendingApproval`): shows the outstanding bill(s), amount, and how to pay
  (Payoneer instructions). No access to batches, invoices, payments, or documents.
- **Credyx-side work does not stop:** admin portal retains full access; in-flight
  collections on the client's invoices continue (their brokers still owe money —
  collected amounts accrue to the next bill).
- Unlock: admin marks the bill paid → status back to `active` (automatic on payment
  recording; admin can also manually unlock as a grace gesture). Audit-logged both ways.

### Mechanics

- Lock evaluation is **computed, not scheduled** (consistent with the rest of the app):
  a helper like `getBillingStanding(client, bills)` returns
  `ok | overdue | warning | locked` from bill ages, checked by `ClientRouteGuard` and
  the admin client list. No cron needed for v1; the admin billing view surfaces
  "lockable" clients so a human confirms the flip to `suspended` (or it auto-flips at
  the guard level — product call; default: auto at guard, admin notified).
- New enum value migration: `ALTER TYPE client_status ADD VALUE 'suspended'` (or widen
  the CHECK constraint, matching however `client_status` is defined).
- Admin clients list gets a billing-standing column/filter (ok/overdue/locked).

## 4. What this replaces in the current code

| Current | Change |
|---|---|
| `src/config/servicePlans.ts` — `service_fee_monthly: 299` on the Managed plan | Remove the flat fee; both plan cards describe the A/R-percentage pricing (marketing copy on `Enroll`, `HowItWorks`, landing pages needs the same update) |
| `src/services/billingService.ts` — hardcoded mock line items | Line items come from `computeMonthlyBill()`: platform fee + "A/R service fee — {rate}% of {volume}" |
| `src/services/clientRegistry.ts` — `createDefaultBilling(tier)` copies flat fees onto the client | Store plan id + factoring flag; fees are computed per period, not stored as constants |
| `clients.fee_terms` set manually per client | Pending §2 Q5: likely derived from the rate table (admin override still possible) |
| `PlanBillingPanel` (client Settings) | Show current tier rate, factoring status, period volume so the bill is predictable — clients should see the math |

## 5. Billing operations at launch (Payoneer)

Decision: launch billing runs on **Payoneer** (business is based in North Macedonia;
Stripe requires a supported-country entity — revisit Stripe via Atlas/US LLC or a
merchant of record when self-serve card billing is needed).

Monthly cycle:

1. Close of period: `computeMonthlyBill()` per active client → a `ClientBill` record
   with `due_at` (replacing `getMockInvoices`).
2. Admin billing view lists each client's computed bill (collected volume, rate,
   adjustments); export/send as **Payoneer payment requests** (supports batches;
   client pays by ACH debit ~1%, card ~3%, or bank transfer to the USD receiving
   account).
3. Admin marks bills paid as Payoneer confirms receipt (manual at launch); client's
   `PlanBillingPanel` reflects actual status; overdue bills drive the §3b escalation
   through to account lock at 3 months.

Variable monthly amounts are exactly why card-on-file subscriptions aren't required at
launch — payment requests handle per-period amounts naturally.

## 6. Edge cases

- **Mid-month tier crossing:** collected volume is evaluated at period close; no
  intra-month rate switching.
- **Factoring flag changes mid-period:** rate at period close applies; log the change
  (audit event) since it halves revenue.
- **New client mid-month:** pro-rate the $99 app fee; A/R fee applies to actual
  collected volume (no pro-rating needed — it's usage-based).
- **Zero-collections month:** bill is just the $99 app fee.
- **Trial status** (`subscription_status: 'trial'`): define trial scope — app fee
  waived, A/R fee still applies? Product call; default: both waived during trial.
- **Payment reversed after the period was billed** (spec 06 overlap): reversal on a
  prior period's collected base → credit adjustment on the next bill, not a rebill.
- **Payment confirmed late** (remittance from a prior month confirmed this month):
  bills in the period it was *confirmed* — confirmation date is the source of truth,
  matching the "Credyx confirms payments" model (spec 02).
- **Locked client with ongoing collections:** money collected while suspended still
  accrues and bills; unlocking requires settling bills, not disputing the meter.
- **Client churns owing bills:** account already locked at 3 months; churn/termination
  process is out of scope here (dunning beyond lock = manual).

## 7. Acceptance criteria

- [ ] Rate table lives in config with the ⚠ 0.5% figure confirmed.
- [ ] `factoring` is admin-set only (client cannot toggle it), audit-logged.
- [ ] Monthly bill = $99 + rate × **collected (confirmed) payments in the period**,
      computed from real payment data; mock line items removed.
- [ ] Bills are persisted `ClientBill` records with issue/due dates and status.
- [ ] Client `PlanBillingPanel` shows rate, factoring status, period collected volume,
      and bill history matching what Credyx actually requests via Payoneer.
- [ ] Overdue escalation: reminders at 1 and 2 months, lock at 3 months
      (`suspended` status + billing lock screen); unlock on payment, audit-logged.
- [ ] Suspended clients cannot access the portal beyond the lock screen; admin portal
      and collections on their invoices are unaffected.
- [ ] Enrollment/marketing pages no longer promise flat $299; pricing copy matches the
      rate table.
- [ ] Pending and reversed payments never count toward the collected base; post-billing
      reversals produce next-bill credits.
- [ ] Force-closed loads (Managed) bill the one-time fee line item (pending §2 Q8
      confirmation).
- [ ] Over-$500k clients require an explicit `ar_rate_override`; billing refuses to
      compute otherwise (no accidental NaN bills).
