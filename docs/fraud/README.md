# Fraud & identity risk

Operational guidance for **stolen carrier ID**, double-brokering patterns, and **high-risk BOL / load** signals. These checks are also enforced (or flagged) during AI document review.

## Contents

| Doc | What it covers |
| --- | --- |
| [01 — Stolen ID](./01-stolen-id.md) | Carrier identity theft, how it works, what to do |
| [02 — Risky loads](./02-risky-loads.md) | BOL / party red flags (including broker-as-shipper+receiver and missing facilities) |
| [03 — AI review checks](./03-ai-review-checks.md) | How Credyx flags these during paperwork review |

## Related

- Cargo claims (after a real loss): [`docs/claims/`](../claims/README.md)
- Broker payment risk (slow pay history) is separate from paperwork fraud — see broker risk features in-app.
- External MC authority lookup: [`docs/integrations/BROKERSNAPSHOT.md`](../integrations/BROKERSNAPSHOT.md)
