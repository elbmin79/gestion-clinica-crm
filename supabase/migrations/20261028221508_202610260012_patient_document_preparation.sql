-- Clients may only create documents through the atomic preparation RPC.
revoke insert on public.patient_documents from authenticated;

create function public.prepare_patient_document(
  target_clinic_id uuid,
  target_patient_id uuid,
  target_template_id uuid,
  target_kind text,
  target_service text default null
)
returns table (
  document_id uuid,
  document_title text,
  document_kind text,
  document_service text,
  document_template_version integer,
  document_content_snapshot text,
  document_status text,
  document_requested_at timestamptz,
  document_diagnosis_id uuid,
  document_created_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_row public.patients%rowtype;
  template_row public.document_templates%rowtype;
  document_row public.patient_documents%rowtype;
  active_diagnosis_id uuid;
  service_value text;
  actor_id uuid := auth.uid();
  requested_at_value timestamptz := now();
begin
  if not private.has_clinic_access(target_clinic_id, array['admin', 'clinician']) then
    raise exception 'Document preparation access is not enabled for this role.' using errcode = '42501';
  end if;

  if target_kind not in ('contract', 'consent') then
    raise exception 'Document type is invalid.' using errcode = '23514';
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

  select *
    into template_row
    from public.document_templates as template
   where template.id = target_template_id
     and template.clinic_id = target_clinic_id
     and template.kind = target_kind
     and template.active
   for share;

  if not found or nullif(trim(template_row.content), '') is null then
    raise exception 'Choose an active clinic-approved template with content.' using errcode = '23514';
  end if;

  if target_kind = 'contract' then
    select diagnosis.id
      into active_diagnosis_id
      from public.patient_diagnoses as diagnosis
     where diagnosis.clinic_id = target_clinic_id
       and diagnosis.patient_id = target_patient_id
       and diagnosis.status = 'accepted'
     order by diagnosis.created_at desc
     limit 1;

    if active_diagnosis_id is null then
      raise exception 'Accept the patient diagnosis before preparing a service contract.' using errcode = '23514';
    end if;

    service_value := coalesce(nullif(trim(target_service), ''), nullif(trim(patient_row.service_summary), ''), 'Por definir');
  else
    service_value := null;
    active_diagnosis_id := null;
  end if;

  update public.patient_documents as existing_document
     set status = 'replaced'
   where existing_document.clinic_id = target_clinic_id
     and existing_document.patient_id = target_patient_id
     and existing_document.kind = target_kind
     and existing_document.status = 'pending';

  insert into public.patient_documents (
    clinic_id, patient_id, template_id, diagnosis_id, kind, title, service,
    template_version, content_snapshot, status, requested_at, created_by
  ) values (
    target_clinic_id, target_patient_id, template_row.id, active_diagnosis_id,
    target_kind, template_row.title, service_value, template_row.version,
    template_row.content, 'pending', requested_at_value, actor_id
  )
  returning * into document_row;

  return query select document_row.id, document_row.title, document_row.kind,
                      document_row.service, document_row.template_version,
                      document_row.content_snapshot, document_row.status,
                      document_row.requested_at, document_row.diagnosis_id,
                      document_row.created_by;
end;
$$;

revoke all on function public.prepare_patient_document(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.prepare_patient_document(uuid, uuid, uuid, text, text) to authenticated;
