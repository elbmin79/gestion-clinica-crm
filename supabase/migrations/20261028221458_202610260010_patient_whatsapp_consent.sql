-- Reminder delivery must never infer WhatsApp consent from clinical consent.
-- Keep the current state on the patient and append every grant/revocation.
alter table public.patients
  add column appointment_whatsapp_opt_in boolean not null default false,
  add column appointment_whatsapp_opt_in_at timestamptz,
  add column appointment_whatsapp_opt_in_source text,
  add constraint patients_appointment_whatsapp_consent_valid
    check (
      (appointment_whatsapp_opt_in and appointment_whatsapp_opt_in_at is not null
        and appointment_whatsapp_opt_in_source in ('written', 'verbal', 'electronic'))
      or
      (not appointment_whatsapp_opt_in and appointment_whatsapp_opt_in_at is null
        and appointment_whatsapp_opt_in_source is null)
    );

-- Keep profile and messaging-consent changes behind one role-checked, audited RPC.
-- This prevents a consent event from being separated from its patient update.
revoke update on public.patients from authenticated;

create table public.patient_messaging_consent_history (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  channel text not null check (channel = 'whatsapp'),
  opted_in boolean not null,
  source text check (source is null or source in ('written', 'verbal', 'electronic')),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete cascade,
  check ((opted_in and source is not null) or (not opted_in and source is null))
);

create index patient_messaging_consent_history_patient_idx
  on public.patient_messaging_consent_history (clinic_id, patient_id, recorded_at desc);

alter table public.patient_messaging_consent_history enable row level security;
revoke all on public.patient_messaging_consent_history from anon, authenticated;
grant select on public.patient_messaging_consent_history to authenticated;

create policy patient_messaging_consent_admin_read on public.patient_messaging_consent_history
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'receptionist'])));


-- Apply patient edits and consent history as a single transaction.
create function public.update_patient_directory_record(
  target_clinic_id uuid,
  target_patient_id uuid,
  target_full_name text,
  target_email text,
  target_phone text,
  target_service_summary text,
  target_branch_id uuid,
  target_provider_id uuid,
  target_status text,
  target_whatsapp_opt_in boolean,
  target_whatsapp_opt_in_source text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_row public.patients%rowtype;
  consent_changed boolean;
  consent_recorded_at timestamptz;
  actor_id uuid := auth.uid();
begin
  if not private.has_clinic_access(target_clinic_id, array['admin', 'clinician', 'receptionist']) then
    raise exception 'Patient edit access is not enabled for this role.' using errcode = '42501';
  end if;

  if target_status not in ('active', 'follow_up', 'new', 'inactive') then
    raise exception 'Patient status is invalid.' using errcode = '23514', constraint = 'patient_status_valid';
  end if;

  if target_whatsapp_opt_in and (
    target_whatsapp_opt_in_source is null
    or target_whatsapp_opt_in_source not in ('written', 'verbal', 'electronic')
  ) then
    raise exception 'Choose how the patient authorized WhatsApp appointment messages.'
      using errcode = '23514', constraint = 'patient_whatsapp_consent_source_valid';
  end if;

  if not target_whatsapp_opt_in then
    target_whatsapp_opt_in_source := null;
  end if;

  select *
    into patient_row
    from public.patients as patient
   where patient.id = target_patient_id
     and patient.clinic_id = target_clinic_id
   for update;

  if not found then
    raise exception 'Patient record not found in this clinic.' using errcode = 'P0002';
  end if;

  if target_whatsapp_opt_in and nullif(trim(target_phone), '') is null then
    raise exception 'Add a patient phone number before recording WhatsApp authorization.'
      using errcode = '23514', constraint = 'patient_whatsapp_consent_requires_phone';
  end if;

  consent_changed :=
    patient_row.appointment_whatsapp_opt_in is distinct from target_whatsapp_opt_in
    or (target_whatsapp_opt_in and patient_row.appointment_whatsapp_opt_in_source is distinct from target_whatsapp_opt_in_source);

  consent_recorded_at := case
    when target_whatsapp_opt_in and consent_changed then now()
    when target_whatsapp_opt_in then patient_row.appointment_whatsapp_opt_in_at
    else null
  end;

  if consent_changed then
    insert into public.patient_messaging_consent_history (
      clinic_id, patient_id, channel, opted_in, source, recorded_by, recorded_at
    ) values (
      target_clinic_id, target_patient_id, 'whatsapp', target_whatsapp_opt_in,
      target_whatsapp_opt_in_source, actor_id, coalesce(consent_recorded_at, now())
    );
  end if;

  update public.patients as patient
     set full_name = trim(target_full_name),
         email = nullif(trim(coalesce(target_email, '')), ''),
         phone = nullif(trim(coalesce(target_phone, '')), ''),
         service_summary = coalesce(nullif(trim(target_service_summary), ''), 'Por definir'),
         primary_branch_id = target_branch_id,
         primary_provider_id = target_provider_id,
         status = target_status,
         appointment_whatsapp_opt_in = target_whatsapp_opt_in,
         appointment_whatsapp_opt_in_at = consent_recorded_at,
         appointment_whatsapp_opt_in_source = target_whatsapp_opt_in_source
   where patient.id = target_patient_id
     and patient.clinic_id = target_clinic_id;
end;
$$;

revoke all on function public.update_patient_directory_record(uuid, uuid, text, text, text, text, uuid, uuid, text, boolean, text) from public, anon;
grant execute on function public.update_patient_directory_record(uuid, uuid, text, text, text, text, uuid, uuid, text, boolean, text) to authenticated;
