-- Serialize appointment confirmation and refund checks for the same patient.
-- A refund may not leave an already confirmed appointment below its
-- required deposit, and a concurrent confirmation must see committed refunds.

create or replace function private.enforce_appointment_deposit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  received numeric(12, 2);
begin
  if tg_op = 'INSERT' and (not new.deposit_required or new.deposit_amount <= 0) then
    raise exception 'A positive appointment deposit is required for new bookings.'
      using errcode = '23514', constraint = 'appointments_deposit_required';
  end if;

  if tg_op = 'UPDATE' and old.deposit_required and not new.deposit_required then
    raise exception 'An appointment deposit cannot be removed after booking.'
      using errcode = '23514', constraint = 'appointments_deposit_required';
  end if;

  if new.status in ('confirmed', 'completed') and new.deposit_required then
    perform pg_advisory_xact_lock(
      hashtext(new.clinic_id::text),
      hashtext(new.patient_id::text)
    );

    select coalesce(sum(case when payment.direction = 'income' then payment.amount else -payment.amount end), 0)
      into received
      from public.payments as payment
      where payment.clinic_id = new.clinic_id
        and payment.appointment_id = new.id;

    if received < new.deposit_amount then
      raise exception 'Appointment deposit has not been received.'
        using errcode = '23514', constraint = 'appointments_deposit_required';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function private.enforce_appointment_deposit() from public, anon, authenticated;

create or replace function private.validate_payment_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  available numeric(12, 2);
  appointment_status text;
  appointment_deposit_required boolean;
  appointment_deposit_amount numeric(12, 2);
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
  end if;

  return new;
end;
$$;
revoke all on function private.validate_payment_refund() from public, anon, authenticated;
