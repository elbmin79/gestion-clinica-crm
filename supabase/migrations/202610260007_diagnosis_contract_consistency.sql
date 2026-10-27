-- A patient can have only one currently accepted diagnosis. Keep earlier
-- accepted records as superseded history rather than deleting them.
with ranked_accepted_diagnoses as (
  select diagnosis.id,
         row_number() over (
           partition by diagnosis.clinic_id, diagnosis.patient_id
           order by diagnosis.accepted_at desc nulls last,
                    diagnosis.created_at desc,
                    diagnosis.id desc
         ) as rank
    from public.patient_diagnoses as diagnosis
   where diagnosis.status = 'accepted'
)
update public.patient_diagnoses as diagnosis
   set status = 'superseded'
  from ranked_accepted_diagnoses as ranked
 where diagnosis.id = ranked.id
   and ranked.rank > 1;

create unique index patient_diagnoses_single_accepted_idx
  on public.patient_diagnoses (clinic_id, patient_id)
  where status = 'accepted';

revoke insert, update, delete on public.patient_diagnoses from authenticated;
grant select on public.patient_diagnoses to authenticated;

drop policy diagnoses_clinical_staff_read on public.patient_diagnoses;
create policy diagnoses_clinical_staff_read on public.patient_diagnoses
  for select to authenticated
  using ((select private.has_clinic_access(clinic_id, array['admin', 'clinician'])));

create function public.accept_patient_diagnosis(
  target_clinic_id uuid,
  target_patient_id uuid,
  target_summary text
)
returns table(diagnosis_id uuid, accepted_by uuid, superseded_diagnosis_count integer, replaced_contract_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_summary text := trim(coalesce(target_summary, ''));
  current_user_id uuid := (select auth.uid());
  changed_diagnosis_count integer := 0;
  changed_contract_count integer := 0;
begin
  if length(normalized_summary) = 0 or length(normalized_summary) > 4000 then
    raise exception 'Diagnosis summary must contain 1 to 4000 characters.' using errcode = '22023';
  end if;
  if current_user_id is null
     or not private.has_clinic_access(target_clinic_id, array['admin', 'clinician']) then
    raise exception 'Only clinic administrators and clinicians can accept diagnoses.' using errcode = '42501';
  end if;

  -- Serialize diagnosis changes for this patient, including the contract
  -- transition below, so concurrent accepts cannot leave competing versions.
  perform 1
    from public.patients as patient
   where patient.id = target_patient_id
     and patient.clinic_id = target_clinic_id
   for update;
  if not found then
    raise exception 'Patient does not exist in this clinic.' using errcode = '23503';
  end if;

  update public.patient_diagnoses as diagnosis
     set status = 'superseded'
   where diagnosis.clinic_id = target_clinic_id
     and diagnosis.patient_id = target_patient_id
     and diagnosis.status = 'accepted';
  get diagnostics changed_diagnosis_count = row_count;

  update public.patient_documents as document
     set status = 'replaced'
   where document.clinic_id = target_clinic_id
     and document.patient_id = target_patient_id
     and document.kind = 'contract'
     and document.status = 'pending';
  get diagnostics changed_contract_count = row_count;

  return query
    insert into public.patient_diagnoses (
      clinic_id, patient_id, summary, status, accepted_at, accepted_by, created_by
    ) values (
      target_clinic_id,
      target_patient_id,
      normalized_summary,
      'accepted',
      now(),
      current_user_id,
      current_user_id
    )
    returning patient_diagnoses.id, patient_diagnoses.accepted_by, changed_diagnosis_count, changed_contract_count;
end;
$$;
revoke all on function public.accept_patient_diagnosis(uuid, uuid, text) from public, anon;
grant execute on function public.accept_patient_diagnosis(uuid, uuid, text) to authenticated;
