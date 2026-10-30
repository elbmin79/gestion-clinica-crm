begin;

-- Only a professional's own connected Google account receives appointment events.
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
      select 1 from public.clinic_provider_google_calendar_connections as connection
      where connection.clinic_id = new.clinic_id
        and connection.provider_id = new.provider_id
    )
    or exists (
      select 1 from public.clinic_google_calendar_event_links as event_link
      where event_link.clinic_id = new.clinic_id
        and event_link.appointment_id = new.id
        and event_link.provider_id is not null
    )
  ) then
    insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
    values (new.clinic_id, new.id)
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
    select 1 from public.clinic_provider_google_calendar_connections as connection
    where connection.clinic_id = target_clinic_id
  ) then
    raise exception 'No professional Google Calendar is connected for this clinic.' using errcode = '22023';
  end if;

  insert into public.clinic_google_calendar_sync_jobs (clinic_id, appointment_id)
  select appointment.clinic_id, appointment.id
    from public.appointments as appointment
   where appointment.clinic_id = target_clinic_id
     and appointment.status in ('pending', 'confirmed')
     and appointment.starts_at >= now()
     and appointment.starts_at < now() + interval '90 days'
     and exists (
       select 1 from public.clinic_provider_google_calendar_connections as connection
       where connection.clinic_id = appointment.clinic_id
         and connection.provider_id = appointment.provider_id
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

create or replace function public.claim_google_calendar_sync_jobs(
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
         and (
           (
             target_provider_id is not null
             and (
               exists (
                 select 1 from public.appointments as appointment
                 where appointment.clinic_id = job.clinic_id
                   and appointment.id = job.appointment_id
                   and appointment.provider_id = target_provider_id
                   and exists (
                     select 1 from public.clinic_provider_google_calendar_connections as connection
                     where connection.clinic_id = appointment.clinic_id
                       and connection.provider_id = appointment.provider_id
                   )
               )
               or exists (
                 select 1 from public.clinic_google_calendar_event_links as event_link
                 where event_link.clinic_id = job.clinic_id
                   and event_link.appointment_id = job.appointment_id
                   and event_link.provider_id = target_provider_id
               )
             )
           )
           or (
             target_provider_id is null
             and (
               exists (
                 select 1 from public.appointments as appointment
                 join public.clinic_provider_google_calendar_connections as connection
                   on connection.clinic_id = appointment.clinic_id
                  and connection.provider_id = appointment.provider_id
                 where appointment.clinic_id = job.clinic_id
                   and appointment.id = job.appointment_id
               )
               or exists (
                 select 1 from public.clinic_google_calendar_event_links as event_link
                 where event_link.clinic_id = job.clinic_id
                   and event_link.appointment_id = job.appointment_id
                   and event_link.provider_id is not null
               )
             )
           )
         )
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

commit;
