-- Separate, clinician-only audit trail for Botox treatment sessions.
create table public.botox_treatment_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  appointment_id uuid,
  clinician_id uuid,
  performed_at timestamptz not null default now(),
  product text not null check (length(trim(product)) between 1 and 160),
  lot_number text not null check (length(trim(lot_number)) between 1 and 100),
  expiration_date date,
  treatment_areas text not null check (length(trim(treatment_areas)) between 1 and 4000),
  total_units numeric(7,2) not null check (total_units > 0 and total_units <= 10000),
  follow_up text not null default '' check (length(follow_up) <= 4000),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict,
  foreign key (clinician_id, clinic_id) references public.clinic_providers(id, clinic_id) on delete restrict,
  foreign key (appointment_id, patient_id, clinic_id) references public.appointments(id, patient_id, clinic_id) on delete restrict
);

create index botox_treatment_records_timeline_idx
  on public.botox_treatment_records(clinic_id, patient_id, performed_at desc);

alter table public.botox_treatment_records enable row level security;
revoke all on public.botox_treatment_records from anon, authenticated;
grant select, insert on public.botox_treatment_records to authenticated;

create policy botox_records_clinical_read on public.botox_treatment_records
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin','clinician'])));

create policy botox_records_clinician_insert on public.botox_treatment_records
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.has_clinic_access(clinic_id, array['admin','clinician']))
  );
