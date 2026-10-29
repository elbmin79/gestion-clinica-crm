-- Allow clinic admins to update roles and revoke access while keeping the audit trigger active.
grant update (role), delete on public.clinic_memberships to authenticated;

create policy memberships_admin_update on public.clinic_memberships
  for update to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));

create policy memberships_admin_delete on public.clinic_memberships
  for delete to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin'])));

create or replace function private.prevent_last_clinic_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_clinic uuid;
  admins_remaining integer;
begin
  if tg_op = 'UPDATE' then
    if old.role <> 'admin' or new.role = 'admin' then
      return new;
    end if;
    affected_clinic := old.clinic_id;
  else
    if old.role <> 'admin' then
      return old;
    end if;
    affected_clinic := old.clinic_id;
  end if;

  -- Serialize admin demotions/revocations for this clinic to prevent concurrent lockout.
  perform 1 from public.clinics where id = affected_clinic for update;
  select count(*) into admins_remaining
  from public.clinic_memberships
  where clinic_id = affected_clinic and role = 'admin';

  if admins_remaining <= 1 then
    raise exception 'clinic_must_keep_admin'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_last_clinic_admin_removal() from public;

create trigger prevent_last_clinic_admin_removal
  before update of role or delete on public.clinic_memberships
  for each row execute function private.prevent_last_clinic_admin_removal();
