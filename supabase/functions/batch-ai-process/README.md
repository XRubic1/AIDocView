# batch-ai-process

Background worker for automated AI verification after batch submit.

## Auth

- **User JWT** (client / Credyx submit kick via `supabase.functions.invoke`)
- **Cron**: header `x-cron-secret: $OPS_CRON_SECRET`

## Schedule (optional)

In Supabase Dashboard → Edge Functions → Schedules, or `pg_cron` + `net.http_post`:

```
POST /functions/v1/batch-ai-process
Header: x-cron-secret: <OPS_CRON_SECRET>
Body: { "limit": 5 }
```

Every 1–2 minutes is enough.

## Deploy

```bash
supabase functions deploy batch-ai-process --project-ref ptjwykrnwejrwslmqzcz
supabase db push
```
