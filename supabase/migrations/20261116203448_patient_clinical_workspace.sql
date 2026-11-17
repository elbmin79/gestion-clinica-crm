-- Expand clinical notes, private patient files, and aesthetic procedure documentation.
alter table public.patient_encounters
  add column if not exists vitals jsonb not null default '{}'::jsonb,
  add column if not exists physical_exam jsonb not null default '{}'::jsonb,
  add column if not exists prognosis text not null default '',
  add column if not exists evolution text not null default '';

alter table public.patient_document_files drop constraint if exists patient_document_files_kind_check;
alter table public.patient_document_files add constraint patient_document_files_kind_check
  check (kind in ('consent','contract','other','study','clinical_photo'));

alter table public.patient_documents add column if not exists image_use_authorized boolean;
drop function if exists public.prepare_patient_document(uuid, uuid, uuid, text, text);
create function public.prepare_patient_document(
  target_clinic_id uuid, target_patient_id uuid, target_template_id uuid, target_kind text,
  target_service text default null, target_image_use_authorized boolean default null
)
returns table(document_id uuid, document_title text, document_kind text, document_service text, document_template_version integer,
  document_content_snapshot text, document_status text, document_requested_at timestamptz, document_diagnosis_id uuid,
  document_created_by uuid, document_image_use_authorized boolean)
language plpgsql security definer set search_path = '' as $$
declare
  patient_row public.patients%rowtype;
  template_row public.document_templates%rowtype;
  document_row public.patient_documents%rowtype;
  active_diagnosis_id uuid;
  service_value text;
  image_use_value boolean := null;
  actor_id uuid := auth.uid();
  requested_at_value timestamptz := now();
begin
  if not private.has_clinic_permission(target_clinic_id, 'documents.create') then
    raise exception 'Document preparation permission is required.' using errcode = '42501';
  end if;
  if target_kind not in ('contract', 'consent') then raise exception 'Document type is invalid.' using errcode = '23514'; end if;
  select * into patient_row from public.patients patient where patient.id = target_patient_id and patient.clinic_id = target_clinic_id for update;
  if not found then raise exception 'Patient record not found in this clinic.' using errcode = 'P0002'; end if;
  select * into template_row from public.document_templates template
    where template.id = target_template_id and template.clinic_id = target_clinic_id and template.kind = target_kind and template.active for share;
  if not found or nullif(trim(template_row.content), '') is null then raise exception 'Choose an active clinic-approved template with content.' using errcode = '23514'; end if;
  if target_kind = 'contract' then
    select diagnosis.id into active_diagnosis_id from public.patient_diagnoses diagnosis
    where diagnosis.clinic_id = target_clinic_id and diagnosis.patient_id = target_patient_id and diagnosis.status = 'accepted'
    order by diagnosis.created_at desc limit 1;
    if active_diagnosis_id is null then raise exception 'Accept the patient diagnosis before preparing a service contract.' using errcode = '23514'; end if;
    service_value := coalesce(nullif(trim(target_service), ''), nullif(trim(patient_row.service_summary), ''), 'Por definir');
  else
    service_value := null;
    active_diagnosis_id := null;
    if template_row.title ilike '%imagen%' then
      if target_image_use_authorized is null then raise exception 'Record whether image use is authorized.' using errcode = '23514'; end if;
      image_use_value := target_image_use_authorized;
    end if;
  end if;
  update public.patient_documents existing_document set status = 'replaced'
  where existing_document.clinic_id = target_clinic_id and existing_document.patient_id = target_patient_id
    and existing_document.kind = target_kind and existing_document.status = 'pending';
  insert into public.patient_documents(clinic_id, patient_id, template_id, diagnosis_id, kind, title, service,
    template_version, content_snapshot, status, requested_at, created_by, image_use_authorized)
  values(target_clinic_id, target_patient_id, template_row.id, active_diagnosis_id, target_kind,
    template_row.title, service_value, template_row.version, template_row.content, 'pending', requested_at_value, actor_id, image_use_value)
  returning * into document_row;
  return query select document_row.id, document_row.title, document_row.kind, document_row.service,
    document_row.template_version, document_row.content_snapshot, document_row.status,
    document_row.requested_at, document_row.diagnosis_id, document_row.created_by, document_row.image_use_authorized;
