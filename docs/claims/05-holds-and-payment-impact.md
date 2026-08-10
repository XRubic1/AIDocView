# 05 — Holds and payment impact

Claims affect money long before they are “won” or “lost.” Understanding hold mechanics is essential for A/R and carrier ops.

## Hold scopes

| Scope | Meaning | Ops implication |
| --- | --- | --- |
| **Single load** | Only the claimed load’s payable is blocked | Other invoices with that broker may still pay |
| **Multiple related loads** | Claim recovery spread across several payables | Common when claim > any one load’s freight bill |
| **Entire carrier account** | All loads with that broker are frozen | Later unrelated loads also stick; aging escalates fast |

Brokers may start with one load and later expand. Always re-ask: *entire account or specific loads?*

## Why brokers hold more than the claimed load

1. **Insufficient payables** on the claim load to cover the deduction  
   Example pattern: customer deducted ~$11.6K; broker must recover from carrier but “don’t have enough payables on file.”
2. **Spread recovery** across open loads until the balance is covered  
   Example: tarp claim ~$5.4K spread because no single load equals the amount due.
3. **Policy / risk** — entire account held until insurance settles large losses  
   Example: six-figure trailer + product claim → all carrier loads on hold.

## Payment actions brokers take

| Action | What factoring sees |
| --- | --- |
| Stop scheduling payment | Load missing from weekly AP reports |
| **Void a check** already issued | Check mailed then voided “due to claim pending” on another load |
| Short-pay a load | Partial remittance; remainder tied to claim |
| Refuse all payouts | “Nothing will be paid out until this is resolved” |
| Release after settlement | Hold removed once claim settled **and paid** |

Important: a voided check on **Load B** may be collateral damage for a claim on **Load A** for the same carrier MC#.

## Short-pay and invoice closure (factoring side)

When the broker will not pay remaining balance:

1. Notify the carrier that invoices will be closed short / charged back if they do not act.
2. Give a clear deadline (often end of day / end of week).
3. If claim resolution is stalled and invoices approach ~60 days, factoring may begin closing those broker invoices.
4. If a short payment arrives (e.g. small residual after claim), confirm with carrier before force-closing.

## Aging pressure vs claim holds

Not every past-due is a claim — but claims often **masquerade** as silent AP delays. Sequence used in practice:

1. Ask for payment status on aging invoices.
2. AP reveals voided check / hold and brings Claims onto the thread.
3. Claims states amount + “hold removed once settled and paid.”
4. Factoring switches from pure collections mode to **claim management mode** with the carrier.

Separate track: if broker AP is unresponsive on *non-claim* aging, factoring may threaten legal action or temporary **no-buy** treatment. Do not confuse that escalation with claim settlement itself.

## Release conditions (common broker language)

Holds are typically removed only when:

- Claim is **settled and paid**, or
- Deductible received **and** insurer remittance applied, or
- Broker confirms balance owed is cleared (carrier payment or payable offset)

Proof that insurance “submitted payment for processing” is **not** the same as broker confirming funds received. Holds often remain during payment-tracing gaps.
