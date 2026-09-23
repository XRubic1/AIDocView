# batch-ai-process

Background worker that runs the **full batch pipeline browser-free**:

1. **Doc Split** (`docSplitPipeline.ts`) — when a batch has handoff documents but no
   invoices yet: split multi-page PDFs (pdf-lib), classify pages RC/BOL/INV via
   OpenAI vision, extract rate-con/BOL fields, match documents into loads
   (`_shared/docSortMatch.ts` — kept in sync with the browser matcher, guarded by
   `src/products/docSort/utils/docSortMatchParity.test.ts`), and create invoice packets.
2. **AI verification** — rebuild the review for each invoice from the snapshot extracts.

Every step checkpoints into `batch.doc_sort_snapshot`, so a slice that runs out of
time (100s budget) re-queues the job and the next tick resumes where it stopped.
Manual RC/BOL/INV marks in the snapshot always win over AI classification.

The browser pipeline still runs as the fast path when a tab is open; jobs locked by a
live tab (heartbeat < 2 min) are skipped, stale locks from closed tabs are reclaimed.

## Auth

- **User JWT** (client / Credyx submit kick via `supabase.functions.invoke`)
- **Cron**: header `x-cron-secret: $OPS_CRON_SECRET`

## Required secrets

```bash
supabase secrets set OPENAI_API_KEY=sk-... --project-ref ptjwykrnwejrwslmqzcz
supabase secrets set OPS_CRON_SECRET=<random> --project-ref ptjwykrnwejrwslmqzcz
# optional: override the model (defaults to gpt-4.1-2025-04-14)
supabase secrets set AI_PRIMARY_MODEL=gpt-4.1-2025-04-14 --project-ref ptjwykrnwejrwslmqzcz
```

`OPENAI_API_KEY` is now **required** — the doc split pipeline calls OpenAI directly
from the edge function (PDF file inputs, no browser rasterization).

## Schedule (required for browser-free operation)

Without the cron schedule, batches only progress while a browser tab is open.
In Supabase Dashboard → Edge Functions → Schedules, or `pg_cron` + `net.http_post`:

```
POST /functions/v1/batch-ai-process
Header: x-cron-secret: <OPS_CRON_SECRET>
Body: { "limit": 5 }
```

Every 1–2 minutes. Each tick processes up to `limit` jobs within a ~100s time
budget; long batches automatically continue across ticks from their checkpoint.

## Deploy

```bash
supabase functions deploy batch-ai-process --project-ref ptjwykrnwejrwslmqzcz
supabase db push
```

## Local typecheck

```powershell
& "$env:USERPROFILE\.deno\bin\deno.exe" check `
  supabase/functions/batch-ai-process/index.ts `
  supabase/functions/batch-ai-process/docSplitPipeline.ts `
  supabase/functions/_shared/docSortMatch.ts
```
