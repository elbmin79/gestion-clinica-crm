-- Keep updates to availability blocks under the same scope rules as insert
-- and delete. The earlier action-level guard would otherwise let a member
-- with agenda.edit modify blocks outside their configured scope.
drop policy if exists clinic_permission_update_guard on public.clinic_availability_blocks;
create policy clinic_permission_update_guard on public.clinic_availability_blocks as restrictive
  for update to authenticated
  using ((select private.can_manage_availability_block(clinic_id,scope,branch_id,provider_id)))
  with check ((select private.can_manage_availability_block(clinic_id,scope,branch_id,provider_id)));

-- Availability settings are clinic-wide controls and require clinic scope for
-- every write operation, including deletion.
drop policy if exists clinic_permission_delete_guard on public.clinic_availability_settings;
create policy clinic_permission_delete_guard on public.clinic_availability_settings as restrictive
  for delete to authenticated
  using ((select private.has_clinic_permission(clinic_id,'availability.manage_clinic')));
