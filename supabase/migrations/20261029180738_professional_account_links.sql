-- Identity comes from the account; clinical title and branch assignments stay clinic-owned.
create or replace function private.enforce_provider_account_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare account_row auth.users%rowtype;
begin
  if new.user_id is null then return new; end if;
  select * into account_row from auth.users where id = new.user_id;
  if not found or new.user_id = '2bb8b5a1-b652-4db7-8070-8e0a5ee7897e'::uuid
     or lower(account_row.email) = 'admin@mkzsolutions.com.mx' then
    raise exception 'Esta cuenta no está disponible para el equipo clínico.';
  end if;
  if tg_op = 'INSERT' or new.user_id is distinct from old.user_id or new.clinic_id is distinct from old.clinic_id then
    perform 1 from public.clinic_memberships where clinic_id = new.clinic_id and user_id = new.user_id for share;
    if not found then raise exception 'La cuenta ya no tiene acceso a esta clínica.'; end if;
  end if;
  new.name := left(coalesce(nullif(trim(concat_ws(' ',
    account_row.raw_user_meta_data->>'names', account_row.raw_user_meta_data->>'firstLastName', account_row.raw_user_meta_data->>'secondLastName')), ''),
    nullif(account_row.raw_user_meta_data->>'full_name', ''), nullif(account_row.raw_user_meta_data->>'name', ''), account_row.email, new.name), 160);
  return new;
end;
$$;
revoke all on function private.enforce_provider_account_identity() from public;
create trigger provider_account_identity before insert or update on public.clinic_providers
for each row execute function private.enforce_provider_account_identity();

create or replace function private.sync_professional_profile_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The provider trigger derives the current account name, including on profile edits.
  update public.clinic_providers set name = name where user_id = new.id;
  return new;
end;
$$;
revoke all on function private.sync_professional_profile_name() from public;
create trigger sync_professional_profile_name after update of raw_user_meta_data, email on auth.users
for each row when (old.raw_user_meta_data is distinct from new.raw_user_meta_data or old.email is distinct from new.email)
execute function private.sync_professional_profile_name();

create or replace function public.save_clinic_professional(
  p_clinic_id uuid, p_provider_id uuid, p_user_id uuid, p_name text, p_role_title text, p_branch_ids uuid[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid; prior_user_id uuid; unique_branches uuid[];
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
  delete from public.provider_branches where clinic_id = p_clinic_id and provider_id = saved_id;
  insert into public.provider_branches(clinic_id,provider_id,branch_id)
    select p_clinic_id,saved_id,branch_id from unnest(unique_branches) branch_id;
  return saved_id;
exception when unique_violation then
  raise exception 'Esta cuenta ya está vinculada a otro profesional. Edita el registro existente.' using errcode = '23505';
end;
$$;
revoke all on function public.save_clinic_professional(uuid,uuid,uuid,text,text,uuid[]) from public, anon;
grant execute on function public.save_clinic_professional(uuid,uuid,uuid,text,text,uuid[]) to authenticated;
