-- One-time setup for a new clinic-owned Supabase project.
-- Before running: apply every file in supabase/migrations, then create the
-- first administrator in Supabase Auth. Replace all values in this block.
-- Run from the Supabase SQL Editor as the project owner (postgres).
begin;

do $bootstrap$
declare
  admin_email text := 'REPLACE-WITH-ADMIN-EMAIL';
  clinic_name text := 'REPLACE-WITH-CLINIC-NAME';
  clinic_timezone text := 'America/Tijuana';
  admin_user_id uuid;
  admin_email_confirmed_at timestamptz;
  new_clinic_id uuid;
  new_business_id uuid;
begin
  admin_email := lower(trim(admin_email));
  clinic_name := trim(clinic_name);

  if admin_email = 'replace-with-admin-email' or position('@' in admin_email) < 2 then
    raise exception 'Replace admin_email with the verified Supabase Auth email before running.';
  end if;
  if clinic_name = 'REPLACE-WITH-CLINIC-NAME' or length(clinic_name) not between 1 and 160 then
    raise exception 'Replace clinic_name with the clinic name before running.';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = clinic_timezone) then
    raise exception 'Use a valid IANA clinic timezone.';
  end if;
  if exists (select 1 from public.clinics) or exists (select 1 from public.clinic_memberships) then
    raise exception 'This project already has clinic setup. Use its existing admin instead of running the first-clinic bootstrap.';
  end if;

  select auth_user.id, auth_user.email_confirmed_at
    into admin_user_id, admin_email_confirmed_at
    from auth.users as auth_user
   where lower(auth_user.email) = admin_email;

  if admin_user_id is null then
    raise exception 'No Supabase Auth user exists for %. Create that user first.', admin_email;
  end if;
  if admin_email_confirmed_at is null then
    raise exception 'Confirm the Supabase Auth email for % before provisioning the clinic.', admin_email;
  end if;
  if exists (
    select 1 from public.clinic_memberships
     where user_id = admin_user_id and role = 'admin'
  ) then
    raise exception 'This user already administers a clinic; bootstrap was stopped to avoid duplicate setup.';
  end if;

  insert into public.clinics (name, timezone)
  values (clinic_name, clinic_timezone)
  returning id into new_clinic_id;

  insert into public.clinic_memberships (clinic_id, user_id, role)
  values (new_clinic_id, admin_user_id, 'admin');

  insert into public.businesses (clinic_id, name)
  values (new_clinic_id, clinic_name)
  returning id into new_business_id;

  insert into public.branches (clinic_id, business_id, name)
  values (new_clinic_id, new_business_id, 'Sucursal principal');
end
$bootstrap$;

commit;
