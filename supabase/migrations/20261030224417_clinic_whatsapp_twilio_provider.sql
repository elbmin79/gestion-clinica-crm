-- Enable Twilio as a clinic-scoped WhatsApp provider while keeping mock mode
-- available for local UI development. Account credentials remain server-only.
alter table public.clinic_whatsapp_configurations
  drop constraint clinic_whatsapp_configurations_provider_mode_check,
  add constraint clinic_whatsapp_configurations_provider_mode_check
    check (provider_mode in ('mock', 'twilio'));

alter table public.clinic_whatsapp_senders
  drop constraint clinic_whatsapp_senders_sender_key_check,
  add constraint clinic_whatsapp_senders_sender_key_check
    check (sender_key ~ '^mock:[a-z0-9]+(-[a-z0-9]+)*$' or sender_key ~ '^twilio:\+[1-9][0-9]{7,14}$'),
  drop constraint clinic_whatsapp_mock_senders_no_meta_id;

create function public.save_clinic_whatsapp_settings_v2(
  target_clinic_id uuid,
  target_provider_mode text,
  target_allow_default_fallback boolean,
  target_template_readiness jsonb,
  target_senders jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender jsonb;
  sender_key_value text;
  display_label_value text;
  requested_branch uuid;
  is_default_sender boolean;
  active_sender boolean;
  sender_count integer := 0;
  default_count integer := 0;
begin
  if not private.has_clinic_access(target_clinic_id, array['admin']) then
    raise exception 'Only clinic administrators can update WhatsApp settings.' using errcode = '42501';
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
    or exists (
      select 1 from jsonb_each(target_template_readiness) as item(key, value)
      where jsonb_typeof(item.value) <> 'boolean'
    ) then
    raise exception 'Invalid WhatsApp template readiness.' using errcode = '22023';
  end if;

  insert into public.clinic_whatsapp_configurations (
    clinic_id, provider_mode, allow_default_fallback, template_readiness, updated_at
  ) values (
    target_clinic_id, target_provider_mode, coalesce(target_allow_default_fallback, false), target_template_readiness, now()
  ) on conflict (clinic_id) do update
    set provider_mode = excluded.provider_mode,
        allow_default_fallback = excluded.allow_default_fallback,
        template_readiness = excluded.template_readiness,
        updated_at = now();

  update public.clinic_whatsapp_senders
     set active = false, is_default = false, branch_id = null, updated_at = now()
   where clinic_id = target_clinic_id;
  for sender in select value from jsonb_array_elements(target_senders)
  loop
    sender_count := sender_count + 1;
    if jsonb_typeof(sender) <> 'object' then
      raise exception 'Invalid WhatsApp sender.' using errcode = '22023';
    end if;
    sender_key_value := trim(coalesce(sender->>'sender_key', ''));
    display_label_value := trim(coalesce(sender->>'display_label', ''));
    requested_branch := nullif(sender->>'branch_id', '')::uuid;
    is_default_sender := coalesce((sender->>'is_default')::boolean, false);
    active_sender := coalesce((sender->>'active')::boolean, true);
    if (target_provider_mode = 'mock' and sender_key_value !~ '^mock:[a-z0-9]+(-[a-z0-9]+)*$')
      or (target_provider_mode = 'twilio' and sender_key_value !~ '^twilio:\+[1-9][0-9]{7,14}$')
      or length(display_label_value) not between 1 and 120 then
      raise exception 'Sender does not match the selected WhatsApp provider.' using errcode = '22023';
    end if;
    if coalesce(sender->>'meta_phone_number_id', '') <> '' then
      raise exception 'Meta sender IDs are not supported by this provider.' using errcode = '22023';
    end if;
    if is_default_sender then default_count := default_count + 1; end if;
    insert into public.clinic_whatsapp_senders (
      clinic_id, branch_id, sender_key, display_label, is_default, active
    ) values (
      target_clinic_id, requested_branch, sender_key_value, display_label_value, is_default_sender, active_sender
    ) on conflict (clinic_id, sender_key) do update
      set branch_id = excluded.branch_id,
          display_label = excluded.display_label,
          is_default = excluded.is_default,
          active = excluded.active,
          updated_at = now();
  end loop;
  if default_count > 1 or (target_allow_default_fallback and default_count <> 1) then
    raise exception 'Default fallback requires exactly one default WhatsApp sender.' using errcode = '22023';
  end if;
  if target_allow_default_fallback and not exists (
    select 1 from public.clinic_whatsapp_senders where clinic_id = target_clinic_id and is_default and active
  ) then
    raise exception 'The default WhatsApp sender must be active.' using errcode = '22023';
  end if;
  return true;
end;
$$;

revoke all on function public.save_clinic_whatsapp_settings_v2(uuid, text, boolean, jsonb, jsonb) from public, anon;
grant execute on function public.save_clinic_whatsapp_settings_v2(uuid, text, boolean, jsonb, jsonb) to authenticated;

create or replace function public.get_appointment_reminders_v2(
  target_clinic_id uuid,
  window_start timestamptz default now(),
  window_end timestamptz default now() + interval '90 days'
)
returns table (
  id uuid,
  appointment_id uuid,
  kind text,
  scheduled_at timestamptz,
  status text,
  attempt_count integer,
  patient_name text,
  appointment_at timestamptz,
  service text,
  provider_name text,
  branch_name text,
  delivery_eligible boolean,
  delivery_block_reason text,
  simulated boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_clinic_access(target_clinic_id, array['admin', 'receptionist']) then
    raise exception 'Appointment reminder access is not enabled for this role.' using errcode = '42501';
  end if;
  return query
    select reminder.id, reminder.appointment_id, reminder.kind, reminder.scheduled_at,
           reminder.status, reminder.attempt_count, patient.full_name, appointment.starts_at,
           appointment.service, provider.name, branch.name,
           (patient.appointment_whatsapp_opt_in and coalesce(trim(patient.phone), '') ~ '^\+[1-9][0-9]{7,14}$'),
           case
             when not patient.appointment_whatsapp_opt_in then 'Sin autorización de WhatsApp'
             when nullif(trim(patient.phone), '') is null then 'Falta teléfono'
             when coalesce(trim(patient.phone), '') !~ '^\+[1-9][0-9]{7,14}$' then 'Teléfono inválido: usa formato internacional'
             else null
           end,
           (coalesce(configuration.provider_mode, 'mock') = 'mock')
      from public.appointment_reminders reminder
      join public.appointments appointment
        on appointment.id = reminder.appointment_id
       and appointment.clinic_id = reminder.clinic_id
       and appointment.reminder_schedule_version = reminder.schedule_version
      join public.patients patient
        on patient.id = appointment.patient_id and patient.clinic_id = appointment.clinic_id
      join public.clinic_providers provider
        on provider.id = appointment.provider_id and provider.clinic_id = appointment.clinic_id
      join public.branches branch
        on branch.id = appointment.branch_id and branch.clinic_id = appointment.clinic_id
      left join public.clinic_whatsapp_configurations configuration
        on configuration.clinic_id = reminder.clinic_id
     where reminder.clinic_id = target_clinic_id
       and reminder.scheduled_at >= window_start and reminder.scheduled_at < window_end
     order by reminder.scheduled_at asc;
end;
$$;
revoke all on function public.get_appointment_reminders_v2(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_appointment_reminders_v2(uuid, timestamptz, timestamptz) to authenticated;
