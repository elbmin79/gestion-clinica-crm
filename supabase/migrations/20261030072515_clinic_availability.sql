-- Clinic availability rules: scoped blocks and configurable provider overlaps.

create table public.clinic_availability_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  allow_provider_overlaps boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.clinic_availability_blocks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 100),
  scope text not null default 'clinic' check (scope in ('clinic', 'branch', 'provider')),
  branch_id uuid,
  provider_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((scope = 'clinic' and branch_id is null and provider_id is null)
      or (scope = 'branch' and branch_id is not null and provider_id is null)
      or (scope = 'provider' and provider_id is not null and branch_id is null)),
  foreign key (branch_id, clinic_id) references public.branches(id, clinic_id) on delete cascade,
  foreign key (provider_id, clinic_id) references public.clinic_providers(id, clinic_id) on delete cascade
);

create index clinic_availability_blocks_window_idx
  on public.clinic_availability_blocks (clinic_id, starts_at, ends_at);
create index clinic_availability_blocks_branch_window_idx
  on public.clinic_availability_blocks (clinic_id, branch_id, starts_at, ends_at)
  where scope = 'branch';
create index clinic_availability_blocks_provider_window_idx
  on public.clinic_availability_blocks (clinic_id, provider_id, starts_at, ends_at)
  where scope = 'provider';

alter table public.clinic_availability_settings enable row level security;
alter table public.clinic_availability_blocks enable row level security;
revoke all on public.clinic_availability_settings, public.clinic_availability_blocks from anon, authenticated;
grant select, insert, update on public.clinic_availability_settings to authenticated;
grant select, insert, delete on public.clinic_availability_blocks to authenticated;

create policy availability_settings_member_read on public.clinic_availability_settings
  for select to authenticated using ((select private.has_clinic_access(clinic_id, null)));
create policy availability_settings_admin_write on public.clinic_availability_settings
  for all to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));
create policy availability_blocks_member_read on public.clinic_availability_blocks
  for select to authenticated using ((select private.has_clinic_access(clinic_id, null)));
create policy availability_blocks_staff_write on public.clinic_availability_blocks
  for all to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));

-- Serialize appointment and block writes within a clinic so a booking cannot race
-- a newly-created block or another appointment for the same provider.
create function private.enforce_clinic_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  provider_overlaps_allowed boolean;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('availability:' || new.clinic_id::text, 0));

  if exists (
    select 1 from public.clinic_availability_blocks as block
     where block.clinic_id = new.clinic_id
       and tstzrange(block.starts_at, block.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
       and (block.scope = 'clinic'
         or (block.scope = 'branch' and block.branch_id = new.branch_id)
         or (block.scope = 'provider' and block.provider_id = new.provider_id))
  ) then
    raise exception using errcode = '23P01', message = 'La cita coincide con un horario bloqueado.';
  end if;

  select coalesce(settings.allow_provider_overlaps, false)
    into provider_overlaps_allowed
    from public.clinic_availability_settings as settings
   where settings.clinic_id = new.clinic_id;

  if not coalesce(provider_overlaps_allowed, false) and exists (
    select 1 from public.appointments as appointment
     where appointment.clinic_id = new.clinic_id
       and appointment.provider_id = new.provider_id
       and appointment.status <> 'cancelled'
       and appointment.id is distinct from new.id
       and tstzrange(appointment.starts_at, appointment.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception using errcode = '23P01', message = 'El profesional ya tiene una cita en ese horario.';
  end if;

  return new;
end;
$$;

create function private.protect_clinic_availability_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('availability:' || new.clinic_id::text, 0));
  if not new.allow_provider_overlaps and exists (
    select 1 from public.appointments as first_appointment
    join public.appointments as second_appointment
      on second_appointment.clinic_id = first_appointment.clinic_id
     and second_appointment.provider_id = first_appointment.provider_id
     and second_appointment.id > first_appointment.id
     and tstzrange(second_appointment.starts_at, second_appointment.ends_at, '[)')
         && tstzrange(first_appointment.starts_at, first_appointment.ends_at, '[)')
   where first_appointment.clinic_id = new.clinic_id
     and first_appointment.status <> 'cancelled'
     and second_appointment.status <> 'cancelled'
  ) then
    raise exception using errcode = '23P01', message = 'No puedes desactivar las citas simultáneas mientras existan citas del mismo profesional que se traslapen.';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create function private.protect_clinic_availability_block()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.clinic_id <> new.clinic_id then
    raise exception using errcode = '23514', message = 'No se puede cambiar la clínica de un horario bloqueado.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('availability:' || new.clinic_id::text, 0));
  if exists (
    select 1 from public.appointments as appointment
     where appointment.clinic_id = new.clinic_id
       and appointment.status <> 'cancelled'
       and tstzrange(appointment.starts_at, appointment.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
       and (new.scope = 'clinic'
         or (new.scope = 'branch' and appointment.branch_id = new.branch_id)
         or (new.scope = 'provider' and appointment.provider_id = new.provider_id))
  ) then
    raise exception using errcode = '23P01', message = 'No se puede bloquear un horario que ya tiene citas.';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_enforce_clinic_availability on public.appointments;
drop trigger if exists clinic_availability_settings_protect on public.clinic_availability_settings;
drop trigger if exists clinic_availability_blocks_protect on public.clinic_availability_blocks;
alter table public.appointments drop constraint if exists appointments_provider_no_overlap;

create trigger appointments_enforce_clinic_availability
  before insert or update of clinic_id, provider_id, branch_id, starts_at, ends_at, status
  on public.appointments for each row execute function private.enforce_clinic_availability();
create trigger clinic_availability_settings_protect
  before insert or update on public.clinic_availability_settings
  for each row execute function private.protect_clinic_availability_settings();
create trigger clinic_availability_blocks_protect
  before insert or update on public.clinic_availability_blocks
  for each row execute function private.protect_clinic_availability_block();
