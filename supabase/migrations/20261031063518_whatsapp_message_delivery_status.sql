alter table public.clinic_whatsapp_messages
  drop constraint if exists clinic_whatsapp_messages_delivery_status_check;

alter table public.clinic_whatsapp_messages
  add constraint clinic_whatsapp_messages_delivery_status_check
  check (delivery_status in ('received', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'undelivered', 'canceled', 'unknown')),
  add column delivery_error_code text,
  add column delivery_error_message text;

create table public.clinic_whatsapp_message_status_events (
  twilio_message_sid text primary key check (twilio_message_sid ~ '^(SM|MM)[0-9a-fA-F]{32}$'),
  delivery_status text not null check (delivery_status in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'undelivered', 'canceled', 'unknown')),
  delivery_error_code text,
  delivery_error_message text,
  updated_at timestamptz not null default now()
);

alter table public.clinic_whatsapp_message_status_events enable row level security;
revoke all on public.clinic_whatsapp_message_status_events from public, anon, authenticated;

drop function if exists public.apply_twilio_whatsapp_message_status(text, text, text, text);
create function public.apply_twilio_whatsapp_message_status(
  target_message_sid text,
  target_delivery_status text,
  target_error_code text default null,
  target_error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective_status text;
  effective_error_code text;
  effective_error_message text;
  message_updated boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WhatsApp delivery status updates are restricted to the server.' using errcode = '42501';
  end if;
  if target_message_sid !~ '^(SM|MM)[0-9a-fA-F]{32}$'
    or target_delivery_status not in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'undelivered', 'canceled', 'unknown') then
    raise exception 'Invalid WhatsApp delivery status.' using errcode = '22023';
  end if;

  insert into public.clinic_whatsapp_message_status_events as current_status (
    twilio_message_sid, delivery_status, delivery_error_code, delivery_error_message, updated_at
  ) values (
    target_message_sid, target_delivery_status, left(target_error_code, 64), left(target_error_message, 500), now()
  )
  on conflict (twilio_message_sid) do update set
    delivery_status = case
      when (case excluded.delivery_status
        when 'queued' then 1 when 'sending' then 2 when 'sent' then 3
        when 'failed' then 4 when 'undelivered' then 4 when 'canceled' then 4
        when 'delivered' then 5 when 'read' then 6 else 0 end)
        > (case current_status.delivery_status
        when 'queued' then 1 when 'sending' then 2 when 'sent' then 3
        when 'failed' then 4 when 'undelivered' then 4 when 'canceled' then 4
        when 'delivered' then 5 when 'read' then 6 else 0 end)
      then excluded.delivery_status else current_status.delivery_status end,
    delivery_error_code = coalesce(excluded.delivery_error_code, current_status.delivery_error_code),
    delivery_error_message = coalesce(excluded.delivery_error_message, current_status.delivery_error_message),
    updated_at = now()
  returning delivery_status, delivery_error_code, delivery_error_message
  into effective_status, effective_error_code, effective_error_message;

  update public.clinic_whatsapp_messages
     set delivery_status = effective_status,
         delivery_error_code = effective_error_code,
         delivery_error_message = effective_error_message
   where twilio_message_sid = target_message_sid
     and direction = 'outbound';
  message_updated := found;
  return message_updated;
end;
$$;

revoke all on function public.apply_twilio_whatsapp_message_status(text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_twilio_whatsapp_message_status(text, text, text, text) to service_role;
