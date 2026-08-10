# 02 — Parties and roles

## Core parties

### Shipper / customer
Owns the freight. May deduct claim dollars from the broker’s invoice or bill the broker after delivery exceptions (temp, damage, shortage, “received under protest”).

### Receiver / consignee
Often creates the first evidence: POD exceptions, temp readings, refusal, or damage notes. Those notes later become claim exhibits.

### Broker
Intermediary between shipper and carrier. Runs **Claims / Loss & Damage** and **AP / Carrier AP**. When the customer deducts, the broker usually:

- Opens an internal claim ID
- Notifies the carrier (and sometimes insurance)
- Holds carrier payables until settled
- Coordinates settlement remittance and hold release

Broker teams seen in practice:

- **Claims / Carrier Services** — reason, amount, docs, status
- **AP / AP Factoring** — checks, voids, “account on hold,” remittance to factoring

### Carrier
Responsible for cargo care under the rate confirmation / contract and cargo insurance. Must:

- Acknowledge the claim
- Open an insurance claim and get an adjuster / claim number
- Provide evidence (reefer data, photos, temp logs, driver statements)
- Pay policy **deductible** when required
- Stay responsive — silence causes aging holds and factoring chargebacks

### Factoring company / A/R back office
Purchased or collects carrier receivables. Does **not** usually adjudicate liability, but must:

1. Detect holds / short-pays / voided checks
2. Request claim facts from broker
3. Notify the carrier client and push them to act
4. Decide when to keep invoices open vs close/short-pay/charge back
5. Escalate aging (legal / no-buy style pressure on broker AP when unrelated invoices stall)

### Cargo insurer
Pays covered cargo loss under Motor Truck Cargo (or similar) after liability and amount are accepted. Often pays:

- Product / cargo loss to the claimant named in the release (frequently the **broker**)
- Sometimes **loss-handling expenses** (tow, storage, disposal) **directly to vendors**

### Third-party administrator (TPA) / adjuster
Handles the claim for the insurer (e.g. Sedgwick-style adjusters). Typical duties:

- Request and review claim package
- Confirm product loss math
- Separate cargo loss vs tow/storage/disposal
- Issue **Release and Settlement Agreement**
- Submit insurer payment for processing
- Provide **proof of payment** and help trace remittance

### Carrier insurance / claims contact at the carrier
Internal claims mailbox at larger carriers. Critical for deductible payment and chasing the adjuster when the broker will not release holds.

## Communication patterns that matter

| Pattern | Why it matters |
| --- | --- |
| Factoring emails broker claims; CCs carrier | Visibility; broker may still answer thinly |
| Broker prefers carrier-to-broker dialogue | Factoring cannot supply operational defenses (temp setpoints, tarp, etc.) |
| AP voids a check and adds Claims | Payment stop is often how factoring first learns of a claim |
| Carrier + broker + adjuster + insurer on one thread | Needed for settlement payment and hold release |
| Carrier silent to broker | Broker escalates to factoring; invoices near 60+ days risk closure |

## Identifiers to capture on every claim

Always record:

- Carrier legal name + **MC#**
- Broker name + claims contact email
- **Load / PO / PRO / broker claim ID**
- Insurer claim # and adjuster name (when insurance is involved)
- Claim amount (estimated vs finalized)
- Hold scope: one load vs entire account
- Notification dates (carrier notified / insurance notified)
- Related unpaid load numbers and dollar totals on hold
