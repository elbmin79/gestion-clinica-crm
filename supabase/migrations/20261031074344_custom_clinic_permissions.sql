-- Per-member action permissions. Clinic content remains readable by every
-- member; WhatsApp is the only module whose visibility is configurable.
alter table public.clinic_memberships
  add column if not exists permissions jsonb not null default '{}'::jsonb;

create or replace function private.default_clinic_permissions(target_role text)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'patients.view', true, 'agenda.view', true, 'payments.view', true,
    'documents.view', true, 'clinical.view', true, 'team.view', true,
    'settings.view', true, 'reminders.view', true,
    'patients.create', target_role in ('admin','clinician','receptionist'),
    'patients.edit', target_role in ('admin','clinician','receptionist'),
    'agenda.create', target_role in ('admin','clinician','receptionist'),
    'agenda.edit', target_role in ('admin','clinician','receptionist'),
    'agenda.cancel', target_role in ('admin','clinician','receptionist'),
    'payments.create', target_role in ('admin','receptionist','billing'),
    'payments.refund', target_role = 'admin',
    'documents.create', target_role in ('admin','clinician','receptionist'),
    'documents.manage_templates', target_role = 'admin',
    'clinical.create', target_role = 'admin' or target_role = 'clinician',
    'clinical.edit', target_role = 'admin' or target_role = 'clinician',
    'team.manage_branches', target_role in ('admin','receptionist'),
    'team.manage_professionals', target_role = 'admin',
    'settings.manage', target_role = 'admin',
    'reminders.manage', target_role in ('admin','receptionist'),
    'whatsapp.view', target_role in ('admin','receptionist'),
    'whatsapp.reply', target_role in ('admin','receptionist'),
    'whatsapp.manage', target_role = 'admin'
  )
$$;

update public.clinic_memberships
set permissions = private.default_clinic_permissions(role)
where permissions = '{}'::jsonb;

create or replace function private.has_clinic_permission(target_clinic_id uuid, permission_key text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when membership.role = 'admin' then true
      when permission_key like '%.view' and permission_key <> 'whatsapp.view' then true
      when permission_key = 'team.manage_access' then false
      when permission_key = 'whatsapp.reply' then
        coalesce((membership.permissions ->> 'whatsapp.reply')::boolean, false)
        and coalesce((membership.permissions ->> 'whatsapp.view')::boolean, false)
      when permission_key = 'whatsapp.manage' then
        coalesce((membership.permissions ->> 'whatsapp.manage')::boolean, false)
        and coalesce((membership.permissions ->> 'whatsapp.view')::boolean, false)
      else coalesce((membership.permissions ->> permission_key)::boolean, false)
    end
    from public.clinic_memberships as membership
    where membership.clinic_id = target_clinic_id
      and membership.user_id = (select auth.uid())
  ), false)
$$;
revoke all on function private.has_clinic_permission(uuid,text) from public, anon;
grant execute on function private.has_clinic_permission(uuid,text) to authenticated;
revoke all on function private.default_clinic_permissions(text) from public, anon, authenticated;

-- Existing read policies differ by role. These additive policies make all
-- CRM data readable to clinic members without widening access across clinics.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'appointment_confirmation_requests','appointment_reminders','appointments',
    'botox_treatment_records','branches','businesses','clinic_availability_blocks',
    'clinic_availability_settings','clinic_providers','clinic_service_branches',
    'clinic_service_providers','clinic_services','document_templates',
    'patient_activities','patient_diagnoses','patient_document_files',
    'patient_documents','patient_encounters','patients','payments',
    'public_agenda_hours','public_agenda_offers','public_agenda_settings',
    'public_booking_requests'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'clinic_members_read_' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.has_clinic_access(clinic_id, null)))',
      'clinic_members_read_' || table_name, table_name
    );
  end loop;
end
$$;

-- WhatsApp access is intentionally separate from universal read access.
drop policy if exists clinic_whatsapp_settings_member_read on public.clinic_whatsapp_configurations;
drop policy if exists clinic_whatsapp_conversations_staff_read on public.clinic_whatsapp_conversations;
drop policy if exists clinic_whatsapp_messages_staff_read on public.clinic_whatsapp_messages;
drop policy if exists clinic_whatsapp_sender_branches_member_read on public.clinic_whatsapp_sender_branches;
drop policy if exists clinic_whatsapp_senders_member_read on public.clinic_whatsapp_senders;
create policy clinic_whatsapp_settings_permission_read on public.clinic_whatsapp_configurations
  for select to authenticated using ((select private.has_clinic_permission(clinic_id, 'whatsapp.view')));
create policy clinic_whatsapp_conversations_permission_read on public.clinic_whatsapp_conversations
  for select to authenticated using ((select private.has_clinic_permission(clinic_id, 'whatsapp.view')));
create policy clinic_whatsapp_messages_permission_read on public.clinic_whatsapp_messages
  for select to authenticated using ((select private.has_clinic_permission(clinic_id, 'whatsapp.view')));
create policy clinic_whatsapp_sender_branches_permission_read on public.clinic_whatsapp_sender_branches
  for select to authenticated using ((select private.has_clinic_permission(clinic_id, 'whatsapp.view')));
create policy clinic_whatsapp_senders_permission_read on public.clinic_whatsapp_senders
  for select to authenticated using ((select private.has_clinic_permission(clinic_id, 'whatsapp.view')));

