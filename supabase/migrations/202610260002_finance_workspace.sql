-- Minimal finance workspace access for admin, receptionist, and billing roles.
-- Patient identity is limited to the fields required to reconcile payments.

create index payments_clinic_patient_idx on public.payments (clinic_id, patient_id);
create index payments_clinic_appointment_idx on public.payments (clinic_id, appointment_id) where appointment_id is not null;

create function public.get_finance_patients(target_clinic_id uuid)
returns table(patient_id uuid, record_number text, full_name text, primary_branch_id uuid, primary_provider_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select patient.id, patient.record_number, patient.full_name, patient.primary_branch_id, patient.primary_provider_id
  from public.patients as patient
  where patient.clinic_id = target_clinic_id
    and (select private.has_clinic_access(target_clinic_id, array['admin', 'receptionist', 'billing']))
  order by patient.full_name;
$$;
revoke all on function public.get_finance_patients(uuid) from public, anon;
grant execute on function public.get_finance_patients(uuid) to authenticated;

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
  business_name text
)
language sql stable security definer
set search_path = ''
as $$
  select appointment.id, appointment.patient_id, appointment.business_id,
         appointment.branch_id, appointment.provider_id, appointment.starts_at,
         appointment.ends_at, appointment.service, appointment.modality, appointment.status,
         branch.name, provider.name, business.name
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

-- Serialize refunds for the same patient/appointment and reject amounts that
-- exceed its committed net income, including concurrent refund requests.
create function private.validate_payment_refund()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  available numeric(12, 2);
begin
  if new.direction <> 'refund' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(new.clinic_id::text),
    hashtext(new.patient_id::text)
  );

  select coalesce(sum(case when payment.direction = 'income' then payment.amount else -payment.amount end), 0)
    into available
    from public.payments as payment
    where payment.clinic_id = new.clinic_id
      and (
        (new.appointment_id is not null and payment.appointment_id = new.appointment_id)
        or (new.appointment_id is null and payment.patient_id = new.patient_id)
      );

  if new.amount > available then
    raise exception 'refund exceeds available net income'
      using errcode = '23514', constraint = 'payments_refund_within_balance';
  end if;

  return new;
end;
$$;
revoke all on function private.validate_payment_refund() from public, anon, authenticated;

create trigger payments_validate_refund
  before insert on public.payments
  for each row execute function private.validate_payment_refund();
