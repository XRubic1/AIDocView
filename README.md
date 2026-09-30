# Credyx A/R Solutions

Multi-tenant accounts receivable platform — **Vite + React + TypeScript + Supabase**.

## Getting started

### Prerequisites

- Node.js 20+
- A Supabase project with migrations applied

### Setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`.

3. Install and run:

```bash
npm install
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000).

### Admin bootstrap

Admin login uses **Supabase Auth**. The account must have **`app_metadata.role = "admin"`** (not user metadata).

**Option A — Supabase Dashboard (no script)**

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **Users**.
2. Click **Add user** → **Create new user**.
3. Email: `admin@credyx.net`, set a password, enable **Auto Confirm User**.
4. Open the new user → **App Metadata** (Raw JSON) and set:

```json
{ "role": "admin" }
```

5. Sign in at `/login` with that email and password.

**Option B — CLI script (recommended)**

1. Copy the **service_role** key from **Project Settings → API** into `.env` as `SUPABASE_SERVICE_ROLE_KEY` (never commit this).
2. Run:

```bash
npm run create-admin -- --email admin@credyx.net --password 'your-secure-password'
```

This creates the user (or promotes an existing one) with the admin role.

**Dedicated admin (force confirm payments)**

To show **Force confirm** on Post payment / Post short payment (skips managed-client receipt confirmation), set App Metadata:

```json
{ "role": "admin", "admin_tier": "dedicated" }
```

Or set `"can_force_confirm_payments": true` on any admin account.

**Common login errors**

| Error | Cause |
|-------|--------|
| Invalid login credentials | Wrong email/password, or user does not exist |
| This account does not have admin access | User exists but `app_metadata.role` is not `"admin"` |

### Edge Functions

Deploy functions under `supabase/functions/`:

- `openai-proxy` — server-side OpenAI (requires `OPENAI_API_KEY`)
- `send-email` — Resend transactional email (requires `RESEND_API_KEY`, recommended `RESEND_FROM_EMAIL`)
- `provision-client-auth` — client invite on approval (`SUPABASE_SERVICE_ROLE_KEY`)
- `mc-lookup` — carrier broker credit check at `/mclookup` (`COMPASS_EMAIL`, `COMPASS_PASSWORD`, `TRUFUNDING_USERNAME`, `TRUFUNDING_PASSWORD`, `FACTORSNETWORK_USERNAME`, `FACTORSNETWORK_PASSWORD`)

#### Email (`send-email`)

Set secrets on the Supabase project, then redeploy:

```bash
supabase secrets set RESEND_API_KEY=re_xxx \
  RESEND_FROM_EMAIL="Credyx <notifications@credyx.net>" \
  RESEND_FROM_BROKER="Credyx Billing <billing@credyx.net>" \
  RESEND_FROM_CARRIER="Credyx Ops <ops@credyx.net>"
# Optional: where replies should land (otherwise replies go to the From address)
# RESEND_REPLY_TO_BROKER=billing@credyx.net
# RESEND_REPLY_TO_CARRIER=ops@credyx.net
supabase functions deploy send-email
```

Use a **verified** Resend domain for From addresses. Broker templates use `RESEND_FROM_BROKER` when set; carrier templates use `RESEND_FROM_CARRIER`; both fall back to `RESEND_FROM_EMAIL`. Without `RESEND_API_KEY`, the function returns “Email not configured” and callers do not mark paperwork as delivered.

**Replies:** Credyx does not ingest reply email into the app. Point each From (or `RESEND_REPLY_TO_*`) at a real inbox or forwarder if you want to read responses.

On **Process batch**, Credyx:

1. Emails each approved invoice’s broker a packet with real attachments (invoice files + Document Vault **broker** docs such as NOAs).
2. Emails the carrier that the batch was processed, including any holds and a paperwork send summary.

Edit subject/body copy in the admin portal: **Settings → Email templates** (stored in `email_templates`; `send-email` loads them at send time). See **Admin Docs → Paperwork email** for limits and From routing.

## Project structure

```
src/                 # React SPA (pages, components, services)
supabase/migrations/ # Postgres schema + RLS
supabase/functions/  # Edge Functions
docs/                # Launch readiness + feature specs
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (port 3000) |
| `npm run build` | Typecheck + production build |
| `npm test` | Vitest unit tests |
| `npm run lint` | TypeScript check |

## Security

- Supabase Auth required for admin and client portals
- RLS tenant isolation (no anon data bypass)
- OpenAI API key server-side only via Edge Function

See [docs/LAUNCH_READINESS.md](docs/LAUNCH_READINESS.md) for the full launch checklist.
