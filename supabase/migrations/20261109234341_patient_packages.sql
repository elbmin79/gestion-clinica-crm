create table public.patient_packages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  patient_id uuid not null,
  service_id uuid not null,
  service_name text not null,
  sessions_total integer not null check (sessions_total between 1 and 1000),
  agreed_amount numeric(12, 2) not null check (agreed_amount >= 0 and agreed_amount <= 9999999999.99),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  unique (id, patient_id, clinic_id),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict,
  foreign key (service_id, clinic_id) references public.clinic_services(id, clinic_id) on delete restrict
);
create index patient_packages_clinic_patient on public.patient_packages(clinic_id, patient_id, created_at desc, id);
alter table public.patient_packages enable row level security;
revoke all on public.patient_packages from public, anon, authenticated;
grant select on public.patient_packages to authenticated;
grant insert (id, clinic_id, patient_id, service_id, sessions_total, agreed_amount) on public.patient_packages to authenticated;
create policy patient_packages_read on public.patient_packages for select to authenticated
  using ((select private.has_clinic_permission(clinic_id, 'payments.view')));
create policy patient_packages_create on public.patient_packages for insert to authenticated
  with check ((select private.has_clinic_permission(clinic_id, 'payments.create')) and created_by = (select auth.uid()));

create function private.snapshot_patient_package() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  select s.name into new.service_name from public.clinic_services s
  where s.id = new.service_id and s.clinic_id = new.clinic_id and s.active;
  if new.service_name is null then
    raise exception 'Package service is unavailable' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.snapshot_patient_package() from public, anon, authenticated;
create trigger patient_packages_snapshot before insert on public.patient_packages
  for each row execute function private.snapshot_patient_package();

alter table public.appointments add column package_id uuid,
  add constraint appointments_patient_package foreign key (package_id, patient_id, clinic_id)
    references public.patient_packages(id, patient_id, clinic_id) on delete restrict;
alter table public.payments add column package_id uuid,
  add constraint payments_patient_package foreign key (package_id, patient_id, clinic_id)
    references public.patient_packages(id, patient_id, clinic_id) on delete restrict;
create index appointments_patient_package_idx on public.appointments(package_id) where package_id is not null;
create index payments_patient_package_idx on public.payments(package_id) where package_id is not null;

create function private.guard_package_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare purchase public.patient_packages%rowtype;
begin
  if tg_op = 'UPDATE' and old.package_id is distinct from new.package_id then
    raise exception 'A booking cannot change its original package' using errcode = '23514', constraint = 'appointments_package_locked';
  end if;
  if new.package_id is null then return new; end if;

  if tg_op = 'UPDATE' and (old.status <> 'cancelled' or new.status = 'cancelled')
    and row(old.clinic_id, old.patient_id, old.service_ids, old.deposit_required, old.deposit_amount)
      is not distinct from row(new.clinic_id, new.patient_id, new.service_ids, new.deposit_required, new.deposit_amount) then
    return new;
  end if;
  if not private.has_clinic_permission(new.clinic_id, case when tg_op = 'INSERT' then 'agenda.create' else 'agenda.edit' end) then
    raise exception 'Appointment permission required' using errcode = '42501';
  end if;

  select * into purchase from public.patient_packages
  where id = new.package_id and clinic_id = new.clinic_id and patient_id = new.patient_id;
  if not found
    or coalesce(new.service_ids, array[]::uuid[]) is distinct from array[purchase.service_id]
    or new.deposit_required or new.deposit_amount <> 0 then
    raise exception 'A package booking must match its patient and service and has no separate deposit'
      using errcode = '23514', constraint = 'appointments_package_match';
  end if;
  if new.status = 'cancelled' then return new; end if;
  if tg_op = 'UPDATE' and old.status <> 'cancelled' then return new; end if;

  perform pg_advisory_xact_lock(hashtext(new.clinic_id::text), hashtext(new.patient_id::text));
  if (select count(*) from public.appointments a where a.package_id = new.package_id and a.status <> 'cancelled') >= purchase.sessions_total then
    raise exception 'All package sessions are used or reserved' using errcode = '23514', constraint = 'appointments_package_capacity';
  end if;
  return new;
end $$;
revoke all on function private.guard_package_booking() from public, anon, authenticated;
create trigger appointments_package_guard before insert or update of package_id, service_ids, service_id, status, deposit_required, deposit_amount, patient_id
  on public.appointments for each row execute function private.guard_package_booking();

create or replace function private.enforce_appointment_deposit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare received numeric(12, 2);
begin
  if tg_op = 'INSERT' and new.package_id is null and (not new.deposit_required or new.deposit_amount <= 0) then
    raise exception 'A positive appointment deposit is required for new bookings.'
      using errcode = '23514', constraint = 'appointments_deposit_required';
  end if;
  if tg_op = 'UPDATE' and old.deposit_required and not new.deposit_required then
    raise exception 'An appointment deposit cannot be removed after booking.'
      using errcode = '23514', constraint = 'appointments_deposit_required';
  end if;
  if new.status in ('confirmed', 'completed') and new.deposit_required then
    perform pg_advisory_xact_lock(hashtext(new.clinic_id::text), hashtext(new.patient_id::text));
    select coalesce(sum(case when p.direction = 'income' then p.amount else -p.amount end), 0)
      into received from public.payments p where p.clinic_id = new.clinic_id and p.appointment_id = new.id;
    if received < new.deposit_amount then
      raise exception 'Appointment deposit has not been received.'
        using errcode = '23514', constraint = 'appointments_deposit_required';
    end if;
  end if;
  return new;
