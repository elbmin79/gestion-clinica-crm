-- Clinic-configured booking deposits must be received before confirmation.
alter table public.appointments
  add column deposit_required boolean not null default false,
  add column deposit_amount numeric(12, 2) not null default 0,
  add constraint appointments_deposit_amount_valid
    check ((deposit_required and deposit_amount > 0) or (not deposit_required and deposit_amount = 0));

-- Preserve existing bookings, but make deposits the default for all new ones.
alter table public.appointments
  alter column deposit_required set default true;

create function private.enforce_appointment_deposit()
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

create trigger appointments_require_deposit_before_confirmation
  before insert or update of status, deposit_required, deposit_amount on public.appointments
  for each row execute function private.enforce_appointment_deposit();
