-- Preserve last-admin protection while allowing an authorized whole-clinic deletion.
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
  -- Cascading membership deletion happens after the parent clinic is gone.
  -- Keep the guard for ordinary demotions/revocations on existing clinics.
  if not found and tg_op = 'DELETE' then
    return old;
  end if;

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