end;
$$;
revoke all on function public.prepare_patient_document(uuid, uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.prepare_patient_document(uuid, uuid, uuid, text, text, boolean) to authenticated;

create table if not exists public.patient_clinical_histories (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (clinic_id, patient_id),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict
);
alter table public.patient_clinical_histories enable row level security;
revoke all on public.patient_clinical_histories from anon, authenticated;
grant select, insert, update on public.patient_clinical_histories to authenticated;
drop policy if exists patient_clinical_histories_clinical_read on public.patient_clinical_histories;
create policy patient_clinical_histories_clinical_read on public.patient_clinical_histories
  for select to authenticated using ((select private.has_clinic_access(clinic_id, array['admin','clinician'])));
create policy clinic_members_read_patient_clinical_histories on public.patient_clinical_histories
  for select to authenticated using ((select private.has_clinic_access(clinic_id, null)));
drop policy if exists patient_clinical_histories_clinician_insert on public.patient_clinical_histories;
create policy patient_clinical_histories_clinician_insert on public.patient_clinical_histories
  for insert to authenticated with check (created_by = (select auth.uid()) and updated_by = (select auth.uid()) and (select private.has_clinic_access(clinic_id, array['admin','clinician'])));
create policy clinic_permission_patient_clinical_histories_insert on public.patient_clinical_histories
  for insert to authenticated with check (created_by = (select auth.uid()) and updated_by = (select auth.uid()) and (select private.has_clinic_permission(clinic_id, 'clinical.create')));
drop policy if exists patient_clinical_histories_clinician_update on public.patient_clinical_histories;
create policy patient_clinical_histories_clinician_update on public.patient_clinical_histories
  for update to authenticated using ((select private.has_clinic_access(clinic_id, array['admin','clinician'])))
  with check (updated_by = (select auth.uid()) and (select private.has_clinic_access(clinic_id, array['admin','clinician'])));
create policy clinic_permission_patient_clinical_histories_update on public.patient_clinical_histories
  for update to authenticated using ((select private.has_clinic_permission(clinic_id, 'clinical.edit')))
  with check (updated_by = (select auth.uid()) and (select private.has_clinic_permission(clinic_id, 'clinical.edit')));
create policy clinic_permission_patient_clinical_histories_insert_guard on public.patient_clinical_histories as restrictive
  for insert to authenticated with check ((select private.has_clinic_permission(clinic_id, 'clinical.create')));
create policy clinic_permission_patient_clinical_histories_update_guard on public.patient_clinical_histories as restrictive
  for update to authenticated using ((select private.has_clinic_permission(clinic_id, 'clinical.edit')))
  with check ((select private.has_clinic_permission(clinic_id, 'clinical.edit')));

create table if not exists public.patient_procedure_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  appointment_id uuid,
  clinician_id uuid,
  performed_at timestamptz not null default now(),
  procedure_type text not null check (length(trim(procedure_type)) between 1 and 120),
  product text check (product is null or length(product) <= 160),
  lot_number text check (lot_number is null or length(lot_number) <= 100),
  zones jsonb not null default '[]'::jsonb check (jsonb_typeof(zones) = 'array'),
  follow_up text not null default '' check (length(follow_up) <= 4000),
  consent_document_id uuid,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict,
  foreign key (consent_document_id, patient_id, clinic_id) references public.patient_documents(id, patient_id, clinic_id) on delete restrict,
  foreign key (clinician_id, clinic_id) references public.clinic_providers(id, clinic_id) on delete restrict,
  foreign key (appointment_id, patient_id, clinic_id) references public.appointments(id, patient_id, clinic_id) on delete restrict
);
create index if not exists patient_procedure_records_timeline_idx
  on public.patient_procedure_records(clinic_id, patient_id, performed_at desc);
alter table public.patient_procedure_records enable row level security;
revoke all on public.patient_procedure_records from anon, authenticated;
grant select, insert on public.patient_procedure_records to authenticated;
drop policy if exists patient_procedure_records_clinical_read on public.patient_procedure_records;
create policy patient_procedure_records_clinical_read on public.patient_procedure_records
  for select to authenticated using ((select private.has_clinic_access(clinic_id, array['admin','clinician'])));
create policy clinic_members_read_patient_procedure_records on public.patient_procedure_records
  for select to authenticated using ((select private.has_clinic_access(clinic_id, null)));
drop policy if exists patient_procedure_records_clinician_insert on public.patient_procedure_records;
create policy patient_procedure_records_clinician_insert on public.patient_procedure_records
  for insert to authenticated with check (created_by = (select auth.uid()) and (select private.has_clinic_access(clinic_id, array['admin','clinician'])));
create policy clinic_permission_patient_procedure_records_insert on public.patient_procedure_records
  for insert to authenticated with check (created_by = (select auth.uid()) and (select private.has_clinic_permission(clinic_id, 'clinical.create')));
create policy clinic_permission_patient_procedure_records_insert_guard on public.patient_procedure_records as restrictive
  for insert to authenticated with check ((select private.has_clinic_permission(clinic_id, 'clinical.create')));
