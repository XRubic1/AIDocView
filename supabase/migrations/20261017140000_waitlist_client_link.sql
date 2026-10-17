-- Link a waitlist lead to the client account created from it (Waitlist → Set up account).
alter table public.waitlist_signups
  add column if not exists client_id text references public.clients(id) on delete set null,
  add column if not exists converted_at timestamptz;

create index if not exists waitlist_signups_client_id_idx on public.waitlist_signups (client_id);
