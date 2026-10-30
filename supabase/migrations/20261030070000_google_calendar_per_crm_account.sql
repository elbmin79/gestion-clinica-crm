-- Google Calendar OAuth connections belong to the CRM account that authorized them.
-- Each CRM user can independently connect a Google account and sync clinic appointments.

alter table public.clinic_google_calendar_connections
  drop constraint clinic_google_calendar_connections_pkey;
alter table public.clinic_google_calendar_connections
  add primary key (clinic_id, connected_by);
alter table public.clinic_google_calendar_connections
  alter column connected_by set not null;

alter table public.clinic_google_calendar_event_links
  add column connected_by uuid references auth.users(id) on delete cascade;
update public.clinic_google_calendar_event_links as event_link
   set connected_by = coalesce(
     (select connection.connected_by
        from public.clinic_provider_google_calendar_connections as connection
       where connection.clinic_id = event_link.clinic_id
         and connection.provider_id = event_link.provider_id),
     (select connection.connected_by
        from public.clinic_google_calendar_connections as connection
       where connection.clinic_id = event_link.clinic_id
       order by connection.connected_at
       limit 1),
     (select membership.user_id
        from public.clinic_memberships as membership
       where membership.clinic_id = event_link.clinic_id
         and membership.role = 'admin'
       order by membership.created_at
       limit 1)
   );
delete from public.clinic_google_calendar_event_links where connected_by is null;
alter table public.clinic_google_calendar_event_links
  alter column connected_by set not null;
alter table public.clinic_google_calendar_event_links
  drop constraint clinic_google_calendar_event_links_pkey;
alter table public.clinic_google_calendar_event_links
  add primary key (clinic_id, appointment_id, connected_by);

alter table public.clinic_google_calendar_sync_jobs
  add column user_id uuid references auth.users(id) on delete cascade;
update public.clinic_google_calendar_sync_jobs as job
   set user_id = coalesce(
     (select event_link.connected_by from public.clinic_google_calendar_event_links as event_link
       where event_link.clinic_id = job.clinic_id and event_link.appointment_id = job.appointment_id limit 1),
     (select connection.connected_by from public.clinic_google_calendar_connections as connection
       where connection.clinic_id = job.clinic_id order by connection.connected_at limit 1),
     (select connection.connected_by from public.clinic_provider_google_calendar_connections as connection
       join public.appointments as appointment on appointment.clinic_id = connection.clinic_id and appointment.provider_id = connection.provider_id
       where appointment.clinic_id = job.clinic_id and appointment.id = job.appointment_id limit 1)
   );
delete from public.clinic_google_calendar_sync_jobs where user_id is null;
alter table public.clinic_google_calendar_sync_jobs alter column user_id set not null;
drop index if exists public.clinic_google_calendar_active_job_unique;
create unique index clinic_google_calendar_active_job_unique
  on public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id, user_id)
  where status in ('queued', 'processing');

create or replace function private.enqueue_google_calendar_appointment_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.starts_at is not distinct from new.starts_at
     and old.ends_at is not distinct from new.ends_at
     and old.status is not distinct from new.status
     and old.provider_id is not distinct from new.provider_id then
    return new;
  end if;

  if new.status <> 'completed' then
    insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id, user_id)
    select new.clinic_id, new.id, connection.connected_by
      from public.clinic_google_calendar_connections as connection
     where connection.clinic_id = new.clinic_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.queue_google_calendar_initial_sync(target_clinic_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare queued_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Google Calendar queueing is restricted to the server.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.clinic_google_calendar_connections as connection
    where connection.clinic_id = target_clinic_id
  ) and not exists (
    select 1 from public.clinic_provider_google_calendar_connections as connection
    where connection.clinic_id = target_clinic_id
  ) then
    raise exception 'No Google Calendar account is connected for this clinic.' using errcode = '22023';
  end if;

  insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id, user_id)
  select appointment.clinic_id, appointment.id, connection.connected_by
    from public.appointments as appointment
    join public.clinic_google_calendar_connections as connection on connection.clinic_id = appointment.clinic_id
   where appointment.clinic_id = target_clinic_id
     and appointment.status in ('pending', 'confirmed')
     and appointment.starts_at >= now()
     and appointment.starts_at < now() + interval '90 days'
     and not exists (
       select 1 from public.clinic_google_calendar_sync_jobs as prior
       where prior.clinic_id = appointment.clinic_id
         and prior.appointment_id = appointment.id
         and prior.user_id = connection.connected_by
         and prior.status = 'succeeded'
     )
  on conflict do nothing;
  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

create or replace function public.queue_google_calendar_user_initial_sync(target_clinic_id uuid, target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare queued_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Google Calendar queueing is restricted to the server.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clinic_google_calendar_connections as connection
    where connection.clinic_id = target_clinic_id and connection.connected_by = target_user_id) then
    raise exception 'This CRM account has no connected Google Calendar.' using errcode = '22023';
  end if;
  insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id, user_id)
  select appointment.clinic_id, appointment.id, target_user_id
    from public.appointments as appointment
   where appointment.clinic_id = target_clinic_id
     and appointment.status in ('pending', 'confirmed')
     and appointment.starts_at >= now()
     and appointment.starts_at < now() + interval '90 days'
  on conflict do nothing;
  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

revoke all on function public.queue_google_calendar_initial_sync(uuid) from public, anon, authenticated;
grant execute on function public.queue_google_calendar_initial_sync(uuid) to service_role;
revoke all on function public.queue_google_calendar_user_initial_sync(uuid, uuid) from public, anon, authenticated;
grant execute on function public.queue_google_calendar_user_initial_sync(uuid, uuid) to service_role;
drop function public.claim_google_calendar_sync_jobs(uuid, integer, uuid);
create function public.claim_google_calendar_sync_jobs(
  target_clinic_id uuid default null,
  target_limit integer default 10,
  target_provider_id uuid default null,
  target_user_id uuid default null
)
returns table(job_id uuid, clinic_id uuid, appointment_id uuid, attempts integer, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Google Calendar dispatch is restricted to the server.' using errcode = '42501';
  end if;
  return query
    with picked as (
      select job.id from public.clinic_google_calendar_sync_jobs as job
       where ((job.status = 'queued' and job.next_attempt_at <= now())
          or (job.status = 'processing' and job.updated_at < now() - interval '10 minutes'))
         and (target_clinic_id is null or job.clinic_id = target_clinic_id)
         and (target_user_id is null or job.user_id = target_user_id)
         and exists (select 1 from public.clinic_google_calendar_connections as connection
           where connection.clinic_id = job.clinic_id and connection.connected_by = job.user_id)
       order by job.created_at for update skip locked
       limit least(greatest(coalesce(target_limit, 10), 1), 50)
    )
    update public.clinic_google_calendar_sync_jobs as job
       set status = 'processing', attempts = job.attempts + 1, updated_at = now(), last_error = null
      from picked where job.id = picked.id
    returning job.id, job.clinic_id, job.appointment_id, job.attempts, job.user_id;
end;
$$;
revoke all on function public.claim_google_calendar_sync_jobs(uuid, integer, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_google_calendar_sync_jobs(uuid, integer, uuid, uuid) to service_role;
