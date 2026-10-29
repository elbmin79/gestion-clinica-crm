-- Let clinic admins grant an existing account access to their clinic.
-- Membership changes keep RLS and the membership audit trigger in effect.
grant insert on public.clinic_memberships to authenticated;

create policy memberships_admin_insert on public.clinic_memberships
  for insert to authenticated
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));
