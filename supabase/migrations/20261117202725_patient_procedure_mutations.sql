grant update (
  appointment_id, performed_at, procedure_type, product, lot_number,
  zones, follow_up, consent_document_id
) on public.patient_procedure_records to authenticated;

grant delete on public.patient_procedure_records to authenticated;

create policy clinic_permission_patient_procedure_records_update
  on public.patient_procedure_records for update to authenticated
  using ((select private.has_clinic_permission(clinic_id, 'clinical.edit')))
  with check ((select private.has_clinic_permission(clinic_id, 'clinical.edit')));

create policy clinic_permission_patient_procedure_records_delete
  on public.patient_procedure_records for delete to authenticated
  using ((select private.has_clinic_permission(clinic_id, 'clinical.edit')));
