-- Admin bell notification for every new waitlist signup.
-- Runs in the database so it fires even though the anonymous visitor cannot
-- write admin_notifications directly.

create or replace function public.credyx_notify_admin_waitlist_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_notifications (id, type, title, message, timestamp, read, link, link_label, metadata)
  values (
    'admin-notif-waitlist-' || new.id::text,
    'system_alert',
    'New waitlist signup',
    coalesce(nullif(new.company_name, ''), 'A carrier')
      || ' joined the waitlist'
      || coalesce(' — ' || nullif(new.contact_name, ''), '')
      || coalesce(' (' || nullif(new.fleet_size, '') || ' trucks)', ''),
    coalesce(new.created_at, now()),
    false,
    '/admin/waitlist',
    'View waitlist',
    jsonb_build_object(
      'waitlist_signup_id', new.id,
      'company_name', new.company_name,
      'contact_name', new.contact_name,
      'email', new.email,
      'phone', new.phone,
      'fleet_size', new.fleet_size
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.credyx_notify_admin_waitlist_signup() from public, anon, authenticated;

drop trigger if exists credyx_waitlist_signup_admin_notification on public.waitlist_signups;
create trigger credyx_waitlist_signup_admin_notification
  after insert on public.waitlist_signups
  for each row execute function public.credyx_notify_admin_waitlist_signup();