end $$;

create function private.guard_package_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  appointment_package uuid;
  agreed numeric;
  paid numeric;
begin
  if (new.appointment_id is not null or new.package_id is not null) and auth.uid() is not null
    and (not private.has_clinic_permission(new.clinic_id, 'payments.create')
      or (new.direction = 'refund' and not private.has_clinic_permission(new.clinic_id, 'payments.refund'))) then
    raise exception 'Payment permission required' using errcode = '42501';
  end if;
  if new.appointment_id is not null then
    select a.package_id into appointment_package from public.appointments a
    where a.id = new.appointment_id and a.patient_id = new.patient_id and a.clinic_id = new.clinic_id;
    if new.package_id is not null and new.package_id is distinct from appointment_package then
      raise exception 'Payment package must match the booking'
        using errcode = '23514', constraint = 'payments_package_match';
    end if;
    new.package_id := appointment_package;
  end if;
  if new.package_id is null then return new; end if;

  perform pg_advisory_xact_lock(hashtext(new.clinic_id::text), hashtext(new.patient_id::text));
  select pp.agreed_amount into agreed from public.patient_packages pp
  where pp.id = new.package_id and pp.clinic_id = new.clinic_id and pp.patient_id = new.patient_id;
  if not found then
    raise exception 'Payment package must belong to the patient'
      using errcode = '23514', constraint = 'payments_package_match';
  end if;
  select coalesce(sum(case when p.direction = 'income' then p.amount else -p.amount end), 0)
    into paid from public.payments p where p.package_id = new.package_id;
  paid := paid + case when new.direction = 'income' then new.amount else -new.amount end;
  if paid < 0 or paid > agreed then
    raise exception 'Movement exceeds the package balance'
      using errcode = '23514', constraint = 'payments_package_balance';
  end if;
  return new;
end $$;
revoke all on function private.guard_package_payment() from public, anon, authenticated;
create trigger payments_package_guard before insert on public.payments
  for each row execute function private.guard_package_payment();

create or replace function private.validate_payment_refund()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  available numeric(12, 2);
  protected_deposits numeric(12, 2);
  appointment_status text;
  appointment_deposit_required boolean;
  appointment_deposit_amount numeric(12, 2);
begin
  if new.direction <> 'refund' then return new; end if;
  -- The package guard runs first and already validates a package-wide refund.
  if new.package_id is not null and new.appointment_id is null then return new; end if;

  perform pg_advisory_xact_lock(hashtext(new.clinic_id::text), hashtext(new.patient_id::text));
  select coalesce(sum(case when p.direction = 'income' then p.amount else -p.amount end), 0)
    into available from public.payments p
    where p.clinic_id = new.clinic_id and p.patient_id = new.patient_id
      and case when new.appointment_id is null then p.package_id is null else p.appointment_id = new.appointment_id end;
  if new.amount > available then
    raise exception 'refund exceeds available net income'
      using errcode = '23514', constraint = 'payments_refund_within_balance';
  end if;

  if new.appointment_id is not null then
    select a.status, a.deposit_required, a.deposit_amount
      into appointment_status, appointment_deposit_required, appointment_deposit_amount
      from public.appointments a where a.id = new.appointment_id and a.clinic_id = new.clinic_id;
    if appointment_status = 'confirmed' and appointment_deposit_required and available - new.amount < appointment_deposit_amount then
      raise exception 'refund would leave a confirmed appointment below its required deposit'
        using errcode = '23514', constraint = 'payments_refund_preserves_appointment_deposit';
    end if;
  else
    select coalesce(sum(a.deposit_amount), 0) into protected_deposits from public.appointments a
      where a.clinic_id = new.clinic_id and a.patient_id = new.patient_id and a.status = 'confirmed' and a.deposit_required;
    if available - new.amount < protected_deposits then
      raise exception 'patient-level refund would consume funds reserved for confirmed appointment deposits'
        using errcode = '23514', constraint = 'payments_refund_preserves_patient_deposits';
    end if;
  end if;
  return new;
end $$;

create view public.patient_package_balances with (security_invoker = true) as
select pp.*, usage.completed_sessions, usage.reserved_sessions, ledger.paid_amount
from public.patient_packages pp
cross join lateral (
  select count(*) filter (where a.status = 'completed')::integer as completed_sessions,
    count(*) filter (where a.status in ('pending', 'confirmed'))::integer as reserved_sessions
  from public.appointments a where a.package_id = pp.id
) usage
cross join lateral (
  select coalesce(sum(case when p.direction = 'income' then p.amount else -p.amount end), 0) as paid_amount
  from public.payments p where p.package_id = pp.id
) ledger;
revoke all on public.patient_package_balances from public, anon, authenticated;
grant select on public.patient_package_balances to authenticated;
