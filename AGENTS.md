# AGENTS.md

## Cursor Cloud specific instructions

Credyx A/R Solutions is a Vite + React + TypeScript SPA backed by a **hosted Supabase**
project (Postgres + Auth + Storage + Edge Functions). See `README.md` for the full setup,
admin bootstrap, and Edge Function deployment docs. Standard scripts live in `package.json`.

### Services & how to run them

| Surface | Command | Port | Backend needed |
| --- | --- | --- | --- |
| Main SPA (admin + client portal) | `npm run dev` | 3000 | Yes — hosted Supabase |
| Waitlist marketing site | `npm run dev:waitlist` | 3001 | No |

- The dev VM starts with `npm install` already run (the startup update script). Do not add
  service startup to that script.
- Dev servers are configured to auto-open a browser (`open: true`). In a headless VM this is
  harmless; pass `-- --host 0.0.0.0` when you need external access.

### Lint / test / build

- `npm test` — Vitest unit tests (91 tests, ~2s). No external services required.
- `npm run lint` — `tsc --noEmit`. Pure type check, no external services.
- `npm run build` — `tsc && vite build`. The `vite build` stage works on its own; run
  `npx vite build` to bundle without the type-check gate.

### Non-obvious caveats

- **Supabase is required for the main app.** Without `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`, `SupabaseConfigGate` renders a "Configuration required"
  screen and auth/data never bootstrap. This is expected, not a bug. There is **no** local
  Supabase config in the repo (no `config.toml`, no docker-compose) — the project targets a
  hosted Supabase project with `supabase/migrations/` applied. To run the full A/R product,
  set those two `VITE_SUPABASE_*` vars (in `.env`) pointing at a Supabase project.
- **The waitlist form is Phase 1 (UI-only).** Submitting it shows a local success state and
  does **not** persist to any backend, so it is the best no-backend end-to-end smoke test.
- Admin login requires a Supabase user with `app_metadata.role = "admin"` (see `README.md`
  "Admin bootstrap"). Client portal users need `app_metadata.client_id`.
- Edge Functions in `supabase/functions/` (openai-proxy, send-email, etc.) are deployed to
  Supabase, not run locally; AI/email flows need their secrets set on the Supabase project.
- `SETUP_COMPLETE.md` at the repo root is stale (describes an old Next.js scaffold). Trust
  `README.md` and the Vite/Supabase layout instead.
