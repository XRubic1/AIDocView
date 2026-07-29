# Credyx legal drafts

Attorney-reviewable templates for Credyx. These are **drafts**, not finalized counsel-approved documents.

## Public vs signed-contract identity

| Surface | What clients see |
| --- | --- |
| Marketing site `/privacy`, `/terms` | **Credyx A/R Solutions** only — no personal name |
| MSA opening party line (**once**) | **Petar Kostic**, doing business as **Credyx A/R Solutions** (“Credyx”) |
| Rest of MSA, exhibits, signature block | **Credyx** / **Credyx A/R Solutions** only (defined term) |

One identification at the start of the MSA is standard: later “Credyx” means that same party. Exhibits incorporate the MSA definition and do not repeat the personal name. Until a separate company exists, that d/b/a line is how a sole proprietor contracts under a trade name. Branding as Credyx does **not** by itself create limited personal liability.

If this Git repo is **public**, be aware the MSA markdown includes the personal name once.

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
| [FEE_SCHEDULE.md](./FEE_SCHEDULE.md) | **Exhibit A** — $99 platform + % of collections (or negotiated rate), Payoneer, lock rules |
| [AUTHORIZATION_TO_ACT.md](./AUTHORIZATION_TO_ACT.md) | **Exhibit B** — authority to email brokers / submit packets; not factoring |

Yes: when a carrier starts, the **MSA + Fee Schedule + Authorization** are the pack that covers what Credyx does, what % (or flat) you charge, remittance rules, and limits of liability.

## Placeholders / contacts

| Field | Value |
| --- | --- |
| Effective date | July 29, 2026 |
| Privacy contact | privacy@credyx.net |
| Notices | notices@credyx.net |
| Notice / cure periods in MSA | 30 days / 15 days (confirm with counsel if needed) |

Public pages no longer show a “draft / LEGAL_ENTITY_NAME” banner. Party identification remains **Petar Kostic d/b/a Credyx A/R Solutions** once in the MSA only.

## Liability posture (draft)

Website Terms and MSA cap Credyx’s liability to a client at the **fees that client paid to Credyx in the 3 months before the claim** (not freight amounts paid by brokers). Counsel must review carve-outs and enforceability.

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

- Enroll flow optional Terms/Privacy checkbox (client login already requires Terms + Privacy)
- Cookie consent banner
- Forming a separate legal entity for limited liability
- Cyber / tech E&O insurance (recommended when storing W-9s and bank docs)

**MSA** is **not** accepted in-app. Send `docs/legal/pdf/Credyx-Carrier-MSA.pdf` (+ exhibits) for electronic signature separately.

## Review note

Have qualified counsel review and adapt these templates for your jurisdiction, industry, and actual vendors before relying on them with customers or regulators.
