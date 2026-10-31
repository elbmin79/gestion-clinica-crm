alter table public.clinic_whatsapp_conversations
  drop constraint clinic_whatsapp_conversations_contact_phone_check,
  add constraint clinic_whatsapp_conversations_contact_phone_check
    check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  drop constraint clinic_whatsapp_conversations_sender_phone_check,
  add constraint clinic_whatsapp_conversations_sender_phone_check
    check (sender_phone ~ '^\+[1-9][0-9]{7,14}$');
