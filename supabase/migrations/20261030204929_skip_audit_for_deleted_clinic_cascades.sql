create or replace function private.capture_audit_event()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  event_row jsonb;
begin
  event_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  -- Audit rows belong to the clinic and already cascade with it. During a
  -- whole-clinic deletion, do not insert a row referencing the deleted parent.
  if tg_op = 'DELETE' and not exists (select 1 from public.clinics where id=(event_row ->> 'clinic_id')::uuid) then
    return old;
  end if;

  insert into public.audit_events (clinic_id, actor_id, entity, action, record_id)
  values (
    (event_row ->> 'clinic_id')::uuid,
    (select auth.uid()),
    tg_table_name,
    tg_op,
    coalesce(
      event_row ->> 'id',
      event_row ->> 'record_number',
      event_row ->> 'user_id',
      case when event_row ? 'provider_id'
        then (event_row ->> 'provider_id') || ':' || (event_row ->> 'branch_id')
        else null
      end,
      'unknown'
    )
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.capture_audit_event() from public, anon, authenticated;

