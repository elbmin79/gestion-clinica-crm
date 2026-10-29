-- Finance-only appointment lookups must include deposit fields so refund
-- workflows can display the amount reserved by confirmed bookings.
drop function public.get_finance_appointments(uuid, timestamptz, timestamptz, uuid[]);

create function public.get_finance_appointments(target_clinic_id uuid, from_at timestamptz, to_at timestamptz, appointment_ids uuid[] default '{}')
returns table(
  appointment_id uuid,
  patient_id uuid,
  business_id uuid,
  branch_id uuid,
  provider_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  service text,
  modality text,
  status text,
  branch_name text,
  provider_name text,
  business_name text,
  deposit_required boolean,
  deposit_amount numeric(12, 2)
)
language sql stable security definer
set search_path = ''
as $$
  select appointment.id, appointment.patient_id, appointment.business_id,
         appointment.branch_id, appointment.provider_id, appointment.starts_at,
         appointment.ends_at, appointment.service, appointment.modality, appointment.status,
         branch.name, provider.name, business.name,
         appointment.deposit_required, appointment.deposit_amount
  from public.appointments as appointment
  left join public.branches as branch on branch.id = appointment.branch_id and branch.clinic_id = appointment.clinic_id
  left join public.clinic_providers as provider on provider.id = appointment.provider_id and provider.clinic_id = appointment.clinic_id
  left join public.businesses as business on business.id = appointment.business_id and business.clinic_id = appointment.clinic_id
  where appointment.clinic_id = target_clinic_id
    and ((appointment.starts_at >= from_at and appointment.starts_at < to_at) or appointment.id = any(appointment_ids))
    and (select private.has_clinic_access(target_clinic_id, array['admin', 'receptionist', 'billing']))
  order by appointment.starts_at desc;
$$;

revoke all on function public.get_finance_appointments(uuid, timestamptz, timestamptz, uuid[]) from public, anon;
grant execute on function public.get_finance_appointments(uuid, timestamptz, timestamptz, uuid[]) to authenticated;
