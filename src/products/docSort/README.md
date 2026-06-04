# DocSort (standalone product)

DocSort matches and groups **rate confirmations** with **bills of lading** from a bulk PDF upload. It does **not** run AIDocView verification (no approval checks, Excel, or rules engine).

## Routes

- `/docsort` — DocSort marketing landing
- `/sort` — DocSort workbench UI

## How it works

1. User uploads many PDFs.
2. Each file gets one lightweight AI call (page 1) to classify and extract load #, broker, carrier, pickup, delivery.
3. Pure code matches BOLs to rate cons by load number and lane hints.
4. UI shows grouped loads plus unmatched rate cons, BOLs, and other doc types.
5. **Binder** exports a single merged **PDF** named `{load#}.pdf`, or `{invoice#}.pdf` if an invoice was generated for that load. Cover page includes AI disclaimer. **Full binder** downloads a ZIP of one PDF per matched load.
6. Vision extracts **rate** from rate cons (AI — always verify). Invoice amount pre-fills from extracted rate.

## Configuration

Uses the same `VITE_OPENAI_API_KEY` as the monorepo. Optional:

- `VITE_DOCSORT_PARALLEL` — concurrent scans (default `4`)

## Separation from AIDocView

- Lives under `src/products/docSort/`
- No imports from `LoadReviewWorkbench`, review rules, or audit pipelines
- Safe to package or sell independently later

## Credyx A/R consumer

Credyx client **AI upload** imports DocSort via `src/integrations/docSortToCredyx.ts` and `src/services/credyx/batchIntakePipeline.ts` (sort → invoice PDFs → client confirm → `mockBatches`). Admin **AI Review** uses AIDocView `reviewUploadedDocuments` in `src/services/credyx/batchAiReviewService.ts`. The `/sort` route is optional for ops; production client/admin flows use `/client/batches` and `/batches`.
