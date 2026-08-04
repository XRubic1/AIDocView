# Credyx legal drafts

Attorney-reviewable templates for Credyx. These are **drafts**, not finalized counsel-approved documents.

**Note:** Credyx A/R Solutions is the trading name of **Electro Pionir DOOEL** (Republic of North Macedonia).

## Public vs signed-contract identity

| Surface | What clients see |
| --- | --- |
| Marketing site `/privacy`, `/terms` | **Credyx A/R Solutions** + legal entity **Electro Pionir DOOEL** in the operator / contact lines |
| MSA opening party line | **Electro Pionir DOOEL**, d/b/a **Credyx A/R Solutions** |
| Rest of MSA, exhibits, signature block | Defined term **Credyx**; signature block shows legal entity + trading as |
| Broker Notice | Legal entity, trading as, registered office, notices email |


## Documents

### Public site

| File | Public route | Purpose |
| --- | --- | --- |
| [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) | `/privacy` | How Credyx collects and uses data |
| [WEBSITE_TERMS.md](./WEBSITE_TERMS.md) | `/terms` | Website / waitlist Terms of Use |

### Signed at onboarding (carrier pack)

| File | Purpose |
| --- | --- |
| [CARRIER_MSA.md](./CARRIER_MSA.md) | **Main client agreement** — services, document rules, liability, term |
| [FEE_SCHEDULE.md](./FEE_SCHEDULE.md) | **Exhibit A** — $99 platform + % of collections (or negotiated rate), payment processing, lock rules |
| [AUTHORIZATION_TO_ACT.md](./AUTHORIZATION_TO_ACT.md) | **Exhibit B** — authority to email brokers / submit packets; not factoring |
| [BROKER_NOTICE_OF_AUTHORIZATION.md](./BROKER_NOTICE_OF_AUTHORIZATION.md) | **Broker-facing notice** — send to brokers/payors; Carrier confirms Credyx may submit docs/invoices, follow up, and attach remittance/NOA; payments never to Credyx; revocation by written notice |

Yes: when a carrier starts, the **MSA + Fee Schedule + Authorization** are the pack that covers what Credyx does, what % (or flat) you charge, remittance rules, and limits of liability. Use the **Broker Notice** when informing brokers that Credyx is authorized to act for that Carrier.

## Placeholders / contacts

| Field | Value |
| --- | --- |
| Legal entity | Electro Pionir DOOEL |
| Trading as | Credyx A/R Solutions |
| Registered office | Oktomvriska Revolucija 22A lok.3, Skopje, Republic of North Macedonia |
| Governing law | Republic of North Macedonia |
| Arbitration | UNCITRAL Rules; one arbitrator; seat Skopje; PCA Secretary-General appointing authority |
| Effective date | July 29, 2026 |
| Privacy contact | privacy@credyx.net |
| Notices | notices@credyx.net |
| Notice / cure periods in MSA | 30 days / 15 days (confirm with counsel if needed) |

Public pages identify the operator as Electro Pionir DOOEL, d/b/a Credyx A/R Solutions.

## Liability posture (draft)

Website Terms and MSA cap Credyx's liability to a client at the **fees that client paid to Credyx in the 3 months before the claim** (not freight amounts paid by brokers). Counsel must review carve-outs and enforceability.

## Product UI

- React pages: `src/pages/PrivacyPolicy.tsx`, `src/pages/WebsiteTerms.tsx`
- Linked from Waitlist, Tour, and Enroll footers
- Client login requires checkbox: Terms of Use + Privacy Policy (not MSA)
- Also registered in `WaitlistApp.tsx` for marketing-only deploys
- MSA pack is **PDF for electronic signature** — not accepted in the login UI

## Branded PDFs

See **[pdf/README.md](./pdf/README.md)** for generate steps.

```bash
npm run legal:pdf
```

Output: `docs/legal/pdf/`

## Still later

- Optional company registration / tax ID on Broker Notice and MSA if counsel recommends it
- Optional phone number on Broker Notice for broker verification callbacks
- Enroll flow optional Terms/Privacy checkbox (client login already requires Terms + Privacy)
- Cookie consent banner
- Counsel check: commercial-collection licensing in target US states (Credyx never receives freight funds; still worth a one-time opinion)
- Cyber / tech E&O insurance (recommended when storing W-9s and bank docs)
- Optional later: US entity / merchant-of-record if Stripe self-serve billing is needed

**MSA** is **not** accepted in-app. Send `docs/legal/pdf/Credyx-Carrier-MSA.pdf` (+ exhibits) for electronic signature separately.

## Review note

Have qualified counsel review and adapt these templates for your jurisdiction, industry, and actual vendors before relying on them with customers or regulators.
