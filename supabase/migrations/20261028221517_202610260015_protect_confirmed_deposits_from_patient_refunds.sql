-- A patient-level refund has no appointment association, so it must not be
-- allowed to consume the funds reserved for any confirmed appointment deposit.
create or replace function private.validate_payment_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  available numeric(12, 2);
  protected_deposits numeric(12, 2);
  appointment_status text;
  appointment_deposit_required boolean;
  appointment_deposit_amount numeric(12, 2);
begin
  if new.direction <> 'refund' then
    return new;
  end if;

  -- Appointment confirmation, appointment refunds, and general patient
  -- refunds all serialize on this patient-scoped transaction lock.
  perform pg_advisory_xact_lock(
    hashtext(new.clinic_id::text),
    hashtext(new.patient_id::text)
  );

  select coalesce(sum(case when payment.direction = 'income' then payment.amount else -payment.amount end), 0)
    into available
    from public.payments as payment
   where payment.clinic_id = new.clinic_id
     and payment.patient_id = new.patient_id
     and (
       new.appointment_id is null
       or payment.appointment_id = new.appointment_id
     );

  if new.amount > available then
    raise exception 'refund exceeds available net income'
      using errcode = '23514', constraint = 'payments_refund_within_balance';
  end if;

  if new.appointment_id is not null then
    select appointment.status, appointment.deposit_required, appointment.deposit_amount
      into appointment_status, appointment_deposit_required, appointment_deposit_amount
      from public.appointments as appointment
     where appointment.id = new.appointment_id
       and appointment.clinic_id = new.clinic_id;

    if appointment_status = 'confirmed'
       and appointment_deposit_required
       and available - new.amount < appointment_deposit_amount then
      raise exception 'refund would leave a confirmed appointment below its required deposit'
        using errcode = '23514', constraint = 'payments_refund_preserves_appointment_deposit';
    end if;
  else
    select coalesce(sum(appointment.deposit_amount), 0)
      into protected_deposits
      from public.appointments as appointment
     where appointment.clinic_id = new.clinic_id
       and appointment.patient_id = new.patient_id
       and appointment.status = 'confirmed'
       and appointment.deposit_required;

    if available - new.amount < protected_deposits then
      raise exception 'patient-level refund would consume funds reserved for confirmed appointment deposits'
        using errcode = '23514', constraint = 'payments_refund_preserves_patient_deposits';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_payment_refund() from public, anon, authenticated;
