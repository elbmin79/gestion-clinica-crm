-- Keep appointment template identifiers in clinic configuration. Twilio
-- credentials remain server-side; administrators select from approved items.
alter table public.clinic_whatsapp_configurations
  add column template_content_sids jsonb not null default '{}'::jsonb,
  add constraint clinic_whatsapp_template_content_sids_object
    check (jsonb_typeof(template_content_sids) = 'object');

create function public.save_clinic_whatsapp_settings_v3(
  target_clinic_id uuid,
  target_provider_mode text,
  target_allow_default_fallback boolean,
  target_template_readiness jsonb,
  target_senders jsonb,
  target_template_content_sids jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_clinic_access(target_clinic_id, array['admin']) then
    raise exception 'Only clinic administrators can update WhatsApp settings.' using errcode = '42501';
  end if;
  if target_template_content_sids is null
    or jsonb_typeof(target_template_content_sids) <> 'object'
    or target_template_content_sids - array['confirmation_2d','reminder_1d','reminder_5h'] <> '{}'::jsonb
    or exists (
      select 1 from jsonb_each(target_template_content_sids) as item(key, value)
      where jsonb_typeof(item.value) is distinct from 'string'
        or (trim(item.value #>> '{}') <> '' and item.value #>> '{}' !~ '^HX[0-9a-fA-F]{32}$')
    ) then
    raise exception 'Invalid WhatsApp template selection.' using errcode = '22023';
  end if;
  if not public.save_clinic_whatsapp_settings_v2(
    target_clinic_id,
    target_provider_mode,
    target_allow_default_fallback,
    target_template_readiness,
    target_senders
  ) then
    return false;
  end if;
  if exists (
    select 1 from jsonb_each(target_template_readiness) as item(key, value)
    where item.value = 'true'::jsonb
      and coalesce(nullif(target_template_content_sids ->> item.key, ''), '') !~ '^HX[0-9a-fA-F]{32}$'
  ) then
    raise exception 'An enabled WhatsApp notice must have a selected template.' using errcode = '22023';
  end if;
  update public.clinic_whatsapp_configurations
     set template_content_sids = target_template_content_sids,
         updated_at = now()
   where clinic_id = target_clinic_id;
  return true;
end;
$$;

revoke all on function public.save_clinic_whatsapp_settings_v3(uuid, text, boolean, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_clinic_whatsapp_settings_v3(uuid, text, boolean, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.claim_due_appointment_reminders(target_limit integer default 20)
returns table (reminder_id uuid, kind text, patient_name text, appointment_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Reminder dispatch is restricted to the server worker.' using errcode = '42501';
  end if;

  update public.appointment_reminders as reminder
     set status = 'unknown', sending_started_at = null,
         last_error = 'Worker stopped after claiming; provider delivery is uncertain.', updated_at = now()
   where reminder.status = 'sending'
     and (reminder.sending_started_at is null or reminder.sending_started_at < now() - interval '2 minutes');

  update public.appointment_reminders as reminder
     set status = case when appointment.status = 'confirmed'
                       and appointment.reminder_schedule_version = reminder.schedule_version
                       then 'skipped' else 'cancelled' end,
         last_error = case
           when appointment.status <> 'confirmed' then 'Appointment is no longer confirmed.'
           when appointment.reminder_schedule_version <> reminder.schedule_version then 'Appointment schedule changed.'
           when appointment.starts_at <= now() then 'Appointment has already started.'
           when not patient.appointment_whatsapp_opt_in then 'Patient has not authorized WhatsApp appointment messages.'
           else 'Patient phone number is missing or not in international E.164 format.' end,
         updated_at = now()
    from public.appointments as appointment
    join public.patients as patient on patient.id = appointment.patient_id and patient.clinic_id = appointment.clinic_id
   where reminder.appointment_id = appointment.id and reminder.clinic_id = appointment.clinic_id
     and reminder.status in ('pending', 'failed') and reminder.scheduled_at <= now()
     and (appointment.status <> 'confirmed'
       or appointment.reminder_schedule_version <> reminder.schedule_version
       or appointment.starts_at <= now()
       or not patient.appointment_whatsapp_opt_in
       or coalesce(trim(patient.phone), '') !~ '^\+[1-9][0-9]{7,14}$');

  return query
    with due as (
      select reminder.id
        from public.appointment_reminders as reminder
        join public.appointments as appointment on appointment.id = reminder.appointment_id
          and appointment.clinic_id = reminder.clinic_id and appointment.reminder_schedule_version = reminder.schedule_version
        join public.patients as patient on patient.id = appointment.patient_id and patient.clinic_id = appointment.clinic_id
       where (reminder.status = 'pending' or (reminder.status = 'failed' and reminder.attempt_count < 3
          and reminder.updated_at <= now() - interval '15 minutes'))
         and reminder.scheduled_at <= now() and appointment.status = 'confirmed' and appointment.starts_at > now()
         and patient.appointment_whatsapp_opt_in and coalesce(trim(patient.phone), '') ~ '^\+[1-9][0-9]{7,14}$'
         and exists (
           select 1 from public.clinic_whatsapp_configurations as config
            where config.clinic_id = appointment.clinic_id and config.provider_mode = 'twilio'
              and config.template_readiness ->> reminder.kind = 'true'
              and coalesce(config.template_content_sids ->> reminder.kind, '') ~ '^HX[0-9a-fA-F]{32}$'
         )
         and exists (
           select 1 from public.clinic_whatsapp_senders as sender
            where sender.clinic_id = appointment.clinic_id and sender.active
              and sender.sender_key ~ '^twilio:\+[1-9][0-9]{7,14}$'
              and (sender.branch_id = appointment.branch_id or exists (
                select 1 from public.clinic_whatsapp_sender_branches as assignment
                 where assignment.clinic_id = appointment.clinic_id and assignment.sender_key = sender.sender_key
                   and assignment.branch_id = appointment.branch_id
              ))
         )
       order by reminder.scheduled_at, reminder.id
       limit greatest(1, least(coalesce(target_limit, 20), 50))
       for update of reminder skip locked
    ), claimed as (
      update public.appointment_reminders as reminder
         set status = 'sending', attempt_count = reminder.attempt_count + 1,
             sending_started_at = now(), last_error = null, updated_at = now()
        from due where reminder.id = due.id
       returning reminder.id, reminder.kind, reminder.appointment_id, reminder.clinic_id, reminder.schedule_version
    )
    select claimed.id, claimed.kind, patient.full_name, appointment.starts_at
      from claimed
      join public.appointments as appointment on appointment.id = claimed.appointment_id and appointment.clinic_id = claimed.clinic_id
      join public.patients as patient on patient.id = appointment.patient_id and patient.clinic_id = appointment.clinic_id;
end;
$$;
revoke all on function public.claim_due_appointment_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_appointment_reminders(integer) to service_role;

create or replace function public.claim_due_appointment_confirmations(target_limit integer default 20)
returns table(request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Confirmation dispatch is restricted to the server worker.' using errcode = '42501';
  end if;
  update public.appointment_confirmation_requests as request
     set status = 'unknown', sending_started_at = null,
         last_error = 'Worker stopped after claiming; provider delivery is uncertain.', updated_at = now()
   where request.status = 'sending'
     and (request.sending_started_at is null or request.sending_started_at < now() - interval '2 minutes');

  return query
    with due as (
      select request.id
        from public.appointment_confirmation_requests as request
        join public.appointments as appointment on appointment.id = request.appointment_id and appointment.clinic_id = request.clinic_id
        join public.patients as patient on patient.id = appointment.patient_id and patient.clinic_id = appointment.clinic_id
       where (request.status = 'pending' or (request.status = 'failed' and request.attempt_count < 3
           and request.updated_at <= now() - interval '15 minutes'))
         and request.scheduled_at <= now() and appointment.status = 'pending' and appointment.starts_at > now()
         and appointment.reminder_schedule_version = request.schedule_version
         and patient.appointment_whatsapp_opt_in and coalesce(trim(patient.phone), '') ~ '^\+[1-9][0-9]{7,14}$'
         and exists (
           select 1 from public.clinic_whatsapp_configurations as config
            where config.clinic_id = appointment.clinic_id and config.provider_mode = 'twilio'
              and config.template_readiness ->> 'confirmation_2d' = 'true'
              and coalesce(config.template_content_sids ->> 'confirmation_2d', '') ~ '^HX[0-9a-fA-F]{32}$'
         )
         and exists (
           select 1 from public.clinic_whatsapp_senders as sender
            where sender.clinic_id = appointment.clinic_id and sender.active
              and sender.sender_key ~ '^twilio:\+[1-9][0-9]{7,14}$'
              and (sender.branch_id = appointment.branch_id or exists (
                select 1 from public.clinic_whatsapp_sender_branches as assignment
                 where assignment.clinic_id = appointment.clinic_id and assignment.sender_key = sender.sender_key
                   and assignment.branch_id = appointment.branch_id
              ))
         )
       order by request.scheduled_at
       limit least(greatest(coalesce(target_limit, 20), 1), 50)
       for update of request skip locked
    ), claimed as (
      update public.appointment_confirmation_requests as request
         set status = 'sending', attempt_count = request.attempt_count + 1,
             sending_started_at = now(), last_error = null, updated_at = now()
        from due where request.id = due.id
       returning request.id
    )
    select claimed.id from claimed;
end;
$$;
revoke all on function public.claim_due_appointment_confirmations(integer) from public, anon, authenticated;
grant execute on function public.claim_due_appointment_confirmations(integer) to service_role;