-- Restrictive policies enforce each saved action permission even when an
-- older, broader role policy on the same table would otherwise allow it.
do $$
declare item record;
begin
  for item in select * from (values
    ('patients','patients.create','patients.edit'),
    ('appointments','agenda.create','agenda.edit'),
    ('branches','team.manage_branches','team.manage_branches'),
    ('businesses','team.manage_branches','team.manage_branches'),
    ('clinic_availability_blocks','agenda.edit','agenda.edit'),
    ('clinic_availability_settings','settings.manage','settings.manage'),
    ('clinic_providers','team.manage_professionals','team.manage_professionals'),
    ('clinic_services','team.manage_professionals','team.manage_professionals'),
    ('clinic_service_branches','team.manage_professionals','team.manage_professionals'),
    ('clinic_service_providers','team.manage_professionals','team.manage_professionals'),
    ('document_templates','documents.manage_templates','documents.manage_templates'),
    ('patient_diagnoses','clinical.create','clinical.edit'),
    ('patient_activities','clinical.create','clinical.create'),
    ('patient_document_files','clinical.create','clinical.create'),
    ('patient_documents','documents.create','documents.create'),
    ('patient_encounters','clinical.create','clinical.create'),
    ('botox_treatment_records','clinical.create','clinical.create'),
    ('payments','payments.create','payments.refund')
  ) as permissions(table_name, insert_key, update_key)
  loop
    execute format('drop policy if exists clinic_permission_insert_guard on public.%I', item.table_name);
    execute format('drop policy if exists clinic_permission_update_guard on public.%I', item.table_name);
    execute format('drop policy if exists clinic_permission_delete_guard on public.%I', item.table_name);
    execute format(
      'create policy clinic_permission_insert_guard on public.%I as restrictive for insert to authenticated with check ((select private.has_clinic_permission(clinic_id, %L)))',
      item.table_name, item.insert_key
    );
    execute format(
      'create policy clinic_permission_update_guard on public.%I as restrictive for update to authenticated using ((select private.has_clinic_permission(clinic_id, %L))) with check ((select private.has_clinic_permission(clinic_id, %L)))',
      item.table_name, item.update_key, item.update_key
    );
    execute format(
      'create policy clinic_permission_delete_guard on public.%I as restrictive for delete to authenticated using ((select private.has_clinic_permission(clinic_id, %L)))',
      item.table_name, item.update_key
    );
  end loop;
end
$$;

drop policy if exists clinic_permission_update_guard on public.appointments;
drop policy if exists clinic_permission_delete_guard on public.appointments;
create policy clinic_permission_update_guard on public.appointments as restrictive
  for update to authenticated
  using ((select private.has_clinic_permission(clinic_id, 'agenda.edit') or private.has_clinic_permission(clinic_id, 'agenda.cancel')))
  with check (
    (status = 'cancelled' and (select private.has_clinic_permission(clinic_id, 'agenda.cancel')))
    or (status <> 'cancelled' and (select private.has_clinic_permission(clinic_id, 'agenda.edit')))
  );
create policy clinic_permission_delete_guard on public.appointments as restrictive
  for delete to authenticated using ((select private.has_clinic_permission(clinic_id, 'agenda.cancel')));

-- Permission grants are independent of the template role: if an administrator
-- explicitly grants an action, the matching scoped write policy must allow it.
create policy clinic_permission_patients_insert on public.patients
  for insert to authenticated with check ((select private.has_clinic_permission(clinic_id, 'patients.create')));
create policy clinic_permission_patients_update on public.patients
  for update to authenticated using ((select private.has_clinic_permission(clinic_id, 'patients.edit')))
  with check ((select private.has_clinic_permission(clinic_id, 'patients.edit')));
create policy clinic_permission_patients_delete on public.patients
  for delete to authenticated using ((select private.has_clinic_permission(clinic_id, 'patients.edit')));

create policy clinic_permission_appointments_insert on public.appointments
  for insert to authenticated with check (
    (select private.has_clinic_permission(clinic_id, 'agenda.create'))
    and (not exists (select 1 from public.provider_branches assignment where assignment.clinic_id = appointments.clinic_id and assignment.provider_id = appointments.provider_id)
      or exists (select 1 from public.provider_branches assignment where assignment.clinic_id = appointments.clinic_id and assignment.provider_id = appointments.provider_id and assignment.branch_id = appointments.branch_id))
  );
create policy clinic_permission_appointments_update on public.appointments
  for update to authenticated using (
    (select private.has_clinic_permission(clinic_id, 'agenda.edit') or private.has_clinic_permission(clinic_id, 'agenda.cancel'))
  ) with check (
    (select private.has_clinic_permission(clinic_id, 'agenda.edit') or private.has_clinic_permission(clinic_id, 'agenda.cancel'))
    and (not exists (select 1 from public.provider_branches assignment where assignment.clinic_id = appointments.clinic_id and assignment.provider_id = appointments.provider_id)
      or exists (select 1 from public.provider_branches assignment where assignment.clinic_id = appointments.clinic_id and assignment.provider_id = appointments.provider_id and assignment.branch_id = appointments.branch_id))
  );
create policy clinic_permission_appointments_delete on public.appointments
  for delete to authenticated using ((select private.has_clinic_permission(clinic_id, 'agenda.cancel')));

create policy clinic_permission_payments_insert on public.payments
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and ((direction = 'refund' and (select private.has_clinic_permission(clinic_id, 'payments.refund')))
      or (direction <> 'refund' and (select private.has_clinic_permission(clinic_id, 'payments.create'))))
  );
