# 01 — Stolen ID (carrier identity theft)

## What “stolen ID” means in trucking

**Stolen ID** (carrier identity theft) is when someone books or hauls freight while pretending to be a real, authorized carrier — usually by using that carrier’s **MC#**, **DOT#**, company name, insurance certificate, or dispatch contacts without permission.

It is closely related to **double brokering** and **ghost carriers**: the shipper/broker thinks a trusted MC is on the load, but a different (often uninsured or unvetted) truck actually picks up.

Victims typically include:

| Party | Impact |
| --- | --- |
| **Real carrier whose ID was stolen** | Cargo claims, insurance hits, frozen broker accounts, reputation damage for loads they never ran |
| **Broker / shipper** | Freight theft, unpaid claims, bad delivery, regulatory exposure |
| **Factoring / A/R partner** | Advances on invoices for loads the client never hauled; chargebacks; claim holds |

## How it usually happens

1. Fraudster obtains or spoofs a legitimate carrier’s authority details (MC/DOT, COI, W-9, dispatch email that looks real).
2. They book a load with a broker as that carrier (or as a “dispatch” for that carrier).
3. Pickup happens with a different truck / driver; paperwork may be forged or incomplete.
4. Freight is stolen, shorted, or delivered under suspicious BOLs.
5. When something goes wrong, the **real** MC gets the claim, hold, or investigation.

## Red flags (identity / booking side)

- Carrier “dispatch” email does not match known company domains (free Gmail/Yahoo for a large MC).
- Phone numbers, COI producer, or remittance details suddenly change.
- Carrier says they never booked the load / never dispatched that truck.
- Rate con carrier name/MC does not match who actually picked up.
- Multiple brokers report the same MC on loads the carrier denies.
- Pressure to change payment instructions mid-load.

## Red flags (paperwork / BOL side)

These often show up **after** booking and are exactly what AI doc review should catch:

- **Broker listed as both shipper and receiver** on the BOL (see [risky loads](./02-risky-loads.md)).
- **No real shipper or receiver facility** (name/address) on the BOL — only vague party names or blanks.
- BOL ship-from / ship-to looks like a broker office, not a warehouse/DC.
- Missing or suspicious delivery proof; weak or stamped-over signatures.
- Load / reference numbers that do not line up across rate con, BOL, and invoice.

## What ops should do when stolen ID is suspected

1. **Freeze trust, not just one invoice** — pause funding / approval until identity is verified.
2. **Call known good contacts** for the real carrier (not only the email on the rate con).
3. Ask the broker: who was dispatched, what truck/trailer, and can they confirm the MC independently (FMCSA / Safer).
4. Preserve all docs (rate con, BOL, POD, emails, check calls).
5. If cargo is missing: treat as theft + potential claim path ([claims docs](../claims/README.md)); notify insurance early.
6. Do **not** auto-approve paperwork that already failed identity-risk BOL checks.

## Stolen ID vs ordinary claim

| | Stolen ID / fraud | Ordinary cargo claim |
| --- | --- | --- |
| Core question | Was this even our carrier / real facilities? | Who is liable for damage/temp/shortage? |
| First action | Verify identity + stop payment | Open claim file, gather POD/reefer, chase adjuster |
| Paperwork | Often incomplete, broker-as-party, missing facilities | Often has real shipper/receiver and exception notes |

When in doubt, route the load to **Needs review** and treat it as fraud-risk until cleared.
