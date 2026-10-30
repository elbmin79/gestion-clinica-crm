-- Keep read policies single-purpose and index all availability block foreign keys.

drop policy availability_settings_admin_write on public.clinic_availability_settings;
create policy availability_settings_admin_insert on public.clinic_availability_settings
  for insert to authenticated with check ((select private.has_clinic_access(clinic_id, array['admin'])));
create policy availability_settings_admin_update on public.clinic_availability_settings
  for update to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin'])))
  with check ((select private.has_clinic_access(clinic_id, array['admin'])));

drop policy availability_blocks_staff_write on public.clinic_availability_blocks;
create policy availability_blocks_staff_insert on public.clinic_availability_blocks
  for insert to authenticated
  with check ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));
create policy availability_blocks_staff_delete on public.clinic_availability_blocks
  for delete to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician', 'receptionist'])));

create index clinic_availability_blocks_branch_fk_idx
  on public.clinic_availability_blocks (branch_id, clinic_id) where branch_id is not null;
create index clinic_availability_blocks_provider_fk_idx
  on public.clinic_availability_blocks (provider_id, clinic_id) where provider_id is not null;
create index clinic_availability_blocks_created_by_fk_idx
  on public.clinic_availability_blocks (created_by) where created_by is not null;
