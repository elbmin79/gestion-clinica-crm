-- Keep a new reminder set when a confirmed appointment is rescheduled or
-- cancelled and then confirmed again. Earlier sends remain auditable.
alter table public.appointments
  add column reminder_schedule_version integer not null default 1
  check (reminder_schedule_version > 0);

alter table public.appointment_reminders
  add column schedule_version integer not null default 1
  check (schedule_version > 0);

alter table public.appointment_reminders
  drop constraint appointment_reminders_appointment_id_kind_key;

alter table public.appointment_reminders
  add constraint appointment_reminders_appointment_kind_version_key
  unique (appointment_id, kind, schedule_version);

create function private.advance_reminder_schedule_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts_at is distinct from old.starts_at
     or (old.status <> 'confirmed' and new.status = 'confirmed') then
    new.reminder_schedule_version := old.reminder_schedule_version + 1;
  end if;
  return new;
end;
$$;
revoke all on function private.advance_reminder_schedule_version() from public, anon, authenticated;

create trigger appointments_advance_reminder_schedule_version
  before update of status, starts_at on public.appointments
  for each row execute function private.advance_reminder_schedule_version();

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
            when public.appointment_reminders.status = 'sent' then 'sent'
            else excluded.status
          end,
          attempt_count = case
            when public.appointment_reminders.status = 'sent' then public.appointment_reminders.attempt_count
            else 0
          end,
          last_error = case
            when public.appointment_reminders.status = 'sent' then public.appointment_reminders.last_error
            else null
          end,
          updated_at = now();
  end loop;

  return new;
end;
$$;

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
  branch_name text
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
           branch.name
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
