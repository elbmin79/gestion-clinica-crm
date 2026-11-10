alter table public.clinic_services
  add column deposit_mode text,
  add column deposit_fixed_amount numeric;

create function private.default_service_deposit() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare service_name text := lower(trim(new.name));
begin
  if new.deposit_mode is not null then return new; end if;
  new.deposit_fixed_amount := case
    when new.code in ('consulta-valoracion', 'lipo-assessment')
      or service_name in ('valoración', 'valoracion', 'consulta de valoración', 'valoración médica', 'valoracion medica', 'valoración lipoláser') then 500
    when new.category = 'Lipoláser' or service_name ~ '^lipo(láser|laser)([[:space:]]|$)' then 2000
    when new.code = 'fac-morpheus8' or service_name ~ '^morpheus([[:space:]]|8|$)' then 1000
  end;
  new.deposit_mode := case when new.deposit_fixed_amount is null then 'tier' else 'fixed' end;
  return new;
end $$;
revoke all on function private.default_service_deposit() from public, anon, authenticated;
create trigger clinic_services_default_deposit before insert or update of deposit_mode on public.clinic_services
  for each row execute function private.default_service_deposit();

update public.clinic_services set deposit_mode = null;
alter table public.clinic_services alter column deposit_mode set not null,
  add constraint clinic_services_deposit_rule check (
    (deposit_mode in ('tier', 'manual', 'full') and deposit_fixed_amount is null)
    or (deposit_mode = 'fixed' and deposit_fixed_amount is not null
      and deposit_fixed_amount > 0 and deposit_fixed_amount <= 9999999999.99
      and deposit_fixed_amount = round(deposit_fixed_amount, 2))
  );

create function public.save_clinic_service_with_deposit(
  target_clinic_id uuid, target_service_id uuid, target_code text, target_category text,
  target_name text, target_description text, target_duration_min integer, target_duration_max integer,
  target_offers jsonb, target_variants jsonb, target_notes text, target_source text, target_status text,
  target_active boolean, target_branch_ids uuid[], target_provider_ids uuid[],
  target_deposit_mode text, target_deposit_fixed_amount numeric
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare saved_id uuid;
begin
  saved_id := public.save_clinic_service(
    target_clinic_id, target_service_id, target_code, target_category, target_name, target_description,
    target_duration_min, target_duration_max, target_offers, target_variants, target_notes, target_source,
    target_status, target_active, target_branch_ids, target_provider_ids
  );
  update public.clinic_services set deposit_mode = target_deposit_mode, deposit_fixed_amount = target_deposit_fixed_amount
  where id = saved_id and clinic_id = target_clinic_id;
  if not found then raise exception 'Service catalog permission is required.' using errcode = '42501'; end if;
  return saved_id;
end $$;
revoke all on function public.save_clinic_service_with_deposit(uuid, uuid, text, text, text, text, integer, integer, jsonb, jsonb, text, text, text, boolean, uuid[], uuid[], text, numeric) from public, anon;
grant execute on function public.save_clinic_service_with_deposit(uuid, uuid, text, text, text, text, integer, integer, jsonb, jsonb, text, text, text, boolean, uuid[], uuid[], text, numeric) to authenticated;