drop policy if exists clinic_permission_insert_guard on public.payments;
create policy clinic_permission_insert_guard on public.payments as restrictive
  for insert to authenticated with check (
    (direction = 'refund' and (select private.has_clinic_permission(clinic_id, 'payments.refund')))
    or (direction <> 'refund' and (select private.has_clinic_permission(clinic_id, 'payments.create')))
  );

create policy clinic_permission_document_templates_write on public.document_templates
  for all to authenticated using ((select private.has_clinic_permission(clinic_id, 'documents.manage_templates')))
  with check ((select private.has_clinic_permission(clinic_id, 'documents.manage_templates')));
create policy clinic_permission_patient_documents_insert on public.patient_documents
  for insert to authenticated with check (
    status = 'pending' and signed_at is null and signed_by is null
    and created_by = (select auth.uid())
    and (select private.has_clinic_permission(clinic_id, 'documents.create'))
    and (kind <> 'contract' or exists (
      select 1 from public.patient_diagnoses diagnosis
      where diagnosis.id = patient_documents.diagnosis_id
        and diagnosis.patient_id = patient_documents.patient_id
        and diagnosis.clinic_id = patient_documents.clinic_id
        and diagnosis.status = 'accepted'
    ))
  );
create policy clinic_permission_patient_diagnoses_write on public.patient_diagnoses
  for all to authenticated using ((select private.has_clinic_permission(clinic_id, 'clinical.edit')))
  with check (
    (select private.has_clinic_permission(clinic_id, 'clinical.create') or private.has_clinic_permission(clinic_id, 'clinical.edit'))
    and (status <> 'accepted' or accepted_by = (select auth.uid()))
  );
create policy clinic_permission_patient_activities_insert on public.patient_activities
  for insert to authenticated with check (author_id = (select auth.uid()) and (select private.has_clinic_permission(clinic_id, 'clinical.create')));
create policy clinic_permission_patient_encounters_insert on public.patient_encounters
  for insert to authenticated with check (created_by = (select auth.uid()) and (select private.has_clinic_permission(clinic_id, 'clinical.create')));
create policy clinic_permission_botox_records_insert on public.botox_treatment_records
  for insert to authenticated with check (created_by = (select auth.uid()) and (select private.has_clinic_permission(clinic_id, 'clinical.create')));
create policy clinic_permission_patient_document_files_insert on public.patient_document_files
  for insert to authenticated with check (
    uploaded_by = (select auth.uid())
    and storage_path like clinic_id::text || '/' || patient_id::text || '/%'
    and (select private.has_clinic_permission(clinic_id, 'clinical.create'))
  );

do $$
declare item record;
begin
  for item in select * from (values
    ('branches','team.manage_branches'),('businesses','team.manage_branches'),
    ('clinic_providers','team.manage_professionals'),('provider_branches','team.manage_professionals'),
    ('clinic_services','team.manage_professionals'),('clinic_service_branches','team.manage_professionals'),
    ('clinic_service_providers','team.manage_professionals'),('clinic_availability_settings','settings.manage'),
    ('public_agenda_hours','settings.manage'),('public_agenda_offers','settings.manage'),
    ('public_agenda_settings','settings.manage')
  ) as permissions(table_name, permission_key)
  loop
    execute format('create policy clinic_permission_%I_write on public.%I for all to authenticated using ((select private.has_clinic_permission(clinic_id, %L))) with check ((select private.has_clinic_permission(clinic_id, %L)))', item.table_name, item.table_name, item.permission_key, item.permission_key);
  end loop;
end
$$;

-- Payment and reminder RPCs predate per-user permissions and hard-coded role
-- allowlists. They now enforce clinic membership while RLS/actions handle writes.
create or replace function public.get_finance_patients(target_clinic_id uuid)
returns table(patient_id uuid, record_number text, full_name text, primary_branch_id uuid, primary_provider_id uuid)
language sql stable security definer set search_path = '' as $$
  select patient.id, patient.record_number, patient.full_name, patient.primary_branch_id, patient.primary_provider_id
  from public.patients patient where patient.clinic_id = target_clinic_id
    and (select private.has_clinic_access(target_clinic_id, null)) order by patient.full_name;
$$;
create or replace function public.get_finance_appointments(target_clinic_id uuid, from_at timestamptz, to_at timestamptz, appointment_ids uuid[] default '{}')
returns table(appointment_id uuid, patient_id uuid, business_id uuid, branch_id uuid, provider_id uuid, starts_at timestamptz, ends_at timestamptz, service text, modality text, status text, branch_name text, provider_name text, business_name text, deposit_required boolean, deposit_amount numeric(12, 2))
language sql stable security definer set search_path = '' as $$
  select appointment.id, appointment.patient_id, appointment.business_id, appointment.branch_id,
    appointment.provider_id, appointment.starts_at, appointment.ends_at, appointment.service,
    appointment.modality, appointment.status, branch.name, provider.name, business.name,
    appointment.deposit_required, appointment.deposit_amount
  from public.appointments appointment
  left join public.branches branch on branch.id = appointment.branch_id and branch.clinic_id = appointment.clinic_id
  left join public.clinic_providers provider on provider.id = appointment.provider_id and provider.clinic_id = appointment.clinic_id
  left join public.businesses business on business.id = appointment.business_id and business.clinic_id = appointment.clinic_id
  where appointment.clinic_id = target_clinic_id
    and ((appointment.starts_at >= from_at and appointment.starts_at < to_at) or appointment.id = any(appointment_ids))
    and (select private.has_clinic_access(target_clinic_id, null)) order by appointment.starts_at desc;
