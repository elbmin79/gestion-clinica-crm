-- Split the two clinic brands out of their encoded branch names so the CRM
-- can switch between clinic and area using business_id / branch_id.
begin;

-- The appointment foreign key ties branch_id and business_id together. Temporarily
-- replace it inside this transaction while both sides are reassigned.
alter table public.appointments
  drop constraint if exists appointments_branch_id_business_id_clinic_id_fkey;

do $migration$
declare
  target record;
  target_business_id uuid;
begin
  for target in
    select distinct branch.clinic_id, area.business_name
      from public.branches as branch
      cross join (values
        ('Macristy - Elixir Clinic Spa', 'Elixir Clinic Spa'),
        ('Zaragoza - Elixir Clinic Spa', 'Elixir Clinic Spa'),
        ('Macristy - Florezen', 'Florezen'),
        ('Zaragoza - Florezen', 'Florezen')
      ) as area(branch_name, business_name)
     where lower(trim(branch.name)) = lower(area.branch_name)
  loop
    select business.id
      into target_business_id
      from public.businesses as business
     where business.clinic_id = target.clinic_id
       and lower(trim(business.name)) = lower(target.business_name)
     order by business.created_at, business.id
     limit 1;

    if target_business_id is null then
      insert into public.businesses (clinic_id, name, active)
      values (target.clinic_id, target.business_name, true)
      returning id into target_business_id;
    end if;

    update public.branches as branch
       set business_id = target_business_id
      from (values
        ('Macristy - Elixir Clinic Spa', 'Elixir Clinic Spa'),
        ('Zaragoza - Elixir Clinic Spa', 'Elixir Clinic Spa'),
        ('Macristy - Florezen', 'Florezen'),
        ('Zaragoza - Florezen', 'Florezen')
      ) as area(branch_name, business_name)
     where branch.clinic_id = target.clinic_id
       and lower(trim(area.business_name)) = lower(trim(target.business_name))
       and lower(trim(branch.name)) = lower(trim(area.branch_name));

    update public.appointments as appointment
       set business_id = branch.business_id
      from public.branches as branch
     where appointment.clinic_id = target.clinic_id
       and appointment.branch_id = branch.id
       and branch.clinic_id = target.clinic_id;
  end loop;
end
$migration$;

alter table public.appointments
  add constraint appointments_branch_id_business_id_clinic_id_fkey
  foreign key (branch_id, business_id, clinic_id)
  references public.branches(id, business_id, clinic_id)
  on delete restrict;

commit;
