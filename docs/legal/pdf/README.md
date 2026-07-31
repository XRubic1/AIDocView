# Credyx legal PDFs

Branded PDFs generated from the markdown drafts in `docs/legal/`.

## Generate / refresh all PDFs

From the **project root** (`AIDocView-main`):

```bash
npm run legal:pdf
```

That runs `scripts/generateLegalPdfs.ts` and writes files into this folder.

### Requirements

- Node.js installed
- Dependencies installed once: `npm install`
- Logo used on each page: `public/credyx-logo-black-cred-no-bg.png`

### Output files

| File | Source |
| --- | --- |
| `Credyx-Carrier-MSA.pdf` | `../CARRIER_MSA.md` |
| `Credyx-Fee-Schedule-Exhibit-A.pdf` | `../FEE_SCHEDULE.md` |
| `Credyx-Authorization-to-Act-Exhibit-B.pdf` | `../AUTHORIZATION_TO_ACT.md` |
| `Credyx-Broker-Notice-of-Authorization.pdf` | `../BROKER_NOTICE_OF_AUTHORIZATION.md` |
| `Credyx-Privacy-Policy.pdf` | `../PRIVACY_POLICY.md` |
| `Credyx-Website-Terms.pdf` | `../WEBSITE_TERMS.md` |

### If a PDF is open / locked (Windows)

Close the PDF in your viewer, then run `npm run legal:pdf` again.

If a file stays locked, the script may write a sibling like `Credyx-Carrier-MSA.new.pdf` instead. Close the original and re-run to overwrite the main name.

### After editing legal markdown

1. Edit the `.md` files in `docs/legal/`
2. Run `npm run legal:pdf`
3. Send the updated PDFs for electronic signature (MSA + exhibits), or publish Privacy/Terms from the site (`/privacy`, `/terms`)

### Styling notes

Each page includes:

- Credyx logo in the header
- Faded center watermark
- Navy / blue Credyx palette (`#0F2A35`, `#1684FE`)
