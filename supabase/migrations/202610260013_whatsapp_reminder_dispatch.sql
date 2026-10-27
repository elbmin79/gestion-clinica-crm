-- Server-side WhatsApp delivery. This migration creates no credentials and
-- sends no messages; only the service-role worker may claim or settle rows.
alter table public.appointment_reminders
  drop constraint appointment_reminders_status_check,
  add constraint appointment_reminders_status_check
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled', 'unknown')),
  add column sending_started_at timestamptz;

-- A worker that died while a provider request was in flight must not cause an
-- automatic duplicate. Expired leases become unknown and require review.
create function public.claim_due_appointment_reminders(target_limit integer default 20)
returns table (
  reminder_id uuid,
  kind text,
  patient_name text,
  appointment_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Reminder dispatch is restricted to the server worker.' using errcode = '42501';
  end if;

  update public.appointment_reminders as reminder
     set status = 'unknown',
         sending_started_at = null,
         last_error = 'Worker stopped after claiming; provider delivery is uncertain.',
         updated_at = now()
   where reminder.status = 'sending'
     and (reminder.sending_started_at is null
       or reminder.sending_started_at < now() - interval '2 minutes');

  update public.appointment_reminders as reminder
     set status = case when appointment.status = 'confirmed'
                       and appointment.reminder_schedule_version = reminder.schedule_version
                       then 'skipped' else 'cancelled' end,
         last_error = case
           when appointment.status <> 'confirmed' then 'Appointment is no longer confirmed.'
           when appointment.reminder_schedule_version <> reminder.schedule_version then 'Appointment schedule changed.'
           when appointment.starts_at <= now() then 'Appointment has already started.'
           when not patient.appointment_whatsapp_opt_in then 'Patient has not authorized WhatsApp appointment messages.'
           else 'Patient phone number is missing or not in international E.164 format.'
         end,
         updated_at = now()
    from public.appointments as appointment
    join public.patients as patient
      on patient.id = appointment.patient_id
     and patient.clinic_id = appointment.clinic_id
   where reminder.appointment_id = appointment.id
     and reminder.clinic_id = appointment.clinic_id
     and reminder.status in ('pending', 'failed')
     and reminder.scheduled_at <= now()
     and (
       appointment.status <> 'confirmed'
       or appointment.reminder_schedule_version <> reminder.schedule_version
       or appointment.starts_at <= now()
       or not patient.appointment_whatsapp_opt_in
       or coalesce(trim(patient.phone), '') !~ '^\+[1-9][0-9]{7,14}$'
     );

  return query
    with due as (
      select reminder.id
        from public.appointment_reminders as reminder
        join public.appointments as appointment
          on appointment.id = reminder.appointment_id
         and appointment.clinic_id = reminder.clinic_id
         and appointment.reminder_schedule_version = reminder.schedule_version
        join public.patients as patient
          on patient.id = appointment.patient_id
         and patient.clinic_id = appointment.clinic_id
       where (reminder.status = 'pending'
          or (reminder.status = 'failed'
              and reminder.attempt_count < 3
              and reminder.updated_at <= now() - interval '15 minutes'))
         and reminder.scheduled_at <= now()
         and appointment.status = 'confirmed'
         and appointment.starts_at > now()
         and patient.appointment_whatsapp_opt_in
         and coalesce(trim(patient.phone), '') ~ '^\+[1-9][0-9]{7,14}$'
       order by reminder.scheduled_at, reminder.id
       limit greatest(1, least(coalesce(target_limit, 20), 50))
       for update of reminder skip locked
    ), claimed as (
      update public.appointment_reminders as reminder
         set status = 'sending',
             attempt_count = reminder.attempt_count + 1,
             sending_started_at = now(),
             last_error = null,
             updated_at = now()
        from due
       where reminder.id = due.id
       returning reminder.id, reminder.kind, reminder.appointment_id,
                 reminder.clinic_id, reminder.schedule_version
    )
    select claimed.id,
           claimed.kind,
           patient.full_name,
           appointment.starts_at
      from claimed
      join public.appointments as appointment
        on appointment.id = claimed.appointment_id
       and appointment.clinic_id = claimed.clinic_id
      join public.patients as patient
        on patient.id = appointment.patient_id
       and patient.clinic_id = appointment.clinic_id;
end;
$$;

revoke all on function public.claim_due_appointment_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_appointment_reminders(integer) to service_role;

-- Return contact details only for a currently claimed row after a second
-- authorization, schedule, appointment, and phone validation.
create function public.get_claimed_reminder_for_dispatch(target_reminder_id uuid)
returns table (
  phone text,
  patient_name text,
  appointment_at timestamptz,
  kind text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Reminder dispatch is restricted to the server worker.' using errcode = '42501';
  end if;

  update public.appointment_reminders as reminder
     set status = case when appointment.status = 'confirmed'
                       and appointment.reminder_schedule_version = reminder.schedule_version
                       then 'skipped' else 'cancelled' end,
         sending_started_at = null,
         last_error = case
           when appointment.status <> 'confirmed' then 'Appointment is no longer confirmed.'
           when appointment.reminder_schedule_version <> reminder.schedule_version then 'Appointment schedule changed.'
           when appointment.starts_at <= now() then 'Appointment has already started.'
           when not patient.appointment_whatsapp_opt_in then 'Patient has not authorized WhatsApp appointment messages.'
           else 'Patient phone number is missing or not in international E.164 format.'
         end,
         updated_at = now()
    from public.appointments as appointment
    join public.patients as patient
      on patient.id = appointment.patient_id
     and patient.clinic_id = appointment.clinic_id
   where reminder.id = target_reminder_id
     and reminder.appointment_id = appointment.id
     and reminder.clinic_id = appointment.clinic_id
     and reminder.status = 'sending'
     and (
       appointment.status <> 'confirmed'
       or appointment.reminder_schedule_version <> reminder.schedule_version
       or appointment.starts_at <= now()
       or not patient.appointment_whatsapp_opt_in
       or coalesce(trim(patient.phone), '') !~ '^\+[1-9][0-9]{7,14}$'
     );

  return query
    select trim(patient.phone),
           patient.full_name,
           appointment.starts_at,
           reminder.kind
      from public.appointment_reminders as reminder
      join public.appointments as appointment
        on appointment.id = reminder.appointment_id
       and appointment.clinic_id = reminder.clinic_id
       and appointment.reminder_schedule_version = reminder.schedule_version
      join public.patients as patient
        on patient.id = appointment.patient_id
       and patient.clinic_id = appointment.clinic_id
     where reminder.id = target_reminder_id
       and reminder.status = 'sending'
       and reminder.scheduled_at <= now()
       and appointment.status = 'confirmed'
       and appointment.starts_at > now()
       and patient.appointment_whatsapp_opt_in
       and coalesce(trim(patient.phone), '') ~ '^\+[1-9][0-9]{7,14}$';
end;
$$;

revoke all on function public.get_claimed_reminder_for_dispatch(uuid) from public, anon, authenticated;
grant execute on function public.get_claimed_reminder_for_dispatch(uuid) to service_role;

create function public.settle_appointment_reminder(
  target_reminder_id uuid,
  target_status text,
  target_provider_message_id text default null,
  target_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Reminder dispatch is restricted to the server worker.' using errcode = '42501';
  end if;

  if target_status not in ('sent', 'failed', 'unknown') then
    raise exception 'Reminder outcome is invalid.' using errcode = '23514';
  end if;

  update public.appointment_reminders as reminder
     set status = target_status,
         sending_started_at = null,
         provider_message_id = nullif(left(coalesce(target_provider_message_id, ''), 255), ''),
         last_error = nullif(left(coalesce(target_error, ''), 300), ''),
         updated_at = now()
   where reminder.id = target_reminder_id
     and reminder.status = 'sending';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.settle_appointment_reminder(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.settle_appointment_reminder(uuid, text, text, text) to service_role;

-- Keep the staff-facing queue's eligibility indicator consistent with the
-- dispatcher's strict phone validation; never return phone numbers here.
create or replace function public.get_appointment_reminders(
  target_clinic_id uuid,
  window_start timestamptz default now(),
  window_end timestamptz default now() + interval '90 days'
)
returns table (
  id uuid,
  appointment_id uuid,
  kind text,
  scheduled_at timestamptz,
  status text,
  attempt_count integer,
  patient_name text,
  appointment_at timestamptz,
  service text,
  provider_name text,
  branch_name text,
  delivery_eligible boolean,
  delivery_block_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_clinic_access(target_clinic_id, array['admin', 'receptionist']) then
    raise exception 'Appointment reminder access is not enabled for this role.' using errcode = '42501';
  end if;

  return query
    select reminder.id,
           reminder.appointment_id,
           reminder.kind,
           reminder.scheduled_at,
           reminder.status,
           reminder.attempt_count,
           patient.full_name,
           appointment.starts_at,
           appointment.service,
           provider.name,
           branch.name,
           (patient.appointment_whatsapp_opt_in
             and coalesce(trim(patient.phone), '') ~ '^\+[1-9][0-9]{7,14}$'),
           case
             when not patient.appointment_whatsapp_opt_in then 'Sin autorización de WhatsApp'
             when nullif(trim(patient.phone), '') is null then 'Falta teléfono'
             when coalesce(trim(patient.phone), '') !~ '^\+[1-9][0-9]{7,14}$' then 'Teléfono inválido: usa formato internacional'
             else null
           end
      from public.appointment_reminders as reminder
      join public.appointments as appointment
        on appointment.id = reminder.appointment_id
       and appointment.clinic_id = reminder.clinic_id
       and appointment.reminder_schedule_version = reminder.schedule_version
      join public.patients as patient
        on patient.id = appointment.patient_id
       and patient.clinic_id = appointment.clinic_id
      join public.clinic_providers as provider
        on provider.id = appointment.provider_id
       and provider.clinic_id = appointment.clinic_id
      join public.branches as branch
        on branch.id = appointment.branch_id
       and branch.clinic_id = appointment.clinic_id
     where reminder.clinic_id = target_clinic_id
       and reminder.scheduled_at >= window_start
       and reminder.scheduled_at < window_end
     order by reminder.scheduled_at asc;
end;
$$;

revoke all on function public.get_appointment_reminders(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_appointment_reminders(uuid, timestamptz, timestamptz) to authenticated;

-- An unknown provider outcome is immutable and must never be automatically resent.
create or replace function private.refresh_appointment_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder_definition record;
  scheduled_time timestamptz;
begin
  if new.status <> 'confirmed' then
    update public.appointment_reminders
      set status = 'cancelled', updated_at = now()
      where clinic_id = new.clinic_id
        and appointment_id = new.id
        and schedule_version = new.reminder_schedule_version
        and status in ('pending', 'failed');
    return new;
  end if;

  update public.appointment_reminders
    set status = 'cancelled', updated_at = now()
    where clinic_id = new.clinic_id
      and appointment_id = new.id
      and schedule_version <> new.reminder_schedule_version
      and status in ('pending', 'failed');

  for reminder_definition in
    select definition.kind, definition.lead_time
      from (values
        ('confirmation_2d'::text, interval '48 hours'),
        ('reminder_1d'::text, interval '24 hours'),
        ('reminder_5h'::text, interval '5 hours')
      ) as definition(kind, lead_time)
  loop
    scheduled_time := new.starts_at - reminder_definition.lead_time;

    insert into public.appointment_reminders (
      clinic_id, appointment_id, kind, scheduled_at, status, schedule_version
    ) values (
      new.clinic_id,
      new.id,
      reminder_definition.kind,
      scheduled_time,
      case when scheduled_time > now() then 'pending' else 'skipped' end,
      new.reminder_schedule_version
    )
    on conflict (appointment_id, kind, schedule_version) do update
      set scheduled_at = excluded.scheduled_at,
          status = case
            when public.appointment_reminders.status in ('sent', 'unknown') then public.appointment_reminders.status
            else excluded.status
          end,
          attempt_count = case
            when public.appointment_reminders.status in ('sent', 'unknown') then public.appointment_reminders.attempt_count
            else 0
          end,
          last_error = case
            when public.appointment_reminders.status in ('sent', 'unknown') then public.appointment_reminders.last_error
            else null
          end,
          updated_at = now();
  end loop;

  return new;
end;
$$;
