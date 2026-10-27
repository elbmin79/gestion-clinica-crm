-- Durable schedule for the clinic's three appointment messages. Delivery is
-- handled by a separately configured messaging worker; this migration sends
-- nothing to patients.
create table public.appointment_reminders (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null,
  kind text not null check (kind in ('confirmation_2d', 'reminder_1d', 'reminder_5h')),
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, kind),
  foreign key (appointment_id, clinic_id) references public.appointments(id, clinic_id) on delete cascade
);

create index appointment_reminders_due_idx
  on public.appointment_reminders (scheduled_at)
  where status in ('pending', 'failed');
create index appointment_reminders_clinic_schedule_idx
  on public.appointment_reminders (clinic_id, scheduled_at);

alter table public.appointment_reminders enable row level security;
grant select on public.appointment_reminders to authenticated;

create policy appointment_reminders_staff_read on public.appointment_reminders
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'receptionist'])));

create function private.refresh_appointment_reminders()
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
        and status <> 'sent';
    return new;
  end if;

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
      clinic_id, appointment_id, kind, scheduled_at, status
    ) values (
      new.clinic_id,
      new.id,
      reminder_definition.kind,
      scheduled_time,
      case when scheduled_time > now() then 'pending' else 'skipped' end
    )
    on conflict (appointment_id, kind) do update
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
revoke all on function private.refresh_appointment_reminders() from public, anon, authenticated;

create trigger appointments_refresh_reminders
  after insert or update of status, starts_at on public.appointments
  for each row execute function private.refresh_appointment_reminders();

create function public.get_appointment_reminders(
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
