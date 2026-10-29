-- Agenda identity belongs to a professional at a branch, independently of patient avatars and appointment status.
create or replace function private.valid_agenda_color_config(color text, service_colors jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare allowed text[] := array['green','orange','yellow','burgundy','blue','indigo','red','pink'];
begin
  if color is not null and not color = any(allowed) then return false; end if;
  if jsonb_typeof(service_colors) <> 'object' then return false; end if;
  if (select count(*) from jsonb_each(service_colors)) > 20 then return false; end if;
  return not exists(select 1 from jsonb_each_text(service_colors) r where length(trim(r.key)) not between 1 and 80 or r.value is null or not r.value = any(allowed));
end;
$$;
revoke all on function private.valid_agenda_color_config(text,jsonb) from public;
grant execute on function private.valid_agenda_color_config(text,jsonb) to authenticated;
alter table public.provider_branches add column agenda_color text,
  add column agenda_service_colors jsonb not null default '{}'::jsonb,
  add constraint provider_branch_agenda_colors_valid check(private.valid_agenda_color_config(agenda_color,agenda_service_colors));
create or replace function public.save_clinic_professional_with_colors(
  p_clinic_id uuid, p_provider_id uuid, p_user_id uuid, p_name text, p_role_title text, p_branch_ids uuid[], p_branch_settings jsonb default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid; prior_user_id uuid; unique_branches uuid[]; prior_settings jsonb; settings jsonb;
begin
  if auth.uid() is null or not private.has_clinic_access(p_clinic_id, array['admin']) then
    raise exception 'Solo una persona administradora puede guardar profesionales.' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 160 or length(coalesce(p_role_title,'')) > 160 then
    raise exception 'Revisa el nombre y el cargo o especialidad.';
  end if;
  select array_agg(distinct branch_id) into unique_branches from unnest(p_branch_ids) branch_id;
  if coalesce(cardinality(unique_branches), 0) = 0 then raise exception 'Selecciona al menos una sucursal de atención.'; end if;
  perform 1 from public.branches where clinic_id = p_clinic_id and active and id = any(unique_branches) for share;
  if (select count(*) from public.branches where clinic_id = p_clinic_id and active and id = any(unique_branches)) <> cardinality(unique_branches) then
    raise exception 'Revisa las sucursales seleccionadas.';
  end if;
  if p_provider_id is not null then
    select user_id into prior_user_id from public.clinic_providers where id = p_provider_id and clinic_id = p_clinic_id for update;
    if not found then raise exception 'El profesional ya no está disponible en esta clínica.'; end if;
    if prior_user_id is not null and p_user_id is distinct from prior_user_id then
      raise exception 'La cuenta vinculada no se puede sustituir desde este formulario.';
    end if;
    update public.clinic_providers set name = trim(p_name), role_title = coalesce(nullif(trim(p_role_title),''),'Profesional'), user_id = p_user_id
      where id = p_provider_id and clinic_id = p_clinic_id returning id into saved_id;
  else
    insert into public.clinic_providers(clinic_id,user_id,name,role_title)
      values(p_clinic_id,p_user_id,trim(p_name),coalesce(nullif(trim(p_role_title),''),'Profesional')) returning id into saved_id;
  end if;
  if p_branch_settings is not null and jsonb_typeof(p_branch_settings) <> 'object' then raise exception 'Revisa los colores de las sucursales.'; end if;
  select coalesce(jsonb_object_agg(branch_id::text,jsonb_build_object('color',agenda_color,'serviceColors',agenda_service_colors)), '{}'::jsonb)
    into prior_settings from public.provider_branches where clinic_id=p_clinic_id and provider_id=saved_id and branch_id=any(unique_branches);
  settings := coalesce(p_branch_settings,prior_settings);
  if exists(select 1 from jsonb_object_keys(settings) key where not key = any(select b::text from unnest(unique_branches)b)) then
    raise exception 'Revisa los colores de las sucursales.';
  end if;
  delete from public.provider_branches where clinic_id = p_clinic_id and provider_id = saved_id;
  insert into public.provider_branches(clinic_id,provider_id,branch_id,agenda_color,agenda_service_colors)
    select p_clinic_id,saved_id,branch_id,nullif(settings->branch_id::text->>'color',''),coalesce(settings->branch_id::text->'serviceColors','{}'::jsonb) from unnest(unique_branches) branch_id;
  return saved_id;
exception when unique_violation then
  raise exception 'Esta cuenta ya está vinculada a otro profesional. Edita el registro existente.' using errcode = '23505';
end;
$$;
revoke all on function public.save_clinic_professional_with_colors(uuid,uuid,uuid,text,text,uuid[],jsonb) from public, anon;
grant execute on function public.save_clinic_professional_with_colors(uuid,uuid,uuid,text,text,uuid[],jsonb) to authenticated;

-- Preserve the prior RPC contract; callers that omit colors retain their current configuration.
create or replace function public.save_clinic_professional(
  p_clinic_id uuid, p_provider_id uuid, p_user_id uuid, p_name text, p_role_title text, p_branch_ids uuid[]
) returns uuid language sql security invoker set search_path = '' as $$
  select public.save_clinic_professional_with_colors(p_clinic_id,p_provider_id,p_user_id,p_name,p_role_title,p_branch_ids,null);
$$;
notify pgrst, 'reload schema';
