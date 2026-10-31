-- Keep clinic configuration available to all members while controlling each
-- write surface independently. WhatsApp and Public Agenda visibility are opt-in.

create or replace function private.default_clinic_permissions(target_role text)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'patients.view', true, 'agenda.view', true, 'payments.view', true,
    'documents.view', true, 'clinical.view', true, 'team.view', true,
    'settings.view', true, 'reminders.view', true,
    'patients.create', target_role in ('admin','clinician','receptionist'),
    'patients.edit', target_role in ('admin','clinician','receptionist'),
    'agenda.create', target_role in ('admin','clinician','receptionist'),
    'agenda.edit', target_role in ('admin','clinician','receptionist'),
    'agenda.cancel', target_role in ('admin','clinician','receptionist'),
    'payments.create', target_role in ('admin','receptionist','billing'),
    'payments.refund', target_role = 'admin',
    'documents.create', target_role in ('admin','clinician','receptionist'),
    'documents.manage_templates', target_role = 'admin',
    'clinical.create', target_role in ('admin','clinician'),
    'clinical.edit', target_role in ('admin','clinician'),
    'team.manage_branches', target_role in ('admin','receptionist'),
    'team.manage_professionals', target_role = 'admin',
    'services.manage', target_role = 'admin',
    'availability.scope', case target_role when 'admin' then 'clinic' when 'receptionist' then 'branch' when 'clinician' then 'self' else 'none' end,
    'public_agenda.manage', target_role = 'admin',
    'reminders.manage', target_role in ('admin','receptionist'),
    'whatsapp.view', target_role in ('admin','receptionist'),
    'whatsapp.reply', target_role in ('admin','receptionist'),
    'whatsapp.manage', target_role = 'admin'
  )
$$;
revoke all on function private.default_clinic_permissions(text) from public, anon, authenticated;

-- Preserve customized settings; add only missing values for current members.
update public.clinic_memberships
set permissions = (permissions - 'settings.manage' - 'public_agenda.view') || jsonb_build_object(
  'services.manage', coalesce((permissions->>'services.manage')::boolean, role = 'admin'),
  'availability.scope', coalesce(permissions->>'availability.scope', case role when 'admin' then 'clinic' when 'receptionist' then 'branch' when 'clinician' then 'self' else 'none' end),
  'public_agenda.manage', coalesce((permissions->>'public_agenda.manage')::boolean, role = 'admin')
)
where role <> 'admin';

create or replace function private.has_clinic_permission(target_clinic_id uuid, permission_key text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when membership.role = 'admin' then true
      when permission_key like '%.view' and permission_key <> 'whatsapp.view' then true
      when permission_key = 'public_agenda.manage' then coalesce((membership.permissions->>'public_agenda.manage')::boolean,false)
      when permission_key = 'availability.manage_clinic' then membership.permissions->>'availability.scope' = 'clinic'
      when permission_key = 'availability.manage_branch' then membership.permissions->>'availability.scope' in ('branch','clinic')
      when permission_key = 'availability.manage_self' then membership.permissions->>'availability.scope' in ('self','clinic')
      when permission_key = 'team.manage_access' then false
      when permission_key = 'whatsapp.reply' then
        coalesce((membership.permissions->>'whatsapp.reply')::boolean,false)
        and coalesce((membership.permissions->>'whatsapp.view')::boolean,false)
      when permission_key = 'whatsapp.manage' then
        coalesce((membership.permissions->>'whatsapp.manage')::boolean,false)
        and coalesce((membership.permissions->>'whatsapp.view')::boolean,false)
      else coalesce((membership.permissions->>permission_key)::boolean,false)
    end
    from public.clinic_memberships as membership
    where membership.clinic_id = target_clinic_id
      and membership.user_id = (select auth.uid())
  ), false)
$$;
revoke all on function private.has_clinic_permission(uuid,text) from public, anon;
grant execute on function private.has_clinic_permission(uuid,text) to authenticated;

