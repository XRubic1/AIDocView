# 02 — Risky loads (paperwork & party patterns)

High-risk loads are loads where the **parties or facilities on the documents do not look like a normal shipper → consignee move**. These patterns correlate with freight theft, stolen carrier ID, and fictitious BOL schemes.

## Critical red flags (always escalate)

### 1. Broker is also shipper **and** receiver on the BOL

**Rule:** If the broker (from the rate confirmation) appears as **both** the shipper/ship-from party **and** the receiver/consignee/ship-to party on the BOL, treat the load as **very high risk**.

Why it matters:

- A normal BOL shows a real **shipper facility** and a real **receiver facility**.
- When the broker fills both ends, there may be no independent warehouse confirming pickup or delivery.
- Common in identity-theft / double-broker / paper-load patterns where freight movement is fabricated or uncontrolled.

**Examples of risky party lines**

| Ship-from (BOL) | Ship-to (BOL) | Rate-con broker | Risk |
| --- | --- | --- | --- |
| Acme Brokerage LLC | Acme Brokerage LLC | Acme Brokerage | **Critical** — broker both ends |
| Acme Logistics | Acme Logistics – Dallas | Acme Logistics Inc | **Critical** — same broker both ends (fuzzy name) |
| Walmart DC 6023, TX | Costco Depot, OH | Acme Brokerage | Normal party layout |
| Acme Brokerage LLC | Walmart DC 6023, TX | Acme Brokerage | Elevated — broker as shipper only (still review) |
| Walmart DC 6023, TX | Acme Brokerage LLC | Acme Brokerage | Elevated — broker as receiver only (still review) |

Broker-as-one-end can be legitimate in some cross-dock / broker-controlled yard cases, but **broker on both ends** should never auto-approve.

### 2. No shipper facility and no receiver facility

**Rule:** If the BOL does **not** show a usable **shipper facility** and does **not** show a usable **receiver facility**, treat the load as **very high risk**.

A usable facility usually includes:

- A company / location name **and**
- Address-like detail (street and/or city + state / ZIP), warehouse/DC identifiers, etc.

**Very risky examples**

| Ship-from | Ship-to | Why risky |
| --- | --- | --- |
| *(blank)* | *(blank)* | No facilities at all |
| “As directed” | “As directed” | No real facilities |
| Broker name only | Broker name only | No facility addresses |
| City only (“Dallas”) | City only (“Houston”) | No facility identity |
| “Shipper” | “Consignee” | Placeholder labels, not facilities |

**Acceptable examples**

| Ship-from | Ship-to |
| --- | --- |
| Tyson Foods – 100 Packers Rd, Springdale, AR 72762 | Walmart DC #6023 – 4500 Distribution Dr, Sealy, TX 77474 |
| Nestle DC, 200 Industrial Blvd, Allentown, PA | Sysco Houston, 1260 Lockwood Dr, Houston, TX 77020 |

## Other risky-load examples

| Pattern | Why it is risky |
| --- | --- |
| Ship-from/ship-to are residential addresses for freight that should be DC/warehouse | Theft / diversion risk |
| BOL parties do not resemble rate-con origin/destination at all | Wrong or fabricated paperwork |
| Only broker phone/email as “facility” contact, no dock address | No independent delivery proof location |
| High-value freight + weak signatures + thin party info | Classic theft target combo |
| Carrier on rate con disputes the load while BOL already “delivered” | Possible stolen ID |
| Repeated “under protest” / shortage with vague facilities | May be claim **or** fraud — escalate either way |

## Severity guide for reviewers

| Signal | Suggested handling |
| --- | --- |
| Broker = shipper **and** receiver | **Needs review / hold funding** — verify with broker + carrier |
| Missing shipper **and** receiver facilities | **Needs review / hold funding** — request corrected BOL or facility confirmation |
| Broker on one end only | Review; confirm yard/cross-dock story |
| One facility missing but the other is solid | Review; may be scan/crop issue — check other BOL pages |
| Facilities match rate-con stops | Normal path (still run signature/destination checks) |

## Tie-in to stolen ID

Missing facilities and broker-as-both-ends are not proof of stolen ID by themselves — but they are **primary paperwork signals** used in stolen-ID and freight-fraud reviews. See [01 — Stolen ID](./01-stolen-id.md) and [03 — AI review checks](./03-ai-review-checks.md).
