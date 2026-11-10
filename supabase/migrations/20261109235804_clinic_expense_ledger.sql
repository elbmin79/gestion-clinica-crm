create table public.clinic_monthly_bills (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null check (length(trim(category)) between 1 and 80),
  due_day integer not null check (due_day between 1 and 31),
  starts_month date not null check (isfinite(starts_month) and extract(day from starts_month) = 1),
  estimate numeric check (estimate between 0 and 9999999999.99 and estimate = round(estimate, 2)),
  active boolean not null default true,
  unique (id, clinic_id)
);
create index clinic_monthly_bills_active on public.clinic_monthly_bills(clinic_id) where active;

create table public.clinic_expenses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null check (length(trim(category)) between 1 and 80),
  amount numeric not null check (amount > 0 and amount <= 9999999999.99 and amount = round(amount, 2)),
  paid_on date not null check (isfinite(paid_on)),
  note text check (length(note) <= 500),
  bill_id uuid,
  bill_month date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  foreign key (bill_id, clinic_id) references public.clinic_monthly_bills(id, clinic_id) on delete restrict,
  constraint clinic_expenses_one_payment_per_bill_month unique (bill_id, bill_month),
  check ((bill_id is null and bill_month is null) or
    (bill_id is not null and bill_month is not null and isfinite(bill_month) and extract(day from bill_month) = 1))
);
create index clinic_expenses_paid_on on public.clinic_expenses(clinic_id, paid_on desc, id);
alter table public.clinic_monthly_bills enable row level security;
alter table public.clinic_expenses enable row level security;
revoke all on public.clinic_monthly_bills, public.clinic_expenses from public, anon, authenticated;
grant select on public.clinic_monthly_bills, public.clinic_expenses to authenticated;
grant insert (id, clinic_id, name, category, due_day, starts_month, estimate, active) on public.clinic_monthly_bills to authenticated;
grant update (name, category, due_day, estimate, active) on public.clinic_monthly_bills to authenticated;
grant insert (id, clinic_id, name, category, amount, paid_on, note, bill_id, bill_month) on public.clinic_expenses to authenticated;
grant update (name, category, amount, paid_on, note) on public.clinic_expenses to authenticated;
create policy clinic_bills_read on public.clinic_monthly_bills for select to authenticated
  using ((select private.has_clinic_permission(clinic_id, 'payments.view')));
create policy clinic_bills_insert on public.clinic_monthly_bills for insert to authenticated
  with check ((select private.has_clinic_permission(clinic_id, 'payments.create')));
create policy clinic_bills_update on public.clinic_monthly_bills for update to authenticated
  using ((select private.has_clinic_permission(clinic_id, 'payments.create')))
  with check ((select private.has_clinic_permission(clinic_id, 'payments.create')));
create policy clinic_expenses_read on public.clinic_expenses for select to authenticated
  using ((select private.has_clinic_permission(clinic_id, 'payments.view')));
create policy clinic_expenses_insert on public.clinic_expenses for insert to authenticated
  with check ((select private.has_clinic_permission(clinic_id, 'payments.create')) and created_by = (select auth.uid()));
create policy clinic_expenses_update on public.clinic_expenses for update to authenticated
  using ((select private.has_clinic_permission(clinic_id, 'payments.create')))
  with check ((select private.has_clinic_permission(clinic_id, 'payments.create')));

create function private.guard_monthly_bill_expense() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.bill_id is null then return new; end if;
  -- Share the worker's bill lock so recording payment and queueing a notice serialize.
  perform 1 from public.clinic_monthly_bills b where b.id = new.bill_id
    and b.clinic_id = new.clinic_id and b.starts_month <= new.bill_month for update;
  if not found then raise exception 'Bill period is unavailable' using errcode = '23514'; end if;
  return new;
end $$;
revoke all on function private.guard_monthly_bill_expense() from public, anon, authenticated;
create trigger clinic_expenses_guard_bill before insert on public.clinic_expenses
  for each row execute function private.guard_monthly_bill_expense();

create table private.monthly_bill_notices (
  bill_id uuid not null references public.clinic_monthly_bills(id) on delete cascade,
  bill_month date not null,
  primary key (bill_id, bill_month)
);
alter table private.monthly_bill_notices enable row level security;
revoke all on private.monthly_bill_notices from public, anon, authenticated;

alter table public.staff_notifications drop constraint staff_notifications_kind_check;
alter table public.staff_notifications add constraint staff_notifications_kind_check
  check (kind in ('new_appointment', 'agenda_change', 'test', 'whatsapp_message', 'whatsapp_confirmation', 'patient_arrived', 'bill_due'));
alter table public.staff_notifications drop constraint staff_notifications_message_check;
alter table public.staff_notifications add constraint staff_notifications_message_check
  check (message in (
    'Nueva cita registrada', 'Cita cancelada', 'Horario o asignación de cita actualizado',
    'Prueba de notificaciones', 'Nueva solicitud de cita', 'Nuevo mensaje de WhatsApp',
    'Cita confirmada por WhatsApp', 'Paciente en recepción', 'Pago mensual pendiente'
  ));

create function public.queue_monthly_bill_notices(as_of timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare
  bill record;
  recipient record;
  notice_id uuid;
  queued integer := 0;
begin
  for bill in
    select b.id, b.clinic_id, dates.month_start
    from public.clinic_monthly_bills b
    join public.clinics c on c.id = b.clinic_id
    cross join lateral (select (as_of at time zone c.timezone)::date as today) local
    cross join lateral (select date_trunc('month', local.today::timestamp)::date as month_start) dates
    where b.active and b.starts_month <= dates.month_start
      and local.today >= least(dates.month_start + b.due_day - 1, (dates.month_start + interval '1 month' - interval '1 day')::date)
      and exists (select 1 from public.clinic_memberships m where m.clinic_id = b.clinic_id and m.role in ('admin', 'billing'))
      and not exists (select 1 from private.monthly_bill_notices n where n.bill_id = b.id and n.bill_month = dates.month_start)
      and not exists (select 1 from public.clinic_expenses e where e.bill_id = b.id and e.bill_month = dates.month_start)
    order by b.id limit 100 for update of b skip locked
  loop
    if exists (select 1 from public.clinic_expenses e where e.bill_id = bill.id and e.bill_month = bill.month_start) then continue; end if;
    insert into private.monthly_bill_notices(bill_id, bill_month) values (bill.id, bill.month_start)
      on conflict do nothing;
    if not found then continue; end if;

    for recipient in
      select m.user_id, coalesce(p.push_enabled, true) as push_enabled
      from public.clinic_memberships m left join public.staff_notification_preferences p
        on p.clinic_id = m.clinic_id and p.user_id = m.user_id
      where m.clinic_id = bill.clinic_id and m.role in ('admin', 'billing')
    loop
      insert into public.staff_notifications(clinic_id, user_id, kind, message)
      values (bill.clinic_id, recipient.user_id, 'bill_due', 'Pago mensual pendiente') returning id into notice_id;
      if recipient.push_enabled then
        insert into private.staff_push_deliveries(notification_id, subscription_id)
          select notice_id, s.id from public.staff_push_subscriptions s
          where s.clinic_id = bill.clinic_id and s.user_id = recipient.user_id;
      end if;
      queued := queued + 1;
    end loop;
  end loop;
  return queued;
end $$;
revoke all on function public.queue_monthly_bill_notices(timestamptz) from public, anon, authenticated;
grant execute on function public.queue_monthly_bill_notices(timestamptz) to service_role;
