-- Clinic-scoped WhatsApp setup metadata for a simulated provider only.
-- No credentials, Meta connection, webhook registration, or message delivery.
create table public.clinic_whatsapp_configurations (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  provider_mode text not null default 'mock' check (provider_mode = 'mock'),
  waba_id text,
  allow_default_fallback boolean not null default false,
  template_readiness jsonb not null default '{"confirmation_2d":false,"reminder_1d":false,"reminder_5h":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_whatsapp_template_readiness_object check (jsonb_typeof(template_readiness) = 'object')
);

create table public.clinic_whatsapp_senders (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinic_whatsapp_configurations(clinic_id) on delete cascade,
  branch_id uuid,
  sender_key text not null check (sender_key ~ '^mock:[a-z0-9]+(-[a-z0-9]+)*$'),
  display_label text not null check (length(trim(display_label)) between 1 and 120),
  meta_phone_number_id text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, sender_key),
  foreign key (branch_id, clinic_id) references public.branches(id, clinic_id) on delete cascade,
  constraint clinic_whatsapp_mock_senders_no_meta_id check (meta_phone_number_id is null)
);

create unique index clinic_whatsapp_sender_branch_unique
  on public.clinic_whatsapp_senders (clinic_id, branch_id)
  where branch_id is not null;
create unique index clinic_whatsapp_sender_default_unique
  on public.clinic_whatsapp_senders (clinic_id)
  where is_default;
create index clinic_whatsapp_sender_meta_id_idx
  on public.clinic_whatsapp_senders (meta_phone_number_id)
  where meta_phone_number_id is not null;

alter table public.clinic_whatsapp_configurations enable row level security;
alter table public.clinic_whatsapp_senders enable row level security;
revoke all on public.clinic_whatsapp_configurations from anon, authenticated;
revoke all on public.clinic_whatsapp_senders from anon, authenticated;
grant select on public.clinic_whatsapp_configurations to authenticated;
grant select on public.clinic_whatsapp_senders to authenticated;
create policy clinic_whatsapp_settings_member_read on public.clinic_whatsapp_configurations
  for select to authenticated using ((select private.has_clinic_access(clinic_id)));
create policy clinic_whatsapp_senders_member_read on public.clinic_whatsapp_senders
  for select to authenticated using ((select private.has_clinic_access(clinic_id)));

