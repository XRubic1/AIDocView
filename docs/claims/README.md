# Freight Claims Documentation

Operational knowledge for how cargo / freight claims are filed, communicated, held against payables, and resolved between **carriers**, **brokers**, **factoring / A/R partners**, and **insurance**.

This library is built from real claim correspondence and will grow as more case material is added.

## Contents

| Doc | What it covers |
| --- | --- |
| [01 — Overview](./01-overview.md) | What a claim is, who gets hurt financially, and the end-to-end lifecycle |
| [02 — Parties & roles](./02-parties-and-roles.md) | Carrier, broker, shipper/receiver, factoring, insurance, adjusters |
| [03 — Claim types](./03-claim-types.md) | Common loss reasons seen in practice |
| [04 — Filing & notification](./04-filing-and-notification.md) | How claims are opened, evidence, and notice expectations |
| [05 — Holds & payment impact](./05-holds-and-payment-impact.md) | Account freezes, short-pays, voided checks, spreading holds |
| [06 — Resolution & settlement](./06-resolution-and-settlement.md) | Insurance, deductibles, releases, payment tracing, closure |
| [07 — Ops playbook](./07-ops-playbook.md) | Standard questions, templates, escalation, carrier vs broker comms |
| [08 — Case patterns](./08-case-patterns.md) | Anonymized patterns learned from real threads |

## How to use

- **A/R / collections teams:** start with [05](./05-holds-and-payment-impact.md) and [07](./07-ops-playbook.md).
- **Carrier-facing ops:** start with [04](./04-filing-and-notification.md) and [06](./06-resolution-and-settlement.md).
- **Product / process design:** read [01](./01-overview.md) then [08](./08-case-patterns.md).

## Related

- Stolen ID / risky BOL patterns (fraud prevention): [`docs/fraud/`](../fraud/README.md)
- External MC / authority lookup (BrokerSnapshot): [`docs/integrations/BROKERSNAPSHOT.md`](../integrations/BROKERSNAPSHOT.md)

## Source note

Material is derived from broker–carrier–factoring email chains (claims desks, AP, carrier services, insurance adjusters). Banking remittance details from those threads are **not** reproduced here.
