-- Every clinic member can manage at least their own availability.
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
    'availability.scope', case target_role when 'admin' then 'clinic' when 'receptionist' then 'branch' else 'self' end,
    'public_agenda.manage', target_role = 'admin',
    'reminders.manage', target_role in ('admin','receptionist'),
    'whatsapp.view', target_role in ('admin','receptionist'),
    'whatsapp.reply', target_role in ('admin','receptionist'),
    'whatsapp.manage', target_role = 'admin'
  )
$$;
revoke all on function private.default_clinic_permissions(text) from public, anon, authenticated;

-- Upgrade existing memberships that were previously set to no availability access.
update public.clinic_memberships
set permissions = jsonb_set(
  coalesce(permissions, '{}'::jsonb),
  '{availability.scope}',
  to_jsonb('self'::text),
  true
)
where role <> 'admin'
  and coalesce(permissions->>'availability.scope', '') not in ('self', 'branch', 'clinic');

alter table public.clinic_memberships
  drop constraint if exists clinic_memberships_availability_scope_allowed;
alter table public.clinic_memberships
  add constraint clinic_memberships_availability_scope_allowed
  check (permissions->>'availability.scope' is null or permissions->>'availability.scope' in ('self', 'branch', 'clinic'));

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
      when permission_key = 'availability.manage_self' then coalesce(membership.permissions->>'availability.scope','self') in ('self','clinic')
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
          and coalesce(membership.permissions->>'availability.scope','self')='self')
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
