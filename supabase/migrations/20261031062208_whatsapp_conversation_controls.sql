alter table public.clinic_whatsapp_conversations
  add column blocked_at timestamptz;

create index clinic_whatsapp_conversations_blocked_idx
  on public.clinic_whatsapp_conversations (clinic_id, blocked_at)
  where blocked_at is not null;
