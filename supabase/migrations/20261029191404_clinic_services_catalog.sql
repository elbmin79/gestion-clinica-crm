create table public.clinic_services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  code text not null check (length(trim(code)) between 1 and 80),
  category text not null check (length(trim(category)) between 1 and 80),
  name text not null check (length(trim(name)) between 1 and 180),
  description text,
  duration_min integer check (duration_min is null or duration_min between 15 and 720),
  duration_max integer check (duration_max is null or duration_max between 15 and 720),
  offers jsonb not null default '[]'::jsonb check (jsonb_typeof(offers) = 'array'),
  variants jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array'),
  notes text,
  source text not null default 'Capturado por la clínica',
  status text not null default 'setup_needed' check (status in ('setup_needed', 'ready')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, code),
  unique (id, clinic_id),
  check (duration_min is null or duration_max is null or duration_max >= duration_min),
  check (offers = '[]'::jsonb or jsonb_typeof(offers) = 'array')
);

create index clinic_services_clinic_active_category_idx on public.clinic_services (clinic_id, active, category, name);
create table public.clinic_service_branches (
  clinic_id uuid not null,
  service_id uuid not null,
  branch_id uuid not null,
  primary key (clinic_id, service_id, branch_id),
  foreign key (service_id, clinic_id) references public.clinic_services(id, clinic_id) on delete cascade,
  foreign key (branch_id, clinic_id) references public.branches(id, clinic_id) on delete cascade
);
create index clinic_service_branches_branch_idx on public.clinic_service_branches (clinic_id, branch_id, service_id);
alter table public.clinic_service_branches enable row level security;
create table public.clinic_service_providers (
  clinic_id uuid not null,
  service_id uuid not null,
  provider_id uuid not null,
  primary key (clinic_id, service_id, provider_id),
  foreign key (service_id, clinic_id) references public.clinic_services(id, clinic_id) on delete cascade,
  foreign key (provider_id, clinic_id) references public.clinic_providers(id, clinic_id) on delete cascade
);
create index clinic_service_providers_provider_idx on public.clinic_service_providers (clinic_id, provider_id, service_id);
alter table public.clinic_service_providers enable row level security;
alter table public.clinic_services enable row level security;

alter table public.appointments
  add column service_id uuid,
  add column service_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(service_snapshot) = 'object'),
  add constraint appointments_service_clinic_fk foreign key (service_id, clinic_id)
    references public.clinic_services(id, clinic_id) on delete restrict;
create index appointments_service_idx on public.appointments (clinic_id, service_id) where service_id is not null;
revoke all on public.clinic_services from anon, authenticated;
grant select, insert, update on public.clinic_services to authenticated;
revoke all on public.clinic_service_branches from anon, authenticated;
grant select, insert, delete on public.clinic_service_branches to authenticated;
revoke all on public.clinic_service_providers from anon, authenticated;
grant select, insert, delete on public.clinic_service_providers to authenticated;

create policy clinic_services_staff_read on public.clinic_services
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));
create policy clinic_services_admin_write on public.clinic_services
  for all to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));
create policy clinic_service_branches_staff_read on public.clinic_service_branches
  for select to authenticated using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));
create policy clinic_service_branches_admin_write on public.clinic_service_branches
  for all to authenticated using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));
create policy clinic_service_providers_staff_read on public.clinic_service_providers
  for select to authenticated using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));
create policy clinic_service_providers_admin_write on public.clinic_service_providers
  for all to authenticated using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));

create trigger audit_clinic_services after insert or update or delete on public.clinic_services
  for each row execute function private.capture_audit_event();

create function private.touch_clinic_service()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_clinic_service() from public, anon, authenticated;
create trigger touch_clinic_service before update on public.clinic_services
  for each row execute function private.touch_clinic_service();

