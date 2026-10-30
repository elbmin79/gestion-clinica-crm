-- Server-only OAuth credentials for a clinic's Google Calendar connection.
-- The refresh token is encrypted by the application before it is stored.
create table public.clinic_google_calendar_connections (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  google_email text not null check (length(trim(google_email)) between 3 and 320),
  calendar_id text not null default 'primary' check (length(trim(calendar_id)) between 1 and 1024),
  refresh_token_ciphertext text not null,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('success', 'partial', 'error')),
  last_sync_error text check (last_sync_error is null or length(last_sync_error) <= 500)
);

alter table public.clinic_google_calendar_connections enable row level security;
revoke all on public.clinic_google_calendar_connections from public, anon, authenticated;
grant select, insert, update, delete on public.clinic_google_calendar_connections to service_role;

create table public.clinic_google_calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (appointment_id, clinic_id) references public.appointments(id, clinic_id) on delete cascade
);

create unique index clinic_google_calendar_active_job_unique
  on public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
  where status in ('queued', 'processing');
create index clinic_google_calendar_queued_jobs_idx
  on public.clinic_google_calendar_sync_jobs (next_attempt_at, created_at)
  where status = 'queued';

alter table public.clinic_google_calendar_sync_jobs enable row level security;
revoke all on public.clinic_google_calendar_sync_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.clinic_google_calendar_sync_jobs to service_role;

create function private.enqueue_google_calendar_appointment_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.starts_at is not distinct from new.starts_at
     and old.ends_at is not distinct from new.ends_at
     and old.status is not distinct from new.status then
    return new;
  end if;
  if new.status <> 'completed' and exists (
    select 1 from public.clinic_google_calendar_connections as connection
    where connection.clinic_id = new.clinic_id
  ) then
    insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
    values (new.clinic_id, new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger appointments_enqueue_google_calendar_sync
  after insert or update of starts_at, ends_at, status on public.appointments
  for each row execute function private.enqueue_google_calendar_appointment_sync();

revoke all on function private.enqueue_google_calendar_appointment_sync() from public, anon, authenticated;

create function public.queue_google_calendar_initial_sync(target_clinic_id uuid)
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

create function public.claim_google_calendar_sync_jobs(target_clinic_id uuid default null, target_limit integer default 10)
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
revoke all on function public.claim_google_calendar_sync_jobs(uuid, integer) from public, anon, authenticated;
grant execute on function public.queue_google_calendar_initial_sync(uuid) to service_role;
grant execute on function public.claim_google_calendar_sync_jobs(uuid, integer) to service_role;
