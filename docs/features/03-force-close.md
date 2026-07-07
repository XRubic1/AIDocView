# Feature 3 — Force-Close Is Managed-Only

> Applies to: **tier-differentiated** — force-close exists only for Managed clients.
> Priority: Medium.
> Status: not implemented.

## 1. Problem

Force-close exists so Credyx can close out aged loads it worked collections on and lock
in the collection fee (`force_closed` invoices remain fee-billable —
`src/utils/invoiceFees.ts`). In **Self-Service**, the client runs their own collections:
Credyx never force-closes their loads and no fee should be forced, so the entire feature
should not exist for that tier.

Today nothing is tier-aware:

- `isForceCloseEligible()` in `src/utils/invoiceAging.ts` (approved + 90 days past
  expected pay, `AR_POLICY.forceCloseDays`) drives badges and alerts for **all** clients.
- The admin close flow in `AdminInvoiceDetailView.tsx` offers "Force Close" for any
  client's invoice.
- `AdminDashboard` computes a force-close rate across all clients.
- The admin Settings "Force Close After (days)" input is decorative — not wired to
  `AR_POLICY`.

## 2. Target behavior

| | Managed | Self-Service |
|---|---|---|
| Force-close eligibility badges/alerts (client portal) | Shown | **Hidden** |
| Force-close eligibility (admin views) | Shown | Hidden |
| Admin "Force Close" action | Enabled | **Disabled/hidden** |
| `force_closed` status can occur | Yes | Never (guarded in service + UI) |
| Fee on force-closed load | Applies (unchanged) | n/a |
| Resolution path for aged self-service loads | n/a | Client posts payment (spec 2) or requests write-off (spec 1) |

Fee semantics are unchanged: `force_closed` bills, `written_off` doesn't.

## 3. Implementation

### 3.1 Capability flag

Add to `src/utils/clientCapabilities.ts` (see spec 4):

```ts
hasForceClose: boolean   // MANAGED: true, SELF_SERVICE: false
```

### 3.2 Tier-aware eligibility helper

Keep `isForceCloseEligible(invoice)` as the pure aging check; add a wrapper so every
consumer passes through tier logic in one place:

```ts
// src/utils/invoiceAging.ts
export function isForceCloseApplicable(
  invoice: Invoice,
  capabilities: Pick<ClientCapabilities, 'hasForceClose'>
): boolean {
  return capabilities.hasForceClose && isForceCloseEligible(invoice)
}
```

Admin contexts resolve capabilities from the invoice's client
(`getClientCapabilities(client.service_tier)`); client portal already has them in
`ClientPortalContext`.

### 3.3 Client portal

- `src/pages/ClientInvoices.tsx`, `InvoiceDetailWorkspace.tsx`: force-close-eligible
  badges, countdown/urgency copy referencing force-close — render only when
  `hasForceClose`.
- For self-service, aged invoices still show overdue/critical aging severity
  (`collectionsOverdueDays`, `criticalDays` stay tier-agnostic) — only the
  force-close framing disappears.

### 3.4 Admin portal

- `AdminInvoiceDetailView.tsx` close dropdown: hide the "Force Close" option when the
  invoice's client is self-service. "Write Off" remains available (admin write-offs skip
  the approval queue per spec 1).
- **Service-level guard:** whatever function applies `status: 'force_closed'` must
  refuse when the client is self-service — UI hiding alone is not enforcement.
- `AdminDashboard` force-close rate: compute over managed clients' invoices only, and
  label it accordingly.
- Collections work queues: for self-service clients, replace "force-close eligible"
  flags with "aged — awaiting client action" so reps don't chase actions they can't take.

### 3.5 Optional — wire the Settings field

The admin Settings "Force Close After (days)" input should either be removed or wired to
`AR_POLICY.forceCloseDays` (global override persisted in settings storage). If wired,
`isForceCloseEligible` reads the configured value. Per-client overrides are out of scope
unless product asks.

## 4. Edge cases

- **Tier switch Managed → Self-Service:** existing `force_closed` invoices keep their
  status and fees (historical fact). Eligibility badges disappear going forward. No
  retroactive changes.
- **Tier switch Self-Service → Managed:** aged invoices immediately become eligible if
  they pass the 90-day check — acceptable; the aging clock never stopped.
- **Reporting:** any report/export with force-close columns should render "n/a" for
  self-service rather than "0" (avoids implying the metric applies).

## 5. Acceptance criteria

- [ ] Self-service client portal never shows force-close badges, warnings, or copy.
- [ ] Admin cannot force-close a self-service client's invoice (action hidden AND
      service guard refuses).
- [ ] Managed behavior is unchanged: eligibility at 90+ days, fee applies on
      `force_closed`.
- [ ] Admin dashboard force-close rate covers managed clients only.
- [ ] Aged self-service invoices still surface as overdue/critical, framed as awaiting
      client payment or write-off request.
- [ ] Settings "Force Close After (days)" is either functional or removed.
