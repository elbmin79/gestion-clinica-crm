create or replace function private.validate_appointment_catalog_service()
returns trigger language plpgsql security definer set search_path = '' as $$
declare service_row public.clinic_services%rowtype;
begin
  if new.service_id is null then return new; end if;

  if tg_op = 'UPDATE' and old.service_id is not distinct from new.service_id then
    new.service_snapshot := old.service_snapshot;
    new.service := old.service;
    if old.branch_id is not distinct from new.branch_id and old.provider_id is not distinct from new.provider_id then
      return new;
    end if;
  end if;

  select s.* into service_row
  from public.clinic_services s
  join public.clinic_service_branches sb on sb.clinic_id=s.clinic_id and sb.service_id=s.id and sb.branch_id=new.branch_id
  join public.clinic_service_providers sp on sp.clinic_id=s.clinic_id and sp.service_id=s.id and sp.provider_id=new.provider_id
  join public.provider_branches pb on pb.clinic_id=s.clinic_id and pb.branch_id=sb.branch_id and pb.provider_id=sp.provider_id
  join public.branches b on b.id=sb.branch_id and b.clinic_id=s.clinic_id and b.active
  join public.clinic_providers p on p.id=sp.provider_id and p.clinic_id=s.clinic_id and p.active
  where s.id=new.service_id and s.clinic_id=new.clinic_id and s.active and s.duration_min is not null;
  if service_row.id is null then
    raise exception 'El servicio no está habilitado para la sucursal y profesional seleccionados.' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' or old.service_id is distinct from new.service_id then
    new.service := service_row.name;
    new.service_snapshot := jsonb_build_object('code',service_row.code,'name',service_row.name,'category',service_row.category,
      'durationMin',service_row.duration_min,'durationMax',service_row.duration_max,'offers',service_row.offers,
      'variants',service_row.variants,'capturedAt',now());
  end if;
  return new;
end;
$$;
drop trigger if exists appointments_catalog_service_guard on public.appointments;
create trigger appointments_catalog_service_guard before insert or update of service_id, service_snapshot, service, branch_id, provider_id
  on public.appointments for each row execute function private.validate_appointment_catalog_service();
