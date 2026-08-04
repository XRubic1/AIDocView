-- Waitlist signups table for public marketing site
-- Service: src/services/waitlistService.ts

create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  
  -- Contact info
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  
  -- Company details
  fleet_size text not null,
  hear_about text,
  notes text,
  
  -- Visitor context (for analytics/tracking)
  ip_address text,
  region text,
  device_type text,
  
  -- Admin workflow
  status text not null default 'pending' check (status in ('pending', 'contacted', 'converted', 'archived')),
  admin_notes text,
  
  -- Prevent duplicate emails
  constraint waitlist_signups_email_unique unique (email)
);

-- Indexes for admin queries
create index if not exists waitlist_signups_created_at_idx on public.waitlist_signups (created_at desc);
create index if not exists waitlist_signups_status_idx on public.waitlist_signups (status);
create index if not exists waitlist_signups_email_idx on public.waitlist_signups (email);

-- Enable RLS
alter table public.waitlist_signups enable row level security;

-- Anonymous users can INSERT (public waitlist form)
create policy "Anonymous can join waitlist"
  on public.waitlist_signups
  for insert
  to anon
  with check (true);

-- Authenticated users (service role / admin) can read all
create policy "Service role can read waitlist"
  on public.waitlist_signups
  for select
  to authenticated, service_role
  using (true);

-- Service role can update (admin workflow)
create policy "Service role can update waitlist"
  on public.waitlist_signups
  for update
  to service_role
  using (true);

comment on table public.waitlist_signups is 'Public waitlist signups from marketing site — anonymous insert allowed, matches waitlistService.ts';
