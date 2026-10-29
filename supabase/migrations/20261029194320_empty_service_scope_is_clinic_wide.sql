create or replace function private.validate_appointment_catalog_service()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  service_rows jsonb;
  service_names text;
  requested_count integer;
  matched_count integer;
begin
  if tg_op = 'UPDATE' and old.service_ids is not distinct from new.service_ids
    and old.service_id is not distinct from new.service_id then
    if old.branch_id is not distinct from new.branch_id and old.provider_id is not distinct from new.provider_id then
      new.service_snapshot := old.service_snapshot;
      new.service := old.service;
      return new;
    end if;
    if coalesce(cardinality(new.service_ids),0)=0 and new.service_id is null then
      new.service_snapshot := old.service_snapshot;
      new.service := old.service;
      return new;
    end if;
  end if;

  if coalesce(cardinality(new.service_ids),0)=0 and new.service_id is not null then
    new.service_ids := array[new.service_id];
  end if;
  if coalesce(cardinality(new.service_ids),0)=0 then
    new.service_id := null;
    new.service_snapshot := '{}'::jsonb;
    return new;
  end if;
  if cardinality(new.service_ids) <> (select count(distinct id) from unnest(new.service_ids) ids(id)) then
    raise exception 'No repitas servicios en la misma cita.' using errcode = '23514';
  end if;
  if cardinality(new.service_ids) > 12 then
    raise exception 'Selecciona hasta 12 servicios por cita.' using errcode = '23514';
  end if;
  if extract(epoch from (new.ends_at-new.starts_at)) not between 900 and 43200
    or mod(extract(epoch from (new.ends_at-new.starts_at))::integer,900)<>0 then
    raise exception 'La duración de la cita debe estar entre 15 minutos y 12 horas, en pasos de 15 minutos.' using errcode = '23514';
  end if;

  with selected as (
    select s.id,s.code,s.category,s.name,s.duration_min,s.duration_max,s.offers,s.variants,
      array_position(new.service_ids,s.id) ordinal
    from unnest(new.service_ids) requested(id)
    join public.clinic_services s on s.id=requested.id and s.clinic_id=new.clinic_id and s.active
    join public.branches b on b.id=new.branch_id and b.clinic_id=s.clinic_id and b.active
    join public.clinic_providers p on p.id=new.provider_id and p.clinic_id=s.clinic_id and p.active
    join public.provider_branches pb on pb.clinic_id=s.clinic_id and pb.provider_id=p.id and pb.branch_id=b.id
    where (not exists (select 1 from public.clinic_service_branches sb where sb.clinic_id=s.clinic_id and sb.service_id=s.id)
      or exists (select 1 from public.clinic_service_branches sb where sb.clinic_id=s.clinic_id and sb.service_id=s.id and sb.branch_id=b.id))
      and (not exists (select 1 from public.clinic_service_providers sp where sp.clinic_id=s.clinic_id and sp.service_id=s.id)
      or exists (select 1 from public.clinic_service_providers sp where sp.clinic_id=s.clinic_id and sp.service_id=s.id and sp.provider_id=p.id))
  )
  select count(*)::integer,
    jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'category',category,
      'durationMin',duration_min,'durationMax',duration_max,'offers',offers,'variants',variants) order by ordinal),
    string_agg(name,' + ' order by ordinal)
  into matched_count,service_rows,service_names
  from selected;
  requested_count := cardinality(new.service_ids);
  if coalesce(matched_count,0)<>requested_count then
    raise exception 'Cada servicio debe estar activo y disponible para el profesional y sucursal de la cita.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.service_ids is not distinct from new.service_ids
    and old.service_id is not distinct from new.service_id then
    new.service := old.service;
    new.service_snapshot := old.service_snapshot;
    return new;
  end if;

  new.service_id := new.service_ids[1];
  new.service := service_names;
  new.service_snapshot := jsonb_build_object('services',service_rows,'scheduledDurationMinutes',extract(epoch from (new.ends_at-new.starts_at))::integer/60,'capturedAt',now());
  return new;
end;
$$;
