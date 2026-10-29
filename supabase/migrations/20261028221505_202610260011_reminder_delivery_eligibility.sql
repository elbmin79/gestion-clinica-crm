-- Expose delivery eligibility without returning contact details to the queue UI.
drop function public.get_appointment_reminders(uuid, timestamptz, timestamptz);

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
           (patient.appointment_whatsapp_opt_in and nullif(trim(patient.phone), '') is not null),
           case
             when not patient.appointment_whatsapp_opt_in then 'Sin autorización de WhatsApp'
             when nullif(trim(patient.phone), '') is null then 'Falta teléfono'
             else null
           end
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
