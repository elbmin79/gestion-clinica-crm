create or replace function private.prevent_clinic_admin_membership_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.role = 'admin' then
    -- An Auth user is already absent when its membership is removed by the FK.
    -- The separate last-admin trigger still protects the clinic during the cascade.
    if not exists (select 1 from auth.users where id = old.user_id) then
      return old;
    end if;

    raise exception 'No se puede revocar el acceso de una cuenta administradora.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.role = 'admin'
     and (new.role is distinct from old.role or new.permissions is distinct from old.permissions) then
    raise exception 'Los permisos de una cuenta administradora no se pueden modificar.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