create function public.save_clinic_whatsapp_settings(
  target_clinic_id uuid,
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
    raise exception 'Invalid simulated template readiness.' using errcode = '22023';
  end if;

  insert into public.clinic_whatsapp_configurations (
    clinic_id, provider_mode, allow_default_fallback, template_readiness, updated_at
  ) values (
    target_clinic_id, 'mock', coalesce(target_allow_default_fallback, false), target_template_readiness, now()
  ) on conflict (clinic_id) do update
    set provider_mode = 'mock',
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
      raise exception 'Invalid simulated sender.' using errcode = '22023';
    end if;
    sender_key_value := trim(coalesce(sender->>'sender_key', ''));
    display_label_value := trim(coalesce(sender->>'display_label', ''));
    requested_branch := nullif(sender->>'branch_id', '')::uuid;
    is_default_sender := coalesce((sender->>'is_default')::boolean, false);
    active_sender := coalesce((sender->>'active')::boolean, true);
    if sender_key_value !~ '^mock:[a-z0-9]+(-[a-z0-9]+)*$' or length(display_label_value) not between 1 and 120 then
      raise exception 'Sender keys must be simulated and labels must be between 1 and 120 characters.' using errcode = '22023';
    end if;
    if coalesce(sender->>'meta_phone_number_id', '') <> '' then
      raise exception 'Meta phone-number IDs are disabled in mock mode.' using errcode = '22023';
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
    raise exception 'Default fallback requires exactly one default simulated sender.' using errcode = '22023';
  end if;
  if target_allow_default_fallback and not exists (
    select 1 from public.clinic_whatsapp_senders where clinic_id = target_clinic_id and is_default and active
  ) then
    raise exception 'The default simulated sender must be active.' using errcode = '22023';
  end if;
  return true;
end;
$$;

revoke all on function public.save_clinic_whatsapp_settings(uuid, boolean, jsonb, jsonb) from public, anon;
grant execute on function public.save_clinic_whatsapp_settings(uuid, boolean, jsonb, jsonb) to authenticated;

-- Return tenant and branch routing metadata only to the server-side worker.
-- Separate sender IDs are exposed in the public RPC API only in a future live-mode migration.
create function public.get_claimed_reminder_for_dispatch_v2(target_reminder_id uuid)
returns table (
  phone text,
  patient_name text,
  appointment_at timestamptz,
  kind text,
  clinic_id uuid,
  branch_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Reminder dispatch is restricted to the server worker.' using errcode = '42501';
  end if;
  return query
    select trim(patient.phone), patient.full_name, appointment.starts_at, reminder.kind,
           reminder.clinic_id, appointment.branch_id
      from public.appointment_reminders as reminder
      join public.appointments as appointment
        on appointment.id = reminder.appointment_id
       and appointment.clinic_id = reminder.clinic_id
       and appointment.reminder_schedule_version = reminder.schedule_version
      join public.patients as patient
        on patient.id = appointment.patient_id
       and patient.clinic_id = appointment.clinic_id
     where reminder.id = target_reminder_id
       and reminder.status = 'sending'
       and reminder.scheduled_at <= now()
       and appointment.status = 'confirmed'
       and appointment.starts_at > now()
       and patient.appointment_whatsapp_opt_in
       and coalesce(trim(patient.phone), '') ~ '^\+[1-9][0-9]{7,14}$';
end;
$$;
revoke all on function public.get_claimed_reminder_for_dispatch_v2(uuid) from public, anon, authenticated;
grant execute on function public.get_claimed_reminder_for_dispatch_v2(uuid) to service_role;

create function public.get_claimed_appointment_confirmation_v2(target_request_id uuid)
returns table (
  phone text,
  patient_name text,
  appointment_at timestamptz,
  clinic_id uuid,
  branch_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Confirmation dispatch is restricted to the server worker.' using errcode = '42501';
  end if;
  return query
    select trim(p.phone), p.full_name, a.starts_at, r.clinic_id, a.branch_id
      from public.appointment_confirmation_requests r
      join public.appointments a on a.id = r.appointment_id and a.clinic_id = r.clinic_id
      join public.patients p on p.id = a.patient_id and p.clinic_id = a.clinic_id
     where r.id = target_request_id and r.status = 'sending' and r.scheduled_at <= now()
       and a.status = 'pending' and a.starts_at > now() and a.reminder_schedule_version = r.schedule_version
       and p.appointment_whatsapp_opt_in and coalesce(trim(p.phone), '') ~ '^\+[1-9][0-9]{7,14}$';
end;
$$;
revoke all on function public.get_claimed_appointment_confirmation_v2(uuid) from public, anon, authenticated;
grant execute on function public.get_claimed_appointment_confirmation_v2(uuid) to service_role;

-- Inbound confirmations are scoped by the phone-number mapping resolved from
-- the signed webhook metadata. A branch-specific sender cannot affect another
-- branch; the explicit clinic default may serve every branch in that clinic.
create function public.apply_appointment_confirmation_reply_v2(
  target_clinic_id uuid,
  target_branch_id uuid,
  target_context_message_id text,
  target_inbound_message_id text,
  target_from text,
  target_action text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.appointment_confirmation_requests%rowtype;
  appointment_row public.appointments%rowtype;
  patient_row public.patients%rowtype;
  reply_outcome text;
  matching_requests integer;
  inserted integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Webhook processing is restricted to the server worker.' using errcode = '42501';
  end if;
  if target_clinic_id is null or target_action not in ('confirm', 'cancel', 'reschedule')
    or nullif(target_inbound_message_id, '') is null then
    return 'ignored';
  end if;
  if exists (
    select 1 from public.appointment_confirmation_replies
     where provider_message_id = target_inbound_message_id
  ) then
    return 'duplicate';
  end if;

  if nullif(target_context_message_id, '') is not null then
    select r.* into request_row
      from public.appointment_confirmation_requests r
      join public.appointments a on a.id = r.appointment_id and a.clinic_id = r.clinic_id
     where r.provider_message_id = target_context_message_id
       and r.clinic_id = target_clinic_id
       and (target_branch_id is null or a.branch_id = target_branch_id)
       and r.status = 'sent'
       and a.reminder_schedule_version = r.schedule_version
     for update of r;
  else
    select count(*) into matching_requests
      from public.appointment_confirmation_requests r
      join public.appointments a on a.id = r.appointment_id and a.clinic_id = r.clinic_id
      join public.patients p on p.id = a.patient_id and p.clinic_id = a.clinic_id
     where r.clinic_id = target_clinic_id
       and (target_branch_id is null or a.branch_id = target_branch_id)
       and r.status = 'sent' and a.status = 'pending' and a.starts_at > now()
       and a.reminder_schedule_version = r.schedule_version
       and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
         = regexp_replace(coalesce(target_from, ''), '[^0-9]', '', 'g');
    if matching_requests <> 1 then return 'ignored'; end if;
    select r.* into request_row
      from public.appointment_confirmation_requests r
      join public.appointments a on a.id = r.appointment_id and a.clinic_id = r.clinic_id
      join public.patients p on p.id = a.patient_id and p.clinic_id = a.clinic_id
     where r.clinic_id = target_clinic_id
       and (target_branch_id is null or a.branch_id = target_branch_id)
       and r.status = 'sent' and a.status = 'pending' and a.starts_at > now()
       and a.reminder_schedule_version = r.schedule_version
       and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
         = regexp_replace(coalesce(target_from, ''), '[^0-9]', '', 'g')
     for update of r;
  end if;
  if not found then return 'ignored'; end if;

  select a.* into appointment_row from public.appointments a
   where a.id = request_row.appointment_id and a.clinic_id = target_clinic_id for update;
  select p.* into patient_row from public.patients p
   where p.id = appointment_row.patient_id and p.clinic_id = target_clinic_id;
  if appointment_row.status <> 'pending' or appointment_row.starts_at <= now()
    or (target_branch_id is not null and appointment_row.branch_id <> target_branch_id)
    or regexp_replace(coalesce(patient_row.phone, ''), '[^0-9]', '', 'g')
      <> regexp_replace(coalesce(target_from, ''), '[^0-9]', '', 'g') then
    return 'ignored';
  end if;

  reply_outcome := case target_action when 'confirm' then 'confirmed' when 'cancel' then 'cancelled' else 'staff_follow_up' end;
  insert into public.appointment_confirmation_replies(provider_message_id, context_message_id, action, outcome)
    values (target_inbound_message_id, coalesce(nullif(target_context_message_id, ''), request_row.provider_message_id), target_action, reply_outcome)
    on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return 'duplicate'; end if;

  if target_action = 'confirm' then
    if appointment_row.deposit_required and not exists (
      select 1 from public.payments pay
       where pay.appointment_id = appointment_row.id and pay.clinic_id = appointment_row.clinic_id
       group by pay.appointment_id
       having sum(case when pay.direction = 'income' then pay.amount else -pay.amount end) >= appointment_row.deposit_amount
    ) then
      update public.appointment_confirmation_replies set outcome = 'needs_staff'
       where provider_message_id = target_inbound_message_id;
      insert into public.patient_activities(clinic_id, patient_id, activity_type, note, author_id)
        values (appointment_row.clinic_id, appointment_row.patient_id, 'message',
          'La paciente respondió que confirma la cita, pero falta registrar el depósito requerido. Revisar manualmente.', null);
      return 'needs_staff';
    end if;
    update public.appointments set status = 'confirmed', updated_at = now()
     where id = appointment_row.id and clinic_id = target_clinic_id;
    return 'confirmed';
  elsif target_action = 'cancel' then
    update public.appointments set status = 'cancelled', updated_at = now()
     where id = appointment_row.id and clinic_id = target_clinic_id;
    return 'cancelled';
  end if;

  insert into public.patient_activities(clinic_id, patient_id, activity_type, note, author_id)
    values (appointment_row.clinic_id, appointment_row.patient_id, 'message',
      'La paciente solicitó reagendar su cita del ' || to_char(appointment_row.starts_at, 'YYYY-MM-DD HH24:MI') || '. Responder manualmente.', null);
  return 'staff_follow_up';
end;
$$;
revoke all on function public.apply_appointment_confirmation_reply_v2(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_appointment_confirmation_reply_v2(uuid, uuid, text, text, text, text) to service_role;

-- Keep the staff queue explicit about whether each recorded outcome came from
-- the mock provider. This endpoint still returns no patient contact details.
create function public.get_appointment_reminders_v2(
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
           (coalesce(reminder.provider_message_id, '') like 'mock:%'
             or coalesce(reminder.last_error, '') like 'Resultado simulado:%')
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
     where reminder.clinic_id = target_clinic_id
       and reminder.scheduled_at >= window_start and reminder.scheduled_at < window_end
     order by reminder.scheduled_at asc;
end;
$$;
revoke all on function public.get_appointment_reminders_v2(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_appointment_reminders_v2(uuid, timestamptz, timestamptz) to authenticated;
