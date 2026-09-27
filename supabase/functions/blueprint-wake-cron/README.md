# blueprint-wake-cron

Enrolls and advances blueprint runs without an open browser tab.

Each tick:

1. Inserts the standard chase graphs if they are not saved yet (does not overwrite edits)
2. Assigns open invoices to paperwork chase, payment chase, or hold notice
3. Advances due Waits and parked Whens (paperwork sent, paperwork good, on hold)
4. Sends the Then-do email from the card’s template, From, and CC
5. Sends the carrier batch-processed notice for batches submitted in the last 36 hours, once

`email-lifecycle-chase` calls this same runner, so an older chase schedule keeps working.

Broker replied / no reply are not evaluated.

## Auth

- **Cron**: header `x-cron-secret: $OPS_CRON_SECRET`
- **Admin JWT**: Authorization bearer (same pattern as `broker-risk-weekly`)

## Required secrets

```bash
supabase secrets set OPS_CRON_SECRET=<random> --project-ref <ref>
supabase secrets set RESEND_API_KEY=re_... --project-ref <ref>
# Optional From override (card From is used when set):
supabase secrets set RESEND_FROM_BROKER="Credyx <billing@credyx.net>" --project-ref <ref>
```

## Schedule

Suggested every **15–60 minutes** (either function):

```
POST /functions/v1/blueprint-wake-cron
Header: x-cron-secret: <OPS_CRON_SECRET>
Body: { "limit": 40 }
```

## Deploy

```bash
supabase functions deploy blueprint-wake-cron --project-ref <ref>
supabase functions deploy email-lifecycle-chase --project-ref <ref>
```

Apply the blueprints migration first so `blueprint_runs` / `blueprints` exist.