create or replace function private.can_manage_availability_block(target_clinic_id uuid, target_scope text, target_branch_id uuid, target_provider_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when (select private.has_clinic_permission(target_clinic_id,'availability.manage_clinic')) then true
    when target_scope = 'branch'
      and target_branch_id is not null and target_provider_id is null
      and (select private.has_clinic_permission(target_clinic_id,'availability.manage_branch')) then true
    when target_scope = 'provider'
      and target_provider_id is not null and target_branch_id is null
      and exists (select 1 from public.clinic_memberships membership
        where membership.clinic_id=target_clinic_id and membership.user_id=(select auth.uid())
          and membership.permissions->>'availability.scope'='self')
      and exists (
        select 1 from public.clinic_providers provider
        where provider.id = target_provider_id
          and provider.clinic_id = target_clinic_id
          and provider.user_id = (select auth.uid())
          and provider.active
          and (select private.has_clinic_permission(target_clinic_id,'availability.manage_self'))
      ) then true
    else false
  end
$$;
revoke all on function private.can_manage_availability_block(uuid,text,uuid,uuid) from public, anon;
grant execute on function private.can_manage_availability_block(uuid,text,uuid,uuid) to authenticated;

-- The scope-specific guard is restrictive, so it narrows all older write
-- policies instead of allowing a legacy role policy to widen access.
drop policy if exists availability_blocks_staff_insert on public.clinic_availability_blocks;
drop policy if exists availability_blocks_staff_delete on public.clinic_availability_blocks;
create policy availability_blocks_member_insert on public.clinic_availability_blocks
  for insert to authenticated with check ((select private.has_clinic_access(clinic_id,null)));
create policy availability_blocks_member_delete on public.clinic_availability_blocks
  for delete to authenticated using ((select private.has_clinic_access(clinic_id,null)));
drop policy if exists clinic_permission_insert_guard on public.clinic_availability_blocks;
drop policy if exists clinic_permission_delete_guard on public.clinic_availability_blocks;
create policy clinic_permission_insert_guard on public.clinic_availability_blocks as restrictive
  for insert to authenticated with check ((select private.can_manage_availability_block(clinic_id,scope,branch_id,provider_id)));
create policy clinic_permission_delete_guard on public.clinic_availability_blocks as restrictive
  for delete to authenticated using ((select private.can_manage_availability_block(clinic_id,scope,branch_id,provider_id)));

drop policy if exists availability_settings_admin_insert on public.clinic_availability_settings;
drop policy if exists availability_settings_admin_update on public.clinic_availability_settings;
create policy availability_settings_member_insert on public.clinic_availability_settings
  for insert to authenticated with check ((select private.has_clinic_access(clinic_id,null)));
create policy availability_settings_member_update on public.clinic_availability_settings
  for update to authenticated using ((select private.has_clinic_access(clinic_id,null)))
  with check ((select private.has_clinic_access(clinic_id,null)));
drop policy if exists clinic_permission_insert_guard on public.clinic_availability_settings;
drop policy if exists clinic_permission_update_guard on public.clinic_availability_settings;
create policy clinic_permission_insert_guard on public.clinic_availability_settings as restrictive
  for insert to authenticated with check ((select private.has_clinic_permission(clinic_id,'availability.manage_clinic')));
create policy clinic_permission_update_guard on public.clinic_availability_settings as restrictive
  for update to authenticated using ((select private.has_clinic_permission(clinic_id,'availability.manage_clinic')))
  with check ((select private.has_clinic_permission(clinic_id,'availability.manage_clinic')));

-- Services have their own switch in the Configuration permissions group.
do $$
declare table_name text;
begin
  foreach table_name in array array['clinic_services','clinic_service_branches','clinic_service_providers'] loop
    execute format('drop policy if exists clinic_permission_insert_guard on public.%I',table_name);
    execute format('drop policy if exists clinic_permission_update_guard on public.%I',table_name);
    execute format('drop policy if exists clinic_permission_delete_guard on public.%I',table_name);
    execute format('create policy clinic_permission_insert_guard on public.%I as restrictive for insert to authenticated with check ((select private.has_clinic_permission(clinic_id,''services.manage'')))',table_name);
    execute format('create policy clinic_permission_update_guard on public.%I as restrictive for update to authenticated using ((select private.has_clinic_permission(clinic_id,''services.manage''))) with check ((select private.has_clinic_permission(clinic_id,''services.manage'')))',table_name);
    execute format('create policy clinic_permission_delete_guard on public.%I as restrictive for delete to authenticated using ((select private.has_clinic_permission(clinic_id,''services.manage'')))',table_name);
    execute format('drop policy if exists clinic_permission_%I_write on public.%I',table_name,table_name);
    execute format('create policy clinic_permission_%I_write on public.%I for all to authenticated using ((select private.has_clinic_permission(clinic_id,''services.manage''))) with check ((select private.has_clinic_permission(clinic_id,''services.manage'')))',table_name,table_name);
  end loop;
end
$$;

create or replace function public.save_clinic_service(target_clinic_id uuid, target_service_id uuid, target_code text, target_category text, target_name text, target_description text, target_duration_min integer, target_duration_max integer, target_offers jsonb, target_variants jsonb, target_notes text, target_source text, target_status text, target_active boolean, target_branch_ids uuid[], target_provider_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
  if not private.has_clinic_permission(target_clinic_id, 'services.manage') then
    raise exception 'Service catalog permission is required.' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(target_branch_ids, array[]::uuid[])) requested(id)
    where not exists (select 1 from public.branches branch where branch.id = requested.id and branch.clinic_id = target_clinic_id and branch.active))
  then raise exception 'Selecciona sucursales activas de esta clínica.' using errcode = '23514'; end if;
  if exists (select 1 from unnest(coalesce(target_provider_ids, array[]::uuid[])) requested(id)
    where not exists (select 1 from public.clinic_providers provider join public.provider_branches assignment
      on assignment.provider_id = provider.id and assignment.clinic_id = provider.clinic_id
      where provider.id = requested.id and provider.clinic_id = target_clinic_id and provider.active
        and assignment.branch_id = any(coalesce(target_branch_ids, array[]::uuid[]))))
  then raise exception 'Cada profesional debe estar activo y asignado a una de las sucursales del servicio.' using errcode = '23514'; end if;
  if target_service_id is null then
    insert into public.clinic_services(clinic_id, code, category, name, description, duration_min, duration_max, offers, variants, notes, source, status, active)
    values(target_clinic_id, target_code, target_category, target_name, target_description, target_duration_min, target_duration_max,
      target_offers, target_variants, target_notes, coalesce(target_source, 'Capturado por la clínica'), target_status, target_active)
    returning id into saved_id;
  else
    update public.clinic_services set code=target_code, category=target_category, name=target_name, description=target_description,
      duration_min=target_duration_min, duration_max=target_duration_max, offers=target_offers, variants=target_variants,
      notes=target_notes, source=coalesce(target_source, 'Capturado por la clínica'), status=target_status, active=target_active
    where id=target_service_id and clinic_id=target_clinic_id returning id into saved_id;
    if saved_id is null then raise exception 'El servicio ya no existe en esta clínica.' using errcode = 'P0002'; end if;
  end if;
  delete from public.clinic_service_branches where clinic_id=target_clinic_id and service_id=saved_id;
  insert into public.clinic_service_branches(clinic_id, service_id, branch_id)
    select target_clinic_id, saved_id, requested.id from (select distinct id from unnest(coalesce(target_branch_ids, array[]::uuid[])) requested(id)) requested;
  delete from public.clinic_service_providers where clinic_id=target_clinic_id and service_id=saved_id;
  insert into public.clinic_service_providers(clinic_id, service_id, provider_id)
    select target_clinic_id, saved_id, requested.id from (select distinct id from unnest(coalesce(target_provider_ids, array[]::uuid[])) requested(id)) requested;
  return saved_id;
