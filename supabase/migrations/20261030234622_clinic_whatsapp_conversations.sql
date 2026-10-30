create table public.clinic_whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  contact_phone text not null check (contact_phone ~ '^\\+[1-9][0-9]{7,14}$'),
  contact_name text,
  sender_phone text not null check (sender_phone ~ '^\\+[1-9][0-9]{7,14}$'),
  last_inbound_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, contact_phone),
  unique (id, clinic_id)
);

create table public.clinic_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  conversation_id uuid not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null check (length(body) between 1 and 4096),
  twilio_message_sid text not null unique check (twilio_message_sid ~ '^SM[0-9a-fA-F]{32}$'),
  delivery_status text not null default 'received' check (delivery_status in ('received', 'queued', 'sent', 'delivered', 'failed', 'undelivered', 'unknown')),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, clinic_id) references public.clinic_whatsapp_conversations(id, clinic_id) on delete cascade
);

create index clinic_whatsapp_conversations_recent_idx on public.clinic_whatsapp_conversations(clinic_id, last_message_at desc);
create index clinic_whatsapp_messages_history_idx on public.clinic_whatsapp_messages(conversation_id, created_at);

alter table public.clinic_whatsapp_conversations enable row level security;
alter table public.clinic_whatsapp_messages enable row level security;

create policy clinic_whatsapp_conversations_staff_read on public.clinic_whatsapp_conversations
  for select to authenticated using (private.has_clinic_access(clinic_id, array['admin','receptionist']));
create policy clinic_whatsapp_messages_staff_read on public.clinic_whatsapp_messages
  for select to authenticated using (private.has_clinic_access(clinic_id, array['admin','receptionist']));

grant select on public.clinic_whatsapp_conversations, public.clinic_whatsapp_messages to authenticated;
revoke all on public.clinic_whatsapp_conversations, public.clinic_whatsapp_messages from anon;

create function public.route_twilio_sandbox_whatsapp(target_phone text)
returns table (clinic_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select configuration.clinic_id
    from public.clinic_whatsapp_configurations configuration
   where configuration.provider_mode = 'twilio'
     and target_phone = '+14155238886'
     and (select count(*) from public.clinic_whatsapp_configurations active
           where active.provider_mode = 'twilio') = 1
   limit 1;
$$;
revoke all on function public.route_twilio_sandbox_whatsapp(text) from public, anon, authenticated;
grant execute on function public.route_twilio_sandbox_whatsapp(text) to service_role;