$$;
revoke all on function public.get_finance_patients(uuid) from public, anon;
grant execute on function public.get_finance_patients(uuid) to authenticated;
revoke all on function public.get_finance_appointments(uuid, timestamptz, timestamptz, uuid[]) from public, anon;
grant execute on function public.get_finance_appointments(uuid, timestamptz, timestamptz, uuid[]) to authenticated;

create or replace function public.get_appointment_reminders_v2(target_clinic_id uuid, window_start timestamptz default now(), window_end timestamptz default now() + interval '90 days')
returns table(id uuid, appointment_id uuid, kind text, scheduled_at timestamptz, status text, attempt_count integer, patient_name text, appointment_at timestamptz, service text, provider_name text, branch_name text, delivery_eligible boolean, delivery_block_reason text, simulated boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_clinic_access(target_clinic_id, null) then
    raise exception 'Clinic membership is required.' using errcode = '42501';
  end if;
  return query
    select reminder.id, reminder.appointment_id, reminder.kind, reminder.scheduled_at,
      reminder.status, reminder.attempt_count, patient.full_name, appointment.starts_at,
      appointment.service, provider.name, branch.name,
      (patient.appointment_whatsapp_opt_in and coalesce(trim(patient.phone), '') ~ '^\+[1-9][0-9]{7,14}$'),
      case when not patient.appointment_whatsapp_opt_in then 'Sin autorización de WhatsApp'
        when nullif(trim(patient.phone), '') is null then 'Falta teléfono'
        when coalesce(trim(patient.phone), '') !~ '^\+[1-9][0-9]{7,14}$' then 'Teléfono inválido: usa formato internacional'
        else null end,
      (coalesce(configuration.provider_mode, 'mock') = 'mock')
    from public.appointment_reminders reminder
    join public.appointments appointment on appointment.id = reminder.appointment_id and appointment.clinic_id = reminder.clinic_id and appointment.reminder_schedule_version = reminder.schedule_version
    join public.patients patient on patient.id = appointment.patient_id and patient.clinic_id = appointment.clinic_id
    join public.clinic_providers provider on provider.id = appointment.provider_id and provider.clinic_id = appointment.clinic_id
    join public.branches branch on branch.id = appointment.branch_id and branch.clinic_id = appointment.clinic_id
    left join public.clinic_whatsapp_configurations configuration on configuration.clinic_id = reminder.clinic_id
    where reminder.clinic_id = target_clinic_id and reminder.scheduled_at >= window_start and reminder.scheduled_at < window_end
    order by reminder.scheduled_at asc;
end;
$$;
revoke all on function public.get_appointment_reminders_v2(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_appointment_reminders_v2(uuid, timestamptz, timestamptz) to authenticated;

-- Keep sender routing behind the explicit WhatsApp management permission.
-- v4 calls this function, so its legacy administrator-only check must also be
-- updated or custom WhatsApp managers could open the tab but not save changes.
create or replace function public.save_clinic_whatsapp_settings_v2(
  target_clinic_id uuid,
  target_provider_mode text,
  target_allow_default_fallback boolean,
  target_template_readiness jsonb,
  target_senders jsonb
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  sender jsonb;
  sender_key_value text;
  display_label_value text;
  branch_list jsonb;
  requested_branches uuid[];
  requested_branch uuid;
  branch_count integer;
  is_default_sender boolean;
  active_sender boolean;
  sender_count integer := 0;
  default_count integer := 0;
begin
  if not private.has_clinic_permission(target_clinic_id, 'whatsapp.manage') then
    raise exception 'WhatsApp management permission is required.' using errcode = '42501';
  end if;
  if target_provider_mode not in ('mock', 'twilio') then
    raise exception 'Unsupported WhatsApp provider mode.' using errcode = '22023';
  end if;
  if target_senders is null or jsonb_typeof(target_senders) <> 'array' or jsonb_array_length(target_senders) > 50 then
    raise exception 'Invalid sender configuration.' using errcode = '22023';
  end if;
  if target_template_readiness is null or jsonb_typeof(target_template_readiness) <> 'object'
    or target_template_readiness - array['confirmation_2d','reminder_1d','reminder_5h'] <> '{}'::jsonb
    or not (target_template_readiness ?& array['confirmation_2d','reminder_1d','reminder_5h'])
    or exists (select 1 from jsonb_each(target_template_readiness) as item(key, value) where jsonb_typeof(item.value) <> 'boolean') then
    raise exception 'Invalid WhatsApp template readiness.' using errcode = '22023';
  end if;
  insert into public.clinic_whatsapp_configurations (clinic_id, provider_mode, allow_default_fallback, template_readiness, updated_at)
  values (target_clinic_id, target_provider_mode, coalesce(target_allow_default_fallback, false), target_template_readiness, now())
  on conflict (clinic_id) do update set provider_mode=excluded.provider_mode, allow_default_fallback=excluded.allow_default_fallback,
    template_readiness=excluded.template_readiness, updated_at=now();
  update public.clinic_whatsapp_senders set active=false, is_default=false, branch_id=null, updated_at=now() where clinic_id=target_clinic_id;
  delete from public.clinic_whatsapp_sender_branches where clinic_id=target_clinic_id;
  for sender in select value from jsonb_array_elements(target_senders) loop
    sender_count := sender_count + 1;
    if jsonb_typeof(sender) <> 'object' then raise exception 'Invalid WhatsApp sender.' using errcode='22023'; end if;
    sender_key_value := trim(coalesce(sender->>'sender_key',''));
    display_label_value := trim(coalesce(sender->>'display_label',''));
    branch_list := sender->'branch_ids';
    if branch_list is null then
      requested_branch := nullif(sender->>'branch_id','')::uuid;
      branch_list := case when requested_branch is null then '[]'::jsonb else jsonb_build_array(requested_branch::text) end;
    end if;
    if jsonb_typeof(branch_list) <> 'array' or jsonb_array_length(branch_list)>100 then raise exception 'Invalid WhatsApp sender branch list.' using errcode='22023'; end if;
    select coalesce(array_agg(item.value::uuid order by item.ordinality),array[]::uuid[]) into requested_branches
      from jsonb_array_elements_text(branch_list) with ordinality as item(value,ordinality);
    select count(distinct assigned.branch_id)::integer into branch_count from unnest(requested_branches) as assigned(branch_id);
    if cardinality(requested_branches)=0 or branch_count<>cardinality(requested_branches) then raise exception 'Select at least one distinct branch for each WhatsApp sender.' using errcode='22023'; end if;
    if exists (select 1 from unnest(requested_branches) as assigned(branch_id) left join public.branches branch
      on branch.id=assigned.branch_id and branch.clinic_id=target_clinic_id and branch.active where branch.id is null) then
      raise exception 'WhatsApp sender branches must be active branches in this clinic.' using errcode='22023';
    end if;
    requested_branch := requested_branches[1];
    is_default_sender := coalesce((sender->>'is_default')::boolean,false);
    active_sender := coalesce((sender->>'active')::boolean,true);
    if (target_provider_mode='mock' and sender_key_value !~ '^mock:[a-z0-9]+(-[a-z0-9]+)*$')
      or (target_provider_mode='twilio' and sender_key_value !~ '^twilio:\+[1-9][0-9]{7,14}$')
      or length(display_label_value) not between 1 and 120 then raise exception 'Sender does not match the selected WhatsApp provider.' using errcode='22023'; end if;
    if coalesce(sender->>'meta_phone_number_id','')<>'' then raise exception 'Meta sender IDs are not supported by this provider.' using errcode='22023'; end if;
    if is_default_sender then default_count := default_count+1; end if;
    insert into public.clinic_whatsapp_senders (clinic_id,branch_id,sender_key,display_label,is_default,active)
    values (target_clinic_id,case when active_sender then requested_branch else null end,sender_key_value,display_label_value,is_default_sender,active_sender)
    on conflict (clinic_id,sender_key) do update set branch_id=excluded.branch_id,display_label=excluded.display_label,
      is_default=excluded.is_default,active=excluded.active,updated_at=now();
    if active_sender then
      if exists (select 1 from public.clinic_whatsapp_sender_branches existing where existing.clinic_id=target_clinic_id
        and existing.branch_id=any(requested_branches) and existing.sender_key<>sender_key_value) then
        raise exception 'Each branch can be assigned to only one active WhatsApp sender.' using errcode='23505';
      end if;
      insert into public.clinic_whatsapp_sender_branches (clinic_id,sender_key,branch_id)
      select target_clinic_id,sender_key_value,assigned.branch_id from unnest(requested_branches) as assigned(branch_id);
    end if;
  end loop;
  if default_count>1 or (target_allow_default_fallback and default_count<>1) then raise exception 'Default fallback requires exactly one default WhatsApp sender.' using errcode='22023'; end if;
  if target_allow_default_fallback and not exists (select 1 from public.clinic_whatsapp_senders where clinic_id=target_clinic_id and is_default and active) then
    raise exception 'The default WhatsApp sender must be active.' using errcode='22023';
  end if;
  return true;
end;
$$;
revoke all on function public.save_clinic_whatsapp_settings_v2(uuid,text,boolean,jsonb,jsonb) from public,anon;
grant execute on function public.save_clinic_whatsapp_settings_v2(uuid,text,boolean,jsonb,jsonb) to authenticated;

create or replace function public.save_clinic_whatsapp_settings_v4(target_clinic_id uuid, target_provider_mode text, target_allow_default_fallback boolean, target_senders jsonb, target_notify_whatsapp_messages boolean, target_notify_whatsapp_confirmations boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_clinic_permission(target_clinic_id, 'whatsapp.manage') then
    raise exception 'WhatsApp management permission is required.' using errcode = '42501';
  end if;
  if not public.save_clinic_whatsapp_settings_v2(target_clinic_id, target_provider_mode, target_allow_default_fallback,
    '{"confirmation_2d":false,"reminder_1d":false,"reminder_5h":false}'::jsonb, target_senders) then return false; end if;
  update public.clinic_whatsapp_configurations set template_content_sids = '{}'::jsonb,
    notify_whatsapp_messages = coalesce(target_notify_whatsapp_messages, true),
    notify_whatsapp_confirmations = coalesce(target_notify_whatsapp_confirmations, true), updated_at = now()
  where clinic_id = target_clinic_id;
  return true;
end;
$$;
revoke all on function public.save_clinic_whatsapp_settings_v4(uuid, text, boolean, jsonb, boolean, boolean) from public, anon;
grant execute on function public.save_clinic_whatsapp_settings_v4(uuid, text, boolean, jsonb, boolean, boolean) to authenticated;

create or replace function public.save_clinic_service(target_clinic_id uuid, target_service_id uuid, target_code text, target_category text, target_name text, target_description text, target_duration_min integer, target_duration_max integer, target_offers jsonb, target_variants jsonb, target_notes text, target_source text, target_status text, target_active boolean, target_branch_ids uuid[], target_provider_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
  if not private.has_clinic_permission(target_clinic_id, 'team.manage_professionals') then
    raise exception 'Service catalog permission is required.' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(target_branch_ids, array[]::uuid[])) requested(id)
    where not exists (select 1 from public.branches branch where branch.id = requested.id and branch.clinic_id = target_clinic_id and branch.active))
  then raise exception 'Selecciona sucursales activas de esta clínica.' using errcode = '23514'; end if;
  if exists (select 1 from unnest(coalesce(target_provider_ids, array[]::uuid[])) requested(id)
    where not exists (select 1 from public.clinic_providers provider join public.provider_branches assignment
      on assignment.provider_id = provider.id and assignment.clinic_id = provider.clinic_id
      where provider.id = requested.id and provider.clinic_id = target_clinic_id and provider.active
        and assignment.branch_id = any(coalesce(target_branch_ids, array[]::uuid[]))))
  then raise exception 'Cada profesional debe estar activo y asignado a una de las sucursales del servicio.' using errcode = '23514'; end if;
  if target_service_id is null then
    insert into public.clinic_services(clinic_id, code, category, name, description, duration_min, duration_max, offers, variants, notes, source, status, active)
    values(target_clinic_id, target_code, target_category, target_name, target_description, target_duration_min, target_duration_max,
      target_offers, target_variants, target_notes, coalesce(target_source, 'Capturado por la clínica'), target_status, target_active)
    returning id into saved_id;
  else
    update public.clinic_services set code=target_code, category=target_category, name=target_name, description=target_description,
      duration_min=target_duration_min, duration_max=target_duration_max, offers=target_offers, variants=target_variants,
      notes=target_notes, source=coalesce(target_source, 'Capturado por la clínica'), status=target_status, active=target_active
    where id=target_service_id and clinic_id=target_clinic_id returning id into saved_id;
    if saved_id is null then raise exception 'El servicio ya no existe en esta clínica.' using errcode = 'P0002'; end if;
  end if;
  delete from public.clinic_service_branches where clinic_id=target_clinic_id and service_id=saved_id;
  insert into public.clinic_service_branches(clinic_id, service_id, branch_id)
    select target_clinic_id, saved_id, requested.id from (select distinct id from unnest(coalesce(target_branch_ids, array[]::uuid[])) requested(id)) requested;
  delete from public.clinic_service_providers where clinic_id=target_clinic_id and service_id=saved_id;
  insert into public.clinic_service_providers(clinic_id, service_id, provider_id)
    select target_clinic_id, saved_id, requested.id from (select distinct id from unnest(coalesce(target_provider_ids, array[]::uuid[])) requested(id)) requested;
  return saved_id;
end;
$$;
revoke all on function public.save_clinic_service(uuid,uuid,text,text,text,text,integer,integer,jsonb,jsonb,text,text,text,boolean,uuid[],uuid[]) from public, anon;
grant execute on function public.save_clinic_service(uuid,uuid,text,text,text,text,integer,integer,jsonb,jsonb,text,text,text,boolean,uuid[],uuid[]) to authenticated;

create or replace function public.prepare_patient_document(target_clinic_id uuid, target_patient_id uuid, target_template_id uuid, target_kind text, target_service text default null)
returns table(document_id uuid, document_title text, document_kind text, document_service text, document_template_version integer, document_content_snapshot text, document_status text, document_requested_at timestamptz, document_diagnosis_id uuid, document_created_by uuid)
language plpgsql security definer set search_path = '' as $$
declare
  patient_row public.patients%rowtype;
  template_row public.document_templates%rowtype;
  document_row public.patient_documents%rowtype;
  active_diagnosis_id uuid;
  service_value text;
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
  else service_value := null; active_diagnosis_id := null; end if;
  update public.patient_documents existing_document set status = 'replaced'
  where existing_document.clinic_id = target_clinic_id and existing_document.patient_id = target_patient_id
    and existing_document.kind = target_kind and existing_document.status = 'pending';
  insert into public.patient_documents(clinic_id, patient_id, template_id, diagnosis_id, kind, title, service,
    template_version, content_snapshot, status, requested_at, created_by)
  values(target_clinic_id, target_patient_id, template_row.id, active_diagnosis_id, target_kind,
    template_row.title, service_value, template_row.version, template_row.content, 'pending', requested_at_value, actor_id)
  returning * into document_row;
  return query select document_row.id, document_row.title, document_row.kind, document_row.service,
    document_row.template_version, document_row.content_snapshot, document_row.status,
    document_row.requested_at, document_row.diagnosis_id, document_row.created_by;
end;
$$;
revoke all on function public.prepare_patient_document(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.prepare_patient_document(uuid, uuid, uuid, text, text) to authenticated;

create or replace function public.accept_patient_diagnosis(target_clinic_id uuid, target_patient_id uuid, target_summary text)
returns table(diagnosis_id uuid, accepted_by uuid, superseded_diagnosis_count integer, replaced_contract_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  normalized_summary text := trim(coalesce(target_summary, ''));
  current_user_id uuid := (select auth.uid());
  changed_diagnosis_count integer := 0;
  changed_contract_count integer := 0;
begin
  if length(normalized_summary) = 0 or length(normalized_summary) > 4000 then raise exception 'Diagnosis summary must contain 1 to 4000 characters.' using errcode = '22023'; end if;
  if current_user_id is null or not private.has_clinic_permission(target_clinic_id, 'clinical.edit') then
    raise exception 'Clinical edit permission is required.' using errcode = '42501';
  end if;
  perform 1 from public.patients patient where patient.id = target_patient_id and patient.clinic_id = target_clinic_id for update;
  if not found then raise exception 'Patient does not exist in this clinic.' using errcode = '23503'; end if;
  update public.patient_diagnoses diagnosis set status = 'superseded'
    where diagnosis.clinic_id = target_clinic_id and diagnosis.patient_id = target_patient_id and diagnosis.status = 'accepted';
  get diagnostics changed_diagnosis_count = row_count;
  update public.patient_documents document set status = 'replaced'
    where document.clinic_id = target_clinic_id and document.patient_id = target_patient_id and document.kind = 'contract' and document.status = 'pending';
  get diagnostics changed_contract_count = row_count;
  return query insert into public.patient_diagnoses(clinic_id, patient_id, summary, status, accepted_at, accepted_by, created_by)
    values(target_clinic_id, target_patient_id, normalized_summary, 'accepted', now(), current_user_id, current_user_id)
    returning patient_diagnoses.id, patient_diagnoses.accepted_by, changed_diagnosis_count, changed_contract_count;
end;
$$;
revoke all on function public.accept_patient_diagnosis(uuid, uuid, text) from public, anon;
grant execute on function public.accept_patient_diagnosis(uuid, uuid, text) to authenticated;

create or replace function public.save_public_agenda(p_clinic uuid, p_settings jsonb, p_offers jsonb, p_hours jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare item jsonb; offer_id uuid;
begin
  if auth.uid() is null or not private.has_clinic_permission(p_clinic, 'settings.manage') then
    raise exception 'Public agenda settings permission is required.' using errcode = '42501';
  end if;
  if jsonb_array_length(p_offers)>100 or jsonb_array_length(p_hours)>300 then raise exception 'Demasiadas opciones u horarios.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('availability:'||p_clinic::text,0));
  insert into public.public_agenda_settings(clinic_id,slug,published,min_notice_minutes,max_days,buffer_minutes,require_email)
  values(p_clinic,p_settings->>'slug',coalesce((p_settings->>'published')::boolean,false),(p_settings->>'min_notice_minutes')::integer,
    (p_settings->>'max_days')::integer,(p_settings->>'buffer_minutes')::integer,coalesce((p_settings->>'require_email')::boolean,false))
  on conflict(clinic_id) do update set slug=excluded.slug,published=excluded.published,min_notice_minutes=excluded.min_notice_minutes,
    max_days=excluded.max_days,buffer_minutes=excluded.buffer_minutes,require_email=excluded.require_email;
  update public.public_agenda_offers set active=false where clinic_id=p_clinic;
  for item in select * from jsonb_array_elements(p_offers) loop
    offer_id:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
    if exists(select 1 from public.public_agenda_offers where id=offer_id and (clinic_id<>p_clinic or service_id<>(item->>'service_id')::uuid or branch_id<>(item->>'branch_id')::uuid or provider_id<>(item->>'provider_id')::uuid)) then raise exception 'La identidad de una opción guardada no puede cambiar; agrega una opción nueva.'; end if;
    select coalesce((select id from public.public_agenda_offers where clinic_id=p_clinic and service_id=(item->>'service_id')::uuid and branch_id=(item->>'branch_id')::uuid and provider_id=(item->>'provider_id')::uuid),offer_id) into offer_id;
    insert into public.public_agenda_offers(id,clinic_id,service_id,branch_id,provider_id,duration_minutes,deposit_amount,active)
    values(offer_id,p_clinic,(item->>'service_id')::uuid,(item->>'branch_id')::uuid,(item->>'provider_id')::uuid,(item->>'duration_minutes')::integer,(item->>'deposit_amount')::numeric,true)
    on conflict(id) do update set duration_minutes=excluded.duration_minutes,deposit_amount=excluded.deposit_amount,active=true;
    if not private.public_offer_valid(offer_id) then raise exception 'Revisa el servicio, sucursal y profesional de cada opción.'; end if;
  end loop;
  delete from public.public_agenda_hours where clinic_id=p_clinic;
  for item in select * from jsonb_array_elements(p_hours) loop
    insert into public.public_agenda_hours(clinic_id,branch_id,provider_id,day_of_week,on_date,closed,opens_minute,closes_minute)
    values(p_clinic,(item->>'branch_id')::uuid,(item->>'provider_id')::uuid,nullif(item->>'day_of_week','')::integer,
      nullif(item->>'on_date','')::date,coalesce((item->>'closed')::boolean,false),nullif(item->>'opens_minute','')::integer,nullif(item->>'closes_minute','')::integer);
  end loop;
  if exists(select 1 from public.public_agenda_hours h join public.public_agenda_hours e
    on e.clinic_id=h.clinic_id and e.branch_id=h.branch_id and e.provider_id=h.provider_id and e.id>h.id
    and e.day_of_week is not distinct from h.day_of_week and e.on_date is not distinct from h.on_date
    where h.clinic_id=p_clinic and (h.closed or e.closed or int4range(h.opens_minute,h.closes_minute,'[)') && int4range(e.opens_minute,e.closes_minute,'[)')))
  then raise exception 'Los horarios no pueden traslaparse ni combinar un cierre con una apertura en la misma fecha.'; end if;
  if (p_settings->>'published')::boolean and (not exists(select 1 from public.public_agenda_offers where clinic_id=p_clinic and active)
    or exists(select 1 from public.public_agenda_offers o where o.clinic_id=p_clinic and o.active and not exists(select 1 from public.public_agenda_hours h where h.clinic_id=o.clinic_id and h.branch_id=o.branch_id and h.provider_id=o.provider_id and not h.closed)))
  then raise exception 'Agrega opciones y horarios de atención antes de publicar.'; end if;
end;
$$;
revoke all on function public.save_public_agenda(uuid,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_public_agenda(uuid,jsonb,jsonb,jsonb) to authenticated;

create or replace function public.review_public_booking(p_request uuid, p_action text, p_patient uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.public_booking_requests; o public.public_agenda_offers; v_patient_id uuid; booked_id uuid; business_id uuid;
begin
  select * into r from public.public_booking_requests where id=p_request;
  if not found or auth.uid() is null then raise exception 'No tienes permiso para revisar esta solicitud.' using errcode='42501'; end if;
  if (p_action='approve' and not private.has_clinic_permission(r.clinic_id,'agenda.create'))
    or (p_action='reject' and not private.has_clinic_permission(r.clinic_id,'agenda.cancel')) then
    raise exception 'No tienes permiso para realizar esta acción de agenda.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('availability:'||r.clinic_id::text,0));
  select * into r from public.public_booking_requests where id=p_request for update;
  if r.status='approved' and p_action='approve' then return r.appointment_id; end if;
  if r.status<>'pending' then raise exception 'Esta solicitud ya fue revisada.'; end if;
  if p_action='reject' then update public.public_booking_requests set status='rejected',reviewed_at=now(),reviewed_by=auth.uid() where id=r.id; return null; end if;
  if p_action<>'approve' then raise exception 'Acción inválida.'; end if;
  select * into o from public.public_agenda_offers where id=r.offer_id;
  if not private.public_slot_open(o.id,r.starts_at,true) or r.duration_minutes<>o.duration_minutes or r.deposit_amount<>o.deposit_amount then
    raise exception 'El horario o la configuración cambió. Revisa la solicitud con el paciente antes de agendar.' using errcode='23P01';
  end if;
  v_patient_id:=p_patient;
  if v_patient_id is not null then
    if not exists(select 1 from public.patients where id=v_patient_id and clinic_id=r.clinic_id) then raise exception 'El expediente no pertenece a esta clínica.'; end if;
    if exists(select 1 from public.appointments a where a.clinic_id=r.clinic_id and a.patient_id=v_patient_id and a.status<>'cancelled' and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(r.starts_at,r.ends_at,'[)')) then raise exception 'El paciente ya tiene una cita en ese horario.' using errcode='23P01'; end if;
  else
    insert into public.patients(clinic_id,record_number,full_name,phone,email,service_summary,status,primary_branch_id,primary_provider_id)
    values(r.clinic_id,'WEB-'||replace(r.id::text,'-',''),r.full_name,r.phone,r.email,r.service_name,'new',o.branch_id,o.provider_id) returning id into v_patient_id;
  end if;
  select b.business_id into business_id from public.branches b where b.id=o.branch_id;
  insert into public.appointments(clinic_id,patient_id,business_id,branch_id,provider_id,starts_at,ends_at,service,service_id,service_ids,service_snapshot,status,deposit_required,deposit_amount,created_by)
  values(r.clinic_id,v_patient_id,business_id,o.branch_id,o.provider_id,r.starts_at,r.ends_at,r.service_name,o.service_id,array[o.service_id],jsonb_build_object('source','public_agenda','service',r.service_name,'durationMinutes',r.duration_minutes),'pending',true,r.deposit_amount,auth.uid()) returning id into booked_id;
  update public.public_booking_requests set status='approved',appointment_id=booked_id,reviewed_at=now(),reviewed_by=auth.uid() where id=r.id;
  return booked_id;
end;
$$;
revoke all on function public.review_public_booking(uuid,text,uuid) from public, anon;
grant execute on function public.review_public_booking(uuid,text,uuid) to authenticated;

-- Patient files are readable by every clinic member like the document records.
drop policy if exists patient_record_files_read on storage.objects;
create policy patient_record_files_read on storage.objects for select to authenticated
  using (bucket_id = 'patient-records' and (select private.has_clinic_access((storage.foldername(name))[1]::uuid, null)));
create policy patient_record_files_permission_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'patient-records'
    and (storage.foldername(name))[2] is not null
    and (select private.has_clinic_permission((storage.foldername(name))[1]::uuid, 'clinical.create')));

-- Only administrators may administer memberships; membership role and
-- permission changes can never modify an administrator account.
create or replace function private.prevent_clinic_admin_membership_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' and old.role = 'admin' then
    raise exception 'No se puede revocar el acceso de una cuenta administradora.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.role = 'admin'
     and (new.role is distinct from old.role or new.permissions is distinct from old.permissions) then
    raise exception 'Los permisos de una cuenta administradora no se pueden modificar.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
drop trigger if exists prevent_clinic_admin_membership_changes on public.clinic_memberships;
create trigger prevent_clinic_admin_membership_changes
before update or delete on public.clinic_memberships
for each row execute function private.prevent_clinic_admin_membership_changes();
