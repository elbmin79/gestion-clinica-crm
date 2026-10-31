-- Keep the WhatsApp settings focused on sender routing and internal CRM alerts.
alter table public.clinic_whatsapp_configurations
  add column notify_whatsapp_messages boolean not null default true,
  add column notify_whatsapp_confirmations boolean not null default true;

-- Disable the legacy template-driven appointment messages. Future automation
-- will be managed separately and must not reuse stale template selections.
update public.clinic_whatsapp_configurations
   set template_readiness = '{"confirmation_2d":false,"reminder_1d":false,"reminder_5h":false}'::jsonb,
       template_content_sids = '{}'::jsonb,
       updated_at = now();

alter table public.staff_notifications
  add column source_event_id text,
  add constraint staff_notifications_source_event_unique unique (clinic_id, user_id, source_event_id);

alter table public.staff_notifications drop constraint staff_notifications_kind_check;
alter table public.staff_notifications add constraint staff_notifications_kind_check
  check (kind in ('new_appointment','agenda_change','test','whatsapp_message','whatsapp_confirmation'));
alter table public.staff_notifications drop constraint staff_notifications_message_check;
alter table public.staff_notifications add constraint staff_notifications_message_check
  check (message in (
    'Nueva cita registrada',
    'Cita cancelada',
    'Horario o asignación de cita actualizado',
    'Prueba de notificaciones',
    'Nueva solicitud de cita',
    'Nuevo mensaje de WhatsApp',
    'Cita confirmada por WhatsApp'
  ));

create or replace function public.save_clinic_whatsapp_settings_v4(
  target_clinic_id uuid,
  target_provider_mode text,
  target_allow_default_fallback boolean,
  target_senders jsonb,
  target_notify_whatsapp_messages boolean,
  target_notify_whatsapp_confirmations boolean
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
  if not public.save_clinic_whatsapp_settings_v2(
    target_clinic_id,
    target_provider_mode,
    target_allow_default_fallback,
    '{"confirmation_2d":false,"reminder_1d":false,"reminder_5h":false}'::jsonb,
    target_senders
  ) then
    return false;
  end if;
  update public.clinic_whatsapp_configurations
     set template_content_sids = '{}'::jsonb,
         notify_whatsapp_messages = coalesce(target_notify_whatsapp_messages, true),
         notify_whatsapp_confirmations = coalesce(target_notify_whatsapp_confirmations, true),
         updated_at = now()
   where clinic_id = target_clinic_id;
  return true;
end;
$$;

revoke all on function public.save_clinic_whatsapp_settings_v4(uuid, text, boolean, jsonb, boolean, boolean) from public, anon;
grant execute on function public.save_clinic_whatsapp_settings_v4(uuid, text, boolean, jsonb, boolean, boolean) to authenticated;
