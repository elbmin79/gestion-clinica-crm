create table public.clinic_promotions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  service_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  kind text not null check (kind in ('single', 'package')),
  amount numeric not null check (amount between 0 and 9999999999.99 and amount = round(amount, 2)),
  currency text not null check (currency in ('MXN', 'USD')),
  sessions integer,
  starts_on date not null,
  ends_on date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (service_id, clinic_id) references public.clinic_services(id, clinic_id) on delete restrict,
  check (isfinite(starts_on) and isfinite(ends_on) and ends_on >= starts_on),
  check ((kind = 'single' and sessions is null)
    or (kind = 'package' and currency = 'MXN' and sessions is not null and sessions between 1 and 1000))
);
create index clinic_promotions_clinic_date_idx on public.clinic_promotions(clinic_id, starts_on desc, id);
alter table public.clinic_promotions enable row level security;
revoke all on public.clinic_promotions from public, anon, authenticated;
grant select on public.clinic_promotions to authenticated;
grant insert (id, clinic_id, service_id, name, kind, amount, currency, sessions, starts_on, ends_on, active)
  on public.clinic_promotions to authenticated;
grant update (service_id, name, kind, amount, currency, sessions, starts_on, ends_on, active)
  on public.clinic_promotions to authenticated;

create policy clinic_promotions_read on public.clinic_promotions for select to authenticated
  using ((select private.has_clinic_permission(clinic_id, 'agenda.view')));
create policy clinic_promotions_insert on public.clinic_promotions for insert to authenticated
  with check ((select private.has_clinic_permission(clinic_id, 'services.manage')));
create policy clinic_promotions_update on public.clinic_promotions for update to authenticated
  using ((select private.has_clinic_permission(clinic_id, 'services.manage')))
  with check ((select private.has_clinic_permission(clinic_id, 'services.manage')));
