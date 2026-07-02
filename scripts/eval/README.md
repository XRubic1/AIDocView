# AIDocView regression eval harness

This folder runs the **full document review pipeline** (`reviewUploadedDocuments`) outside the browser and compares results to checked-in expectations. Use it to catch silent verdict changes when prompts, models, or rules change.

## Layout

```
scripts/eval/
  run.ts                 # CLI entry
  cases/
    <case-name>/
      expected.json      # Expected verdict, signatures, flags, page types
      documents/         # Optional PDFs/images (live / record)
      pages/             # Optional pre-rendered page images (stable raster input)
      fixtures/
        openai-calls.json  # Recorded OpenAI responses (mock / CI)
```

## Modes

| Mode | Command | API cost |
|------|---------|----------|
| **Mock** (CI) | `npm run eval:mock` | None — replays `fixtures/openai-calls.json` |
| **Live** | `npm run eval:live -- --case my-load` | Real OpenAI calls |
| **Record** | `npm run eval:record -- --case my-load` | Live once; writes fixtures for mock |

Mock mode exercises the **deterministic verdict engine** (fail-closed gate, rules fence, consensus merge) with zero API spend.

## Running

```bash
# All mock cases (default 3 runs each — reports verdict flip-rate)
npm run eval:mock

# Single case, 5 runs for consistency check
npm run eval:live -- --case bol-missing-receiver-mock --runs 5

# Record fixtures from a real problem load (requires VITE_OPENAI_API_KEY)
npm run eval:record -- --case my-problem-load
```

Exit code `0` = all cases passed; `1` = regression or consistency failure.

## `expected.json` schema

```json
{
  "id": "unique-case-id",
  "description": "What this case guards",
  "documents": [
    { "id": "doc-1", "name": "packet.pdf", "path": "documents/packet.pdf" }
  ],
  "expected": {
    "verdict": "NEEDS_REVIEW",
    "receiverSignature": "MISSING",
    "pageClassifications": [
      { "fileName": "packet.pdf", "pageNumber": 2, "pageType": "proof_of_delivery" }
    ],
    "flagsMustInclude": ["receiver", "fail_closed"],
    "flagsMustNotInclude": ["tonu_no_bol"]
  },
  "consistency": { "maxVerdictFlipRate": 0 },
  "env": { "VITE_AI_SIGNATURE_CONSENSUS": "2" }
}
```

- **verdict** — `crossValidation.overall` after the fail-closed gate
- **receiverSignature** — merged BOL audit receiver status
- **flagsMustInclude** — substring match against `crossValidation.flags[].message`
- **maxVerdictFlipRate** — max fraction of runs that disagree on verdict (default `0`)

## Adding a case from a real problem load

Example: an invoice packet that **false-approved** without a receiver signature.

1. **Create the case directory**

   ```bash
   mkdir -p scripts/eval/cases/missing-receiver-invoice/documents
   ```

2. **Copy inputs** (PDFs from the problem upload) into `documents/`.  
   For stable CI raster input, optionally export pages to `pages/page-01.jpg`, … and reference them:

   ```json
   "documents": [{
     "id": "packet",
     "name": "invoice-and-bol.pdf",
     "pagesDir": "pages",
     "pageFiles": ["page-01.jpg", "page-02.jpg"]
   }]
   ```

3. **Record fixtures** (one live run):

   ```bash
   export VITE_OPENAI_API_KEY=sk-...
   npm run eval:record -- --case missing-receiver-invoice
   ```

   This writes `fixtures/openai-calls.json` with every OpenAI call in order.

4. **Set expectations** in `expected.json` from the recorded run (verdict should be `NEEDS_REVIEW`, receiver `MISSING` or `UNCLEAR`, include fail-closed flag text).

5. **Verify mock CI path**:

   ```bash
   npm run eval:mock -- --case missing-receiver-invoice --runs 3
   ```

6. **Commit** `expected.json`, `fixtures/openai-calls.json`, and inputs (PDFs or page images).  
   Do **not** commit API keys.

## Consistency metric

Each case runs **N times** (default 3). The runner reports **verdict flip-rate**: the fraction of runs whose verdict differs from the dominant verdict. For deterministic mock fixtures this should be **0%**. Live runs may show non-zero flip-rate when the model is unstable — tighten prompts/seed or use mock fixtures for CI gates.

## Architecture notes

- Eval code lives under `scripts/eval/` and is **not** included in the Vite client bundle (`tsconfig.json` only includes `src/`).
- Minimal platform hooks in `src/platform/` (`runtimeEnv`, `openaiTransport`, `reviewImageRasterizer`, `domSurface`) let Node inject env, mock OpenAI, canvas, and rasterizers before importing `documentReviewService`.