end;
$$;
revoke all on function public.save_clinic_service(uuid,uuid,text,text,text,text,integer,integer,jsonb,jsonb,text,text,text,boolean,uuid[],uuid[]) from public, anon;
grant execute on function public.save_clinic_service(uuid,uuid,text,text,text,text,integer,integer,jsonb,jsonb,text,text,text,boolean,uuid[],uuid[]) to authenticated;

-- Every clinic member can view Agenda Pública. Editing its configuration is a
-- separate action permission, like the other configuration write surfaces.
do $$
declare table_name text;
begin
  foreach table_name in array array['public_agenda_hours','public_agenda_offers','public_agenda_settings'] loop
    execute format('drop policy if exists clinic_permission_%I_write on public.%I',table_name,table_name);
    execute format('create policy clinic_permission_%I_write on public.%I for all to authenticated using ((select private.has_clinic_permission(clinic_id,''public_agenda.manage''))) with check ((select private.has_clinic_permission(clinic_id,''public_agenda.manage'')))',table_name,table_name);
    execute format('drop policy if exists clinic_permission_insert_guard on public.%I',table_name);
    execute format('drop policy if exists clinic_permission_update_guard on public.%I',table_name);
    execute format('drop policy if exists clinic_permission_delete_guard on public.%I',table_name);
    execute format('create policy clinic_permission_insert_guard on public.%I as restrictive for insert to authenticated with check ((select private.has_clinic_permission(clinic_id,''public_agenda.manage'')))',table_name);
    execute format('create policy clinic_permission_update_guard on public.%I as restrictive for update to authenticated using ((select private.has_clinic_permission(clinic_id,''public_agenda.manage''))) with check ((select private.has_clinic_permission(clinic_id,''public_agenda.manage'')))',table_name);
    execute format('create policy clinic_permission_delete_guard on public.%I as restrictive for delete to authenticated using ((select private.has_clinic_permission(clinic_id,''public_agenda.manage'')))',table_name);
  end loop;
