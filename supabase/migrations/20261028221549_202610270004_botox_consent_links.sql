-- Tie a Botox treatment record to the signed consent record or uploaded copy.
alter table public.patient_documents
  add constraint patient_documents_id_patient_clinic_key unique (id, patient_id, clinic_id);
alter table public.patient_document_files
  add constraint patient_document_files_id_patient_clinic_key unique (id, patient_id, clinic_id);

alter table public.botox_treatment_records
  add column consent_document_id uuid,
  add column consent_file_id uuid,
  add constraint botox_treatment_consent_source_check
    check (consent_document_id is null or consent_file_id is null),
  add constraint botox_treatment_consent_document_fkey
    foreign key (consent_document_id, patient_id, clinic_id)
    references public.patient_documents(id, patient_id, clinic_id) on delete restrict,
  add constraint botox_treatment_consent_file_fkey
    foreign key (consent_file_id, patient_id, clinic_id)
    references public.patient_document_files(id, patient_id, clinic_id) on delete restrict;
