-- Structured clinical encounters and patient-linked copies of signed documents.
-- The storage bucket is private; files are served only through short-lived URLs.
create table public.patient_encounters (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  appointment_id uuid,
  clinician_id uuid,
  occurred_at timestamptz not null default now(),
  chief_complaint text not null check (length(trim(chief_complaint)) between 1 and 2000),
  history text not null default '',
  examination text not null default '',
  assessment text not null default '',
  plan text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, clinic_id),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict,
  foreign key (clinician_id, clinic_id) references public.clinic_providers(id, clinic_id) on delete restrict,
  foreign key (appointment_id, patient_id, clinic_id) references public.appointments(id, patient_id, clinic_id) on delete restrict
);
create index patient_encounters_timeline_idx on public.patient_encounters(clinic_id, patient_id, occurred_at desc);
alter table public.patient_encounters enable row level security;
revoke all on public.patient_encounters from anon, authenticated;
grant select, insert on public.patient_encounters to authenticated;
create policy patient_encounters_clinical_read on public.patient_encounters
  for select to authenticated using ((select private.has_clinic_access(clinic_id, array['admin','clinician'])));
create policy patient_encounters_clinician_insert on public.patient_encounters
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (select private.has_clinic_access(clinic_id, array['admin','clinician']))
  );

create table public.patient_document_files (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  kind text not null check (kind in ('consent','contract','other')),
  title text not null check (length(trim(title)) between 1 and 200),
  signed_at timestamptz,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict
);
create index patient_document_files_timeline_idx on public.patient_document_files(clinic_id, patient_id, created_at desc);
alter table public.patient_document_files enable row level security;
revoke all on public.patient_document_files from anon, authenticated;
grant select, insert on public.patient_document_files to authenticated;
create policy patient_files_clinical_read on public.patient_document_files
  for select to authenticated using ((select private.has_clinic_access(clinic_id, array['admin','clinician','receptionist'])));
create policy patient_files_clinician_insert on public.patient_document_files
  for insert to authenticated with check (
    uploaded_by = (select auth.uid())
    and (select private.has_clinic_access(clinic_id, array['admin','clinician']))
    and storage_path like clinic_id::text || '/' || patient_id::text || '/%'
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('patient-records', 'patient-records', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy patient_record_files_read on storage.objects for select to authenticated
  using (bucket_id = 'patient-records' and (select private.has_clinic_access((storage.foldername(name))[1]::uuid, array['admin','clinician','receptionist'])));
create policy patient_record_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'patient-records'
    and (select private.has_clinic_access((storage.foldername(name))[1]::uuid, array['admin','clinician']))
    and (storage.foldername(name))[2] is not null
  );
