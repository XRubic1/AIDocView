# email-inbound

Resend **Receiving** webhook → Supabase `email_threads` / `email_messages` / `email_review_items`.

Staff see mail on Admin → Inbox → **Received** / **Needs review**.

## Test mailbox (do not touch billing@)

Use **`system@credyx.net`** for inbound testing so **`billing@credyx.net`** keeps its current Cloudflare → Gmail path.

### Why this works

`credyx.net` MX stays on **Cloudflare Email Routing**. You add a **new rule only for `system@`**. Resend never steals the root MX, so billing is unchanged.

### Toddler steps

1. **Resend → Receiving**  
   - Prefer a **subdomain** for inbound (e.g. `inbound.credyx.net`) so root MX stays Cloudflare.  
   - Or use Resend’s managed `*.resend.app` receiving address.  
   - Note the address that accepts mail (example: `catch@inbound.credyx.net` or `xxx@yyy.resend.app`).

2. **Cloudflare → Email → Email Routing → Routes**  
   - Custom address: `system@credyx.net`  
   - Actions (both):  
     - Forward to your Gmail (optional, for a human copy)  
     - Forward to the Resend receiving address from step 1  
   - Leave **`billing@`** rules alone.

3. **Resend → Webhooks** → `email.received` →  

```
POST https://ptjwykrnwejrwslmqzcz.supabase.co/functions/v1/email-inbound
Header: x-webhook-secret: <RESEND_INBOUND_WEBHOOK_SECRET>
```

4. **Test** — send any mail to `system@credyx.net`. It should hit Gmail (if configured) and Admin Inbox → **Received**.

5. **Optional reply-loop test** (temporary only):

```bash
npx supabase secrets set RESEND_REPLY_TO_BROKER=system@credyx.net --project-ref ptjwykrnwejrwslmqzcz
```

Broker “Reply” then lands on `system@`. When done testing, set Reply-To back to `billing@credyx.net`.

## Auth

Header (preferred) or query:

```
x-webhook-secret: $RESEND_INBOUND_WEBHOOK_SECRET
# or ?secret=$RESEND_INBOUND_WEBHOOK_SECRET
```

Secret is **required** when `SUPABASE_URL` is not localhost.

```bash
supabase secrets set RESEND_INBOUND_WEBHOOK_SECRET=<random> --project-ref <ref>
```

## Production mailbox later

When ready to capture real broker replies on **`billing@credyx.net`**, use the same pattern: Cloudflare rule for `billing@` → Gmail **and** Resend receiving address (do **not** move root MX to Resend).

## Deploy

```bash
supabase functions deploy email-inbound --project-ref <ref>
```

## Behavior

- Webhook is **metadata only**. Function fetches full text/html via Resend Receiving API (`RESEND_API_KEY`).
- Prefers `system@` / `billing@` / `received_for` (Cloudflare forward target) when multiple `to` values exist.
- Matches invoice via `INV…` or `load:…` in subject/body.
- Matched: upsert thread, insert inbound message, stamp `email_lifecycle.*.lastInboundAt` when a chase track is open.
- Always inserts a `pending_review` row for Admin Inbox.
