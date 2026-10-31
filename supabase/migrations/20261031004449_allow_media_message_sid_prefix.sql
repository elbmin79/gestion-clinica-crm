alter table public.clinic_whatsapp_messages
  drop constraint clinic_whatsapp_messages_twilio_message_sid_check,
  add constraint clinic_whatsapp_messages_twilio_message_sid_check
    check (twilio_message_sid ~ '^(SM|MM)[0-9a-fA-F]{32}$');