create function public.save_clinic_service(
  target_clinic_id uuid, target_service_id uuid, target_code text, target_category text,
  target_name text, target_description text, target_duration_min integer, target_duration_max integer,
  target_offers jsonb, target_variants jsonb, target_notes text, target_source text,
  target_status text, target_active boolean, target_branch_ids uuid[], target_provider_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
  if not private.has_clinic_access(target_clinic_id, array['admin']) then
    raise exception 'Solo una persona administradora puede modificar el catálogo.' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(coalesce(target_branch_ids, array[]::uuid[])) requested(id)
    where not exists (select 1 from public.branches b where b.id = requested.id and b.clinic_id = target_clinic_id and b.active)
  ) then raise exception 'Selecciona sucursales activas de esta clínica.' using errcode = '23514'; end if;
  if exists (
    select 1 from unnest(coalesce(target_provider_ids, array[]::uuid[])) requested(id)
    where not exists (
      select 1 from public.clinic_providers p
      join public.provider_branches pb on pb.provider_id=p.id and pb.clinic_id=p.clinic_id
      where p.id=requested.id and p.clinic_id=target_clinic_id and p.active and pb.branch_id=any(coalesce(target_branch_ids,array[]::uuid[]))
    )
  ) then raise exception 'Cada profesional debe estar activo y asignado a una de las sucursales del servicio.' using errcode = '23514'; end if;
  if target_service_id is null then
    insert into public.clinic_services (clinic_id, code, category, name, description, duration_min, duration_max, offers, variants, notes, source, status, active)
    values (target_clinic_id, target_code, target_category, target_name, target_description, target_duration_min, target_duration_max, target_offers, target_variants, target_notes, coalesce(target_source, 'Capturado por la clínica'), target_status, target_active)
    returning id into saved_id;
  else
    update public.clinic_services set code=target_code, category=target_category, name=target_name,
      description=target_description, duration_min=target_duration_min, duration_max=target_duration_max,
      offers=target_offers, variants=target_variants, notes=target_notes, source=coalesce(target_source, 'Capturado por la clínica'),
      status=target_status, active=target_active
    where id=target_service_id and clinic_id=target_clinic_id returning id into saved_id;
    if saved_id is null then raise exception 'El servicio ya no existe en esta clínica.' using errcode = 'P0002'; end if;
  end if;
  delete from public.clinic_service_branches where clinic_id=target_clinic_id and service_id=saved_id;
  insert into public.clinic_service_branches (clinic_id, service_id, branch_id)
  select target_clinic_id, saved_id, requested.id
  from (select distinct id from unnest(coalesce(target_branch_ids, array[]::uuid[])) requested(id)) requested;
  delete from public.clinic_service_providers where clinic_id=target_clinic_id and service_id=saved_id;
  insert into public.clinic_service_providers (clinic_id, service_id, provider_id)
  select target_clinic_id, saved_id, requested.id
  from (select distinct id from unnest(coalesce(target_provider_ids, array[]::uuid[])) requested(id)) requested;
  return saved_id;
end;
$$;
revoke all on function public.save_clinic_service(uuid,uuid,text,text,text,text,integer,integer,jsonb,jsonb,text,text,text,boolean,uuid[],uuid[]) from public, anon;
grant execute on function public.save_clinic_service(uuid,uuid,text,text,text,text,integer,integer,jsonb,jsonb,text,text,text,boolean,uuid[],uuid[]) to authenticated;

create function private.validate_appointment_catalog_service()
returns trigger language plpgsql security definer set search_path = '' as $$
declare service_row public.clinic_services%rowtype;
begin
  if new.service_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.service_id is not distinct from new.service_id
    and old.branch_id is not distinct from new.branch_id and old.provider_id is not distinct from new.provider_id then
    new.service_snapshot := old.service_snapshot;
    return new;
  end if;
  if tg_op = 'INSERT' or old.service_id is distinct from new.service_id
    or old.branch_id is distinct from new.branch_id or old.provider_id is distinct from new.provider_id then
    select s.* into service_row from public.clinic_services s
      join public.clinic_service_branches sb on sb.clinic_id=s.clinic_id and sb.service_id=s.id and sb.branch_id=new.branch_id
      join public.clinic_service_providers sp on sp.clinic_id=s.clinic_id and sp.service_id=s.id and sp.provider_id=new.provider_id
      join public.provider_branches pb on pb.clinic_id=s.clinic_id and pb.branch_id=sb.branch_id and pb.provider_id=sp.provider_id
      where s.id=new.service_id and s.clinic_id=new.clinic_id and s.active and s.duration_min is not null;
    if service_row.id is null then
      raise exception 'El servicio no está habilitado para la sucursal y profesional seleccionados.' using errcode = '23514';
    end if;
    new.service := service_row.name;
    new.service_snapshot := jsonb_build_object('code',service_row.code,'name',service_row.name,'category',service_row.category,
      'durationMin',service_row.duration_min,'durationMax',service_row.duration_max,'offers',service_row.offers,
      'variants',service_row.variants,'capturedAt',now());
  end if;
  return new;
end;
$$;
revoke all on function private.validate_appointment_catalog_service() from public, anon, authenticated;
create trigger appointments_catalog_service_guard before insert or update of service_id, service_snapshot, branch_id, provider_id
  on public.appointments for each row execute function private.validate_appointment_catalog_service();
