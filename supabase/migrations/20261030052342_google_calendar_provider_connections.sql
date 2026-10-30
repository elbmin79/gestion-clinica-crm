begin;

create table public.clinic_provider_google_calendar_connections (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider_id uuid not null,
  google_email text not null check (length(trim(google_email)) between 3 and 320),
  calendar_id text not null default 'primary' check (length(trim(calendar_id)) between 1 and 1024),
  refresh_token_ciphertext text not null,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('success', 'partial', 'error')),
  last_sync_error text check (last_sync_error is null or length(last_sync_error) <= 500),
  primary key (clinic_id, provider_id),
  foreign key (provider_id, clinic_id)
    references public.clinic_providers(id, clinic_id) on delete cascade
);

alter table public.clinic_provider_google_calendar_connections enable row level security;
revoke all on public.clinic_provider_google_calendar_connections from public, anon, authenticated;
grant select, insert, update, delete on public.clinic_provider_google_calendar_connections to service_role;

create table public.clinic_google_calendar_event_links (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null,
  provider_id uuid,
  calendar_id text not null,
  google_email text not null,
  updated_at timestamptz not null default now(),
  primary key (clinic_id, appointment_id),
  foreign key (appointment_id, clinic_id)
    references public.appointments(id, clinic_id) on delete cascade
);

create index clinic_google_calendar_event_links_provider_idx
  on public.clinic_google_calendar_event_links (clinic_id, provider_id);
alter table public.clinic_google_calendar_event_links enable row level security;
revoke all on public.clinic_google_calendar_event_links from public, anon, authenticated;
grant select, insert, update, delete on public.clinic_google_calendar_event_links to service_role;

-- Preserve the known destination for events already created by the clinic-wide connection.
insert into public.clinic_google_calendar_event_links
  (clinic_id, appointment_id, provider_id, calendar_id, google_email, updated_at)
select distinct on (job.clinic_id, job.appointment_id)
  job.clinic_id, job.appointment_id, null, connection.calendar_id,
  connection.google_email, coalesce(job.completed_at, job.updated_at)
from public.clinic_google_calendar_sync_jobs as job
join public.clinic_google_calendar_connections as connection
  on connection.clinic_id = job.clinic_id
where job.status = 'succeeded'
order by job.clinic_id, job.appointment_id, job.completed_at desc nulls last, job.updated_at desc
on conflict (clinic_id, appointment_id) do nothing;

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

  if new.status <> 'completed' and (
    exists (
      select 1 from public.clinic_google_calendar_connections as connection
      where connection.clinic_id = new.clinic_id
    )
    or exists (
      select 1 from public.clinic_provider_google_calendar_connections as connection
      where connection.clinic_id = new.clinic_id
        and connection.provider_id = new.provider_id
    )
    or exists (
      select 1 from public.clinic_google_calendar_event_links as event_link
      where event_link.clinic_id = new.clinic_id
        and event_link.appointment_id = new.id
    )
  ) then
    insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
    values (new.clinic_id, new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_enqueue_google_calendar_sync on public.appointments;
create trigger appointments_enqueue_google_calendar_sync
  after insert or update of starts_at, ends_at, status, provider_id on public.appointments
  for each row execute function private.enqueue_google_calendar_appointment_sync();

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
    raise exception 'Google Calendar is not connected for this clinic.' using errcode = '22023';
  end if;

  insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
  select appointment.clinic_id, appointment.id
    from public.appointments as appointment
   where appointment.clinic_id = target_clinic_id
     and appointment.status in ('pending', 'confirmed')
     and appointment.starts_at >= now()
     and appointment.starts_at < now() + interval '90 days'
     and (
       exists (
         select 1 from public.clinic_google_calendar_connections as connection
         where connection.clinic_id = appointment.clinic_id
       )
       or exists (
         select 1 from public.clinic_provider_google_calendar_connections as connection
         where connection.clinic_id = appointment.clinic_id
           and connection.provider_id = appointment.provider_id
       )
     )
     and not exists (
       select 1 from public.clinic_google_calendar_sync_jobs as prior
       where prior.clinic_id = appointment.clinic_id
         and prior.appointment_id = appointment.id
         and prior.status = 'succeeded'
     )
  on conflict do nothing;
  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

create or replace function public.queue_google_calendar_provider_initial_sync(
  target_clinic_id uuid,
  target_provider_id uuid
)
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
    select 1 from public.clinic_provider_google_calendar_connections as connection
    where connection.clinic_id = target_clinic_id
      and connection.provider_id = target_provider_id
  ) then
    raise exception 'This professional has no connected Google Calendar.' using errcode = '22023';
  end if;

  insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
  select appointment.clinic_id, appointment.id
    from public.appointments as appointment
   where appointment.clinic_id = target_clinic_id
     and appointment.provider_id = target_provider_id
     and appointment.status in ('pending', 'confirmed')
     and appointment.starts_at >= now()
     and appointment.starts_at < now() + interval '90 days'
  on conflict do nothing;
  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

drop function public.claim_google_calendar_sync_jobs(uuid, integer);
create function public.claim_google_calendar_sync_jobs(
  target_clinic_id uuid default null,
  target_limit integer default 10,
  target_provider_id uuid default null
)
returns table(job_id uuid, clinic_id uuid, appointment_id uuid, attempts integer)
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
      select job.id
        from public.clinic_google_calendar_sync_jobs as job
       where ((job.status = 'queued' and job.next_attempt_at <= now())
          or (job.status = 'processing' and job.updated_at < now() - interval '10 minutes'))
         and (target_clinic_id is null or job.clinic_id = target_clinic_id)
         and (target_provider_id is null or exists (
           select 1 from public.appointments as appointment
           where appointment.clinic_id = job.clinic_id
             and appointment.id = job.appointment_id
             and appointment.provider_id = target_provider_id
         ) or exists (
           select 1 from public.clinic_google_calendar_event_links as event_link
           where event_link.clinic_id = job.clinic_id
             and event_link.appointment_id = job.appointment_id
             and event_link.provider_id = target_provider_id
         ))
       order by job.created_at
       for update skip locked
       limit least(greatest(coalesce(target_limit, 10), 1), 50)
    )
    update public.clinic_google_calendar_sync_jobs as job
       set status = 'processing', attempts = job.attempts + 1, updated_at = now(), last_error = null
      from picked
     where job.id = picked.id
    returning job.id, job.clinic_id, job.appointment_id, job.attempts;
end;
$$;

revoke all on function public.queue_google_calendar_initial_sync(uuid) from public, anon, authenticated;
revoke all on function public.queue_google_calendar_provider_initial_sync(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_google_calendar_sync_jobs(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.queue_google_calendar_initial_sync(uuid) to service_role;
grant execute on function public.queue_google_calendar_provider_initial_sync(uuid, uuid) to service_role;
grant execute on function public.claim_google_calendar_sync_jobs(uuid, integer, uuid) to service_role;

commit;