end
$$;

create or replace function public.save_public_agenda(p_clinic uuid, p_settings jsonb, p_offers jsonb, p_hours jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare item jsonb; offer_id uuid;
begin
  if auth.uid() is null or not private.has_clinic_permission(p_clinic, 'public_agenda.manage') then
    raise exception 'Public agenda permission is required.' using errcode = '42501';
  end if;
  if jsonb_array_length(p_offers)>100 or jsonb_array_length(p_hours)>300 then raise exception 'Demasiadas opciones u horarios.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('availability:'||p_clinic::text,0));
  insert into public.public_agenda_settings(clinic_id,slug,published,min_notice_minutes,max_days,buffer_minutes,require_email)
  values(p_clinic,p_settings->>'slug',coalesce((p_settings->>'published')::boolean,false),(p_settings->>'min_notice_minutes')::integer,
    (p_settings->>'max_days')::integer,(p_settings->>'buffer_minutes')::integer,coalesce((p_settings->>'require_email')::boolean,false))
  on conflict(clinic_id) do update set slug=excluded.slug,published=excluded.published,min_notice_minutes=excluded.min_notice_minutes,
    max_days=excluded.max_days,buffer_minutes=excluded.buffer_minutes,require_email=excluded.require_email;
  update public.public_agenda_offers set active=false where clinic_id=p_clinic;
  for item in select * from jsonb_array_elements(p_offers) loop
    offer_id:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
    if exists(select 1 from public.public_agenda_offers where id=offer_id and (clinic_id<>p_clinic or service_id<>(item->>'service_id')::uuid or branch_id<>(item->>'branch_id')::uuid or provider_id<>(item->>'provider_id')::uuid)) then raise exception 'La identidad de una opción guardada no puede cambiar; agrega una opción nueva.'; end if;
    select coalesce((select id from public.public_agenda_offers where clinic_id=p_clinic and service_id=(item->>'service_id')::uuid and branch_id=(item->>'branch_id')::uuid and provider_id=(item->>'provider_id')::uuid),offer_id) into offer_id;
    insert into public.public_agenda_offers(id,clinic_id,service_id,branch_id,provider_id,duration_minutes,deposit_amount,active)
    values(offer_id,p_clinic,(item->>'service_id')::uuid,(item->>'branch_id')::uuid,(item->>'provider_id')::uuid,(item->>'duration_minutes')::integer,(item->>'deposit_amount')::numeric,true)
    on conflict(id) do update set duration_minutes=excluded.duration_minutes,deposit_amount=excluded.deposit_amount,active=true;
    if not private.public_offer_valid(offer_id) then raise exception 'Revisa el servicio, sucursal y profesional de cada opción.'; end if;
  end loop;
  delete from public.public_agenda_hours where clinic_id=p_clinic;
  for item in select * from jsonb_array_elements(p_hours) loop
    insert into public.public_agenda_hours(clinic_id,branch_id,provider_id,day_of_week,on_date,closed,opens_minute,closes_minute)
    values(p_clinic,(item->>'branch_id')::uuid,(item->>'provider_id')::uuid,nullif(item->>'day_of_week','')::integer,
      nullif(item->>'on_date','')::date,coalesce((item->>'closed')::boolean,false),nullif(item->>'opens_minute','')::integer,nullif(item->>'closes_minute','')::integer);
  end loop;
  if exists(select 1 from public.public_agenda_hours h join public.public_agenda_hours e
    on e.clinic_id=h.clinic_id and e.branch_id=h.branch_id and e.provider_id=h.provider_id and e.id>h.id
    and e.day_of_week is not distinct from h.day_of_week and e.on_date is not distinct from h.on_date
    where h.clinic_id=p_clinic and (h.closed or e.closed or int4range(h.opens_minute,h.closes_minute,'[)') && int4range(e.opens_minute,e.closes_minute,'[)')))
  then raise exception 'Los horarios no pueden traslaparse ni combinar un cierre con una apertura en la misma fecha.'; end if;
  if (p_settings->>'published')::boolean and (not exists(select 1 from public.public_agenda_offers where clinic_id=p_clinic and active)
    or exists(select 1 from public.public_agenda_offers o where o.clinic_id=p_clinic and o.active and not exists(select 1 from public.public_agenda_hours h where h.clinic_id=o.clinic_id and h.branch_id=o.branch_id and h.provider_id=o.provider_id and not h.closed)))
  then raise exception 'Agrega opciones y horarios de atención antes de publicar.'; end if;
end;
$$;
revoke all on function public.save_public_agenda(uuid,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_public_agenda(uuid,jsonb,jsonb,jsonb) to authenticated;

-- Push alerts are account preferences, not role-gated functionality. Role
-- defaults decide the initial state; users may opt in or out individually.
create or replace function private.capture_staff_appointment_alert() returns trigger
language plpgsql security definer set search_path='' as $$
declare alert_kind text; alert_message text; recipient record; alert_id uuid;
begin
  if TG_OP='INSERT' then
    alert_kind := 'new_appointment'; alert_message := 'Nueva cita registrada';
  elsif new.status='cancelled' and old.status is distinct from new.status then
    alert_kind := 'agenda_change'; alert_message := 'Cita cancelada';
  elsif row(new.starts_at,new.ends_at,new.provider_id,new.branch_id) is distinct from row(old.starts_at,old.ends_at,old.provider_id,old.branch_id) then
    alert_kind := 'agenda_change'; alert_message := 'Horario o asignación de cita actualizado';
  else return new;
  end if;
  for recipient in
    select m.user_id,coalesce(p.push_enabled,true) as push_enabled
    from public.clinic_memberships m
    left join public.staff_notification_preferences p on p.clinic_id=m.clinic_id and p.user_id=m.user_id
    where m.clinic_id=new.clinic_id
      and (m.user_id is distinct from auth.uid() or coalesce(p.include_self,false))
      and case when alert_kind='new_appointment' then coalesce(p.new_appointment,m.role<>'billing') else coalesce(p.agenda_change,m.role<>'billing') end
      and (m.role in ('admin','receptionist','billing') or (m.role='clinician' and exists (
        select 1 from public.clinic_providers cp where cp.clinic_id=m.clinic_id and cp.user_id=m.user_id and cp.active
          and (cp.id=new.provider_id or (TG_OP='UPDATE' and cp.id=old.provider_id))
      )))
  loop
    insert into public.staff_notifications(clinic_id,user_id,appointment_id,kind,message)
      values(new.clinic_id,recipient.user_id,new.id,alert_kind,alert_message) returning id into alert_id;
    if recipient.push_enabled then
      insert into private.staff_push_deliveries(notification_id,subscription_id)
        select alert_id,s.id from public.staff_push_subscriptions s where s.clinic_id=new.clinic_id and s.user_id=recipient.user_id;
    end if;
  end loop;
  return new;
end $$;

create or replace function public.staff_push_is_eligible(target_id uuid,target_token uuid) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from private.staff_push_deliveries d
 join public.staff_notifications n on n.id=d.notification_id
 join public.clinic_memberships m on m.clinic_id=n.clinic_id and m.user_id=n.user_id
 join public.staff_push_subscriptions s on s.id=d.subscription_id and s.clinic_id=n.clinic_id and s.user_id=n.user_id
 left join public.staff_notification_preferences p on p.clinic_id=m.clinic_id and p.user_id=m.user_id
 where d.id=target_id and d.claim_token=target_token and d.state='sending' and d.available_at>now()
 and (m.role in ('admin','receptionist','billing') or n.kind='test' or (m.role='clinician' and exists(select 1 from public.clinic_providers cp where cp.clinic_id=m.clinic_id and cp.user_id=m.user_id and cp.active)))
 and coalesce(p.push_enabled,true)
 and case n.kind when 'new_appointment' then coalesce(p.new_appointment,m.role<>'billing') when 'agenda_change' then coalesce(p.agenda_change,m.role<>'billing') else true end);
$$;

create or replace function private.notify_public_booking_request() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient record; alert_id uuid;
begin
  for recipient in
    select m.user_id,coalesce(p.push_enabled,true) as push_enabled
    from public.clinic_memberships m
    left join public.staff_notification_preferences p on p.clinic_id=m.clinic_id and p.user_id=m.user_id
    where m.clinic_id=new.clinic_id
      and m.role in ('admin','receptionist','billing')
      and coalesce(p.new_appointment,m.role<>'billing')
  loop
    insert into public.staff_notifications(clinic_id,user_id,kind,message,booking_request_id)
      values(new.clinic_id,recipient.user_id,'new_appointment','Nueva solicitud de cita',new.id) returning id into alert_id;
    if recipient.push_enabled then
      insert into private.staff_push_deliveries(notification_id,subscription_id)
        select alert_id,s.id from public.staff_push_subscriptions s where s.clinic_id=new.clinic_id and s.user_id=recipient.user_id;
    end if;
  end loop;
  return new;
end $$;
