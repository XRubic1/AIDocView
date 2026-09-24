# blueprint-wake-cron

Advances due Blueprint **Wait** clocks without an open browser tab.

1. Selects `blueprint_runs` with `status = waiting` and `wait_until <= now`
2. Walks the saved graph past Wait → When / Then-do / Done / next Wait
3. Invoice Then-do: notes on `notes_history`; payment/follow-up emails via Resend
4. Upserts `blueprint_runs` (and invoice notes) with the service role

## Auth

- **Cron**: header `x-cron-secret: $OPS_CRON_SECRET`
- **Admin JWT**: Authorization bearer (same pattern as `broker-risk-weekly`)

## Required secrets

```bash
supabase secrets set OPS_CRON_SECRET=<random> --project-ref <ref>
# For Then-do emails (optional but recommended):
supabase secrets set RESEND_API_KEY=re_... --project-ref <ref>
```

## Schedule

Suggested every **15–60 minutes**:

```
POST /functions/v1/blueprint-wake-cron
Header: x-cron-secret: <OPS_CRON_SECRET>
Body: { "limit": 40 }
```

Without a schedule, staff can still use Inbox / Activity **Run blueprints** (invokes this function when Supabase is configured, else local tick).

## Deploy

```bash
supabase functions deploy blueprint-wake-cron --project-ref <ref>
```

Apply the blueprints migration first so `blueprint_runs` / `blueprints` exist.
