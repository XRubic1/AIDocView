# Mobile invoice status view (marketing mock → integration)

Source: Credyx Instagram / marketing graphic (left mobile panel).  
Purpose: Structured reference for a future **mobile client portal** invoice status screen.

---

## Screen summary

Dark-mode mobile layout showing one open invoice, its collection progress, and three actionable status rows (overdue, broker silence, expected pay date).

| Field | Value |
| --- | --- |
| Brand | Credyx A/R Solutions |
| Theme | Dark navy / graphite |
| Accent | Bright blue (`#1684FE` brand blue) |
| Danger / overdue text | Coral / red-orange |
| Layout | Single column: invoice card → status list |

---

## Structured data (integration payload)

Use this as a mock fixture or API shape later.

```json
{
  "brand": {
    "name": "Credyx",
    "tagline": "A/R Solutions"
  },
  "invoice": {
    "id": "INV-73489",
    "displayId": "#INV-73489",
    "label": "INVOICE",
    "brokerName": "Summit Logistics",
    "invoiceDate": "2024-04-28",
    "invoiceDateLabel": "Apr 28, 2024",
    "amount": 4850.0,
    "amountLabel": "$4,850.00",
    "status": "pending",
    "statusLabel": "PENDING"
  },
  "progress": {
    "steps": [
      { "id": "submitted", "label": "Submitted", "state": "complete" },
      { "id": "verified", "label": "Verified", "state": "upcoming" },
      { "id": "invoiced", "label": "Invoiced", "state": "upcoming" },
      { "id": "paid", "label": "Paid", "state": "upcoming" }
    ],
    "activeIndex": 0,
    "progressRatio": 0.125,
    "stepMeanings": {
      "submitted": "Invoice/packet submitted to Credyx",
      "verified": "Paperwork verified — good to go",
      "invoiced": "PPW sent to broker",
      "paid": "Invoice paid"
    }
  },
  "alerts": [
    {
      "id": "payment_overdue",
      "icon": "clock",
      "title": "Payment is overdue",
      "subtitle": "18 days past due",
      "subtitleTone": "danger",
      "badgeCount": null,
      "chevron": true,
      "action": "open_payment_status"
    },
    {
      "id": "broker_no_response",
      "icon": "mail",
      "title": "No response from broker",
      "subtitle": "Last email sent 3 days ago",
      "subtitleTone": "muted",
      "badgeCount": 1,
      "chevron": true,
      "action": "open_broker_messages"
    },
    {
      "id": "payment_not_received",
      "icon": "dollar",
      "title": "Payment not received",
      "subtitle": "Expected: May 15, 2024",
      "subtitleTone": "muted",
      "badgeCount": null,
      "chevron": true,
      "action": "open_expected_payment"
    }
  ],
  "footer": {
    "icon": "shield_check",
    "label": "Credyx A/R Solutions"
  }
}
```

---

## Component tree

```
MobileInvoiceStatusView
├── BrandHeader (Credyx wordmark + “A/R Solutions”)
├── InvoiceCard
│   ├── HeaderRow
│   │   ├── Eyebrow “INVOICE”
│   │   └── IdBadge “#INV-73489”
│   ├── MetaRow
│   │   ├── Broker (“Summit Logistics”)
│   │   └── Date (“Apr 28, 2024”)
│   ├── AmountRow
│   │   ├── Amount “$4,850.00”
│   │   └── StatusPill (dot + “PENDING”)
│   └── ProgressStepper
│       ├── Submitted (complete)
│       ├── Verified (upcoming)
│       ├── Invoiced (upcoming)
│       └── Paid (upcoming)
├── AlertList
│   ├── AlertRow (clock) — overdue
│   ├── AlertRow (mail) — no broker response + badge “1”
│   └── AlertRow (dollar) — payment not received
└── TrustFooter (shield check + “Credyx A/R Solutions”)
```

---

## UI field map

### Invoice card

| UI label | Data key | Example |
| --- | --- | --- |
| INVOICE | `invoice.label` | INVOICE |
| #INV-… | `invoice.displayId` | #INV-73489 |
| Broker | `invoice.brokerName` | Summit Logistics |
| Date | `invoice.invoiceDateLabel` | Apr 28, 2024 |
| Amount | `invoice.amountLabel` | $4,850.00 |
| Status | `invoice.statusLabel` | PENDING |

### Progress steps (left → right)

**Correct Credyx order** (do not use Delivered):

| Step | Meaning | State in mock | Visual |
| --- | --- | --- | --- |
| Submitted | Packet submitted to Credyx | `complete` | Filled blue node + blue label |
| Verified | Paperwork verified, good to go | `upcoming` | Hollow gray node + gray label |
| Invoiced | PPW sent to broker | `upcoming` | Hollow gray node + gray label |
| Paid | Invoice paid | `upcoming` | Hollow gray node + gray label |

Progress line: filled from **Submitted** partway toward **Verified**.

### Alert rows

| Title | Subtitle | Icon | Extra |
| --- | --- | --- | --- |
| Payment is overdue | 18 days past due | Clock | Subtitle in danger color |
| No response from broker | Last email sent 3 days ago | Envelope | Blue badge `1` |
| Payment not received | Expected: May 15, 2024 | Dollar | — |

Each row is tappable (trailing chevron `>`).

---

## Design notes (match mock)

- Card + alert rows: dark surface, rounded corners, thin blue border / glow
- Status pill: dark fill, blue outline, solid blue status dot
- Alert icons: blue stroke inside circular blue ring
- Overdue subtitle uses coral/red; other subtitles muted gray
- Keep copy short — mobile-first; no dense tables on this screen

---

## Suggested TypeScript types (later)

```ts
type ProgressStepState = 'complete' | 'current' | 'upcoming'

interface InvoiceProgressStep {
  id: 'submitted' | 'verified' | 'invoiced' | 'paid'
  label: string
  state: ProgressStepState
}

interface InvoiceStatusAlert {
  id: string
  icon: 'clock' | 'mail' | 'dollar'
  title: string
  subtitle: string
  subtitleTone: 'danger' | 'muted'
  badgeCount?: number | null
  action: string
}

interface MobileInvoiceStatusViewModel {
  invoice: {
    id: string
    displayId: string
    brokerName: string
    invoiceDate: string
    amount: number
    status: 'pending' | string
    statusLabel: string
  }
  progress: {
    steps: InvoiceProgressStep[]
    activeIndex: number
  }
  alerts: InvoiceStatusAlert[]
}
```

---

## Integration notes

1. **Demo data only** — broker name, amounts, and dates are marketing placeholders; replace with live invoice + payment + note sources.
2. **Map to product language** — portal statuses today use values like `open`, `hold`, `disputed`, `paid`. Decide how `PENDING` and the Delivered → Paid stepper map onto real invoice/batch/payment states.
3. **Alert derivation** — overdue days, last broker email, and expected pay date should come from aging, communications, and expected-payment logic (not hard-coded).
4. **Right-side marketing copy** (not part of the mobile UI data):  
   - “Still wondering why an invoice hasn’t been paid?”  
   - “We find the answer. We keep you updated.”

---

## Checklist for implementation

- [ ] Add fixture JSON under `src/` or Storybook from the payload above
- [ ] Build `InvoiceCard` + `ProgressStepper` + `AlertList` for mobile breakpoint
- [ ] Wire stepper states to real invoice lifecycle
- [ ] Wire alerts to overdue / messages / expected payment
- [ ] Match dark theme tokens (`--cp-*` / Credyx blue `#1684FE`)
