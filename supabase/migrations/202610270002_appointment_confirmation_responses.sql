-- Two-way appointment confirmation requests. No outbound message is sent by
-- this migration; a separately configured service worker dispatches the queue.
create table public.appointment_confirmation_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null,
  schedule_version integer not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped','cancelled','unknown')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  sending_started_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, schedule_version),
  foreign key (appointment_id, clinic_id) references public.appointments(id, clinic_id) on delete cascade
);
create index appointment_confirmation_due_idx on public.appointment_confirmation_requests(scheduled_at) where status in ('pending','failed');
alter table public.appointment_confirmation_requests enable row level security;
revoke all on public.appointment_confirmation_requests from anon, authenticated;
grant select on public.appointment_confirmation_requests to authenticated;
create policy appointment_confirmation_staff_read on public.appointment_confirmation_requests
  for select to authenticated using ((select private.has_clinic_access(clinic_id, array['admin','receptionist'])));

create table public.appointment_confirmation_replies (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  context_message_id text not null,
  action text not null check (action in ('confirm','cancel','reschedule')),
  received_at timestamptz not null default now(),
  outcome text not null check (outcome in ('confirmed','cancelled','staff_follow_up','needs_staff','ignored'))
);
revoke all on public.appointment_confirmation_replies from public, anon, authenticated;
grant all on public.appointment_confirmation_requests, public.appointment_confirmation_replies to service_role;

create function public.claim_due_appointment_confirmations(target_limit integer default 20)
returns table(request_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Confirmation dispatch is restricted to the server worker.' using errcode='42501'; end if;
  update public.appointment_confirmation_requests r set status='unknown', sending_started_at=null,
    last_error='Worker stopped after claiming; provider delivery is uncertain.', updated_at=now()
   where r.status='sending' and (r.sending_started_at is null or r.sending_started_at < now()-interval '2 minutes');
  return query with due as (
    select r.id from public.appointment_confirmation_requests r
    join public.appointments a on a.id=r.appointment_id and a.clinic_id=r.clinic_id
    join public.patients p on p.id=a.patient_id and p.clinic_id=a.clinic_id
    where (r.status='pending' or (r.status='failed' and r.attempt_count<3 and r.updated_at<=now()-interval '15 minutes'))
      and r.scheduled_at<=now() and a.status='pending'
      and a.starts_at>now() and a.reminder_schedule_version=r.schedule_version
      and p.appointment_whatsapp_opt_in and coalesce(trim(p.phone),'') ~ '^\+[1-9][0-9]{7,14}$'
    order by r.scheduled_at
    limit least(greatest(coalesce(target_limit,20),1),50)
    for update of r skip locked
  ), claimed as (
    update public.appointment_confirmation_requests r set status='sending',attempt_count=r.attempt_count+1,
      sending_started_at=now(),last_error=null,updated_at=now() from due where r.id=due.id returning r.id
  ) select claimed.id from claimed;
end; $$;
revoke all on function public.claim_due_appointment_confirmations(integer) from public, anon, authenticated;
grant execute on function public.claim_due_appointment_confirmations(integer) to service_role;

create function public.get_claimed_appointment_confirmation(target_request_id uuid)
returns table(request_id uuid, phone text, patient_name text, appointment_at timestamptz, clinic_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Confirmation dispatch is restricted to the server worker.' using errcode='42501'; end if;
  return query select r.id, trim(p.phone), p.full_name, a.starts_at, a.clinic_id
    from public.appointment_confirmation_requests r
    join public.appointments a on a.id=r.appointment_id and a.clinic_id=r.clinic_id
    join public.patients p on p.id=a.patient_id and p.clinic_id=a.clinic_id
    where r.id=target_request_id and r.status='sending' and r.scheduled_at<=now()
      and a.status='pending' and a.starts_at>now() and a.reminder_schedule_version=r.schedule_version
      and p.appointment_whatsapp_opt_in and coalesce(trim(p.phone),'') ~ '^\+[1-9][0-9]{7,14}$';
end; $$;
revoke all on function public.get_claimed_appointment_confirmation(uuid) from public, anon, authenticated;
grant execute on function public.get_claimed_appointment_confirmation(uuid) to service_role;

create function public.settle_appointment_confirmation(target_request_id uuid, target_status text, target_message_id text default null, target_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Confirmation dispatch is restricted to the server worker.' using errcode='42501'; end if;
  if target_status not in ('sent','failed','unknown','skipped') then raise exception 'Invalid confirmation outcome.' using errcode='23514'; end if;
  update public.appointment_confirmation_requests set status=target_status,sending_started_at=null,
    provider_message_id=nullif(left(coalesce(target_message_id,''),255),''),last_error=nullif(left(coalesce(target_error,''),300),''),updated_at=now()
    where id=target_request_id and status='sending';
  get diagnostics changed=row_count; return changed=1;
end; $$;
revoke all on function public.settle_appointment_confirmation(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.settle_appointment_confirmation(uuid,text,text,text) to service_role;

create function public.apply_appointment_confirmation_reply(target_context_message_id text, target_inbound_message_id text, target_from text, target_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare request_row public.appointment_confirmation_requests%rowtype;
appointment_row public.appointments%rowtype;
patient_row public.patients%rowtype;
reply_outcome text;
matching_requests integer;
inserted integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Webhook processing is restricted to the server worker.' using errcode='42501'; end if;
  if target_action not in ('confirm','cancel','reschedule') or nullif(target_inbound_message_id,'') is null then return 'ignored'; end if;
  if exists(select 1 from public.appointment_confirmation_replies where provider_message_id=target_inbound_message_id) then return 'duplicate'; end if;
  if nullif(target_context_message_id,'') is not null then
    select r.* into request_row from public.appointment_confirmation_requests r
      where r.provider_message_id=target_context_message_id and r.status='sent'
        and exists(select 1 from public.appointments a where a.id=r.appointment_id and a.clinic_id=r.clinic_id and a.reminder_schedule_version=r.schedule_version)
      for update;
  else
    select count(*) into matching_requests from public.appointment_confirmation_requests r
      join public.appointments a on a.id=r.appointment_id and a.clinic_id=r.clinic_id
      join public.patients p on p.id=a.patient_id and p.clinic_id=a.clinic_id
      where r.status='sent' and a.status='pending' and a.starts_at>now() and a.reminder_schedule_version=r.schedule_version
        and regexp_replace(coalesce(p.phone,''),'[^0-9]','','g')=regexp_replace(coalesce(target_from,''),'[^0-9]','','g');
    if matching_requests <> 1 then return 'ignored'; end if;
    select r.* into request_row from public.appointment_confirmation_requests r
      join public.appointments a on a.id=r.appointment_id and a.clinic_id=r.clinic_id
      join public.patients p on p.id=a.patient_id and p.clinic_id=a.clinic_id
      where r.status='sent' and a.status='pending' and a.starts_at>now() and a.reminder_schedule_version=r.schedule_version
        and regexp_replace(coalesce(p.phone,''),'[^0-9]','','g')=regexp_replace(coalesce(target_from,''),'[^0-9]','','g') for update of r;
  end if;
  if not found then return 'ignored'; end if;
  select a.* into appointment_row from public.appointments a where a.id=request_row.appointment_id and a.clinic_id=request_row.clinic_id for update;
  select p.* into patient_row from public.patients p where p.id=appointment_row.patient_id and p.clinic_id=appointment_row.clinic_id;
  if appointment_row.status <> 'pending' or appointment_row.starts_at <= now()
     or regexp_replace(coalesce(patient_row.phone,''),'[^0-9]','','g') <> regexp_replace(coalesce(target_from,''),'[^0-9]','','g') then return 'ignored'; end if;
  reply_outcome := case target_action when 'confirm' then 'confirmed' when 'cancel' then 'cancelled' else 'staff_follow_up' end;
  insert into public.appointment_confirmation_replies(provider_message_id,context_message_id,action,outcome)
    values(target_inbound_message_id,coalesce(nullif(target_context_message_id,''),request_row.provider_message_id),target_action,reply_outcome) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return 'duplicate'; end if;
  if target_action='confirm' then
    if appointment_row.deposit_required and not exists (
      select 1 from public.payments pay where pay.appointment_id=appointment_row.id and pay.clinic_id=appointment_row.clinic_id
      group by pay.appointment_id having sum(case when pay.direction='income' then pay.amount else -pay.amount end) >= appointment_row.deposit_amount
    ) then
      update public.appointment_confirmation_replies set outcome='needs_staff' where provider_message_id=target_inbound_message_id;
      insert into public.patient_activities(clinic_id,patient_id,activity_type,note,author_id)
        values(appointment_row.clinic_id,appointment_row.patient_id,'message','La paciente respondió que confirma la cita, pero falta registrar el depósito requerido. Revisar manualmente.',null);
      return 'needs_staff';
    end if;
    update public.appointments set status='confirmed',updated_at=now() where id=appointment_row.id and clinic_id=appointment_row.clinic_id;
    return 'confirmed';
  elsif target_action='cancel' then
    update public.appointments set status='cancelled',updated_at=now() where id=appointment_row.id and clinic_id=appointment_row.clinic_id;
    return 'cancelled';
  end if;
  insert into public.patient_activities(clinic_id,patient_id,activity_type,note,author_id)
    values(appointment_row.clinic_id,appointment_row.patient_id,'message','La paciente solicitó reagendar su cita del '||to_char(appointment_row.starts_at,'YYYY-MM-DD HH24:MI')||'. Responder manualmente.',null);
  return 'staff_follow_up';
end; $$;
revoke all on function public.apply_appointment_confirmation_reply(text,text,text,text) from public, anon, authenticated;
grant execute on function public.apply_appointment_confirmation_reply(text,text,text,text) to service_role;

-- Keep 24-hour and 5-hour reminders on confirmed appointments. The 48-hour
-- request now belongs to the pending-appointment confirmation queue below.
create or replace function private.refresh_appointment_reminders()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  reminder_definition record;
  scheduled_time timestamptz;
begin
  if new.status <> 'confirmed' then
    update public.appointment_reminders set status='cancelled',updated_at=now()
      where clinic_id=new.clinic_id and appointment_id=new.id and schedule_version=new.reminder_schedule_version and status in ('pending','failed');
    return new;
  end if;
  update public.appointment_reminders set status='cancelled',updated_at=now()
    where clinic_id=new.clinic_id and appointment_id=new.id and schedule_version<>new.reminder_schedule_version and status in ('pending','failed');
  update public.appointment_reminders set status='cancelled',updated_at=now()
    where clinic_id=new.clinic_id and appointment_id=new.id and kind='confirmation_2d' and schedule_version=new.reminder_schedule_version and status in ('pending','failed');
  for reminder_definition in
    select definition.kind,definition.lead_time from (values
      ('reminder_1d'::text,interval '24 hours'),('reminder_5h'::text,interval '5 hours')
    ) as definition(kind,lead_time)
  loop
    scheduled_time := new.starts_at-reminder_definition.lead_time;
    insert into public.appointment_reminders(clinic_id,appointment_id,kind,scheduled_at,status,schedule_version)
      values(new.clinic_id,new.id,reminder_definition.kind,scheduled_time,
        case when scheduled_time>now() then 'pending' else 'skipped' end,new.reminder_schedule_version)
      on conflict(appointment_id,kind,schedule_version) do update set scheduled_at=excluded.scheduled_at,
        status=case when public.appointment_reminders.status in ('sent','unknown') then public.appointment_reminders.status else excluded.status end,
        attempt_count=case when public.appointment_reminders.status in ('sent','unknown') then public.appointment_reminders.attempt_count else 0 end,
        last_error=case when public.appointment_reminders.status in ('sent','unknown') then public.appointment_reminders.last_error else null end,
        updated_at=now();
  end loop;
  return new;
end; $$;
revoke all on function private.refresh_appointment_reminders() from public, anon, authenticated;

create function private.schedule_appointment_confirmation_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare due_at timestamptz;
begin
  update public.appointment_confirmation_requests set status='cancelled',updated_at=now()
    where clinic_id=new.clinic_id and appointment_id=new.id and schedule_version<>new.reminder_schedule_version and status in ('pending','failed');
  if new.status='pending' then
    due_at := greatest(new.starts_at-interval '48 hours', now());
    insert into public.appointment_confirmation_requests(clinic_id,appointment_id,schedule_version,scheduled_at,status)
      values(new.clinic_id,new.id,new.reminder_schedule_version,due_at,'pending')
      on conflict(appointment_id,schedule_version) do update set scheduled_at=excluded.scheduled_at,
        status=case when public.appointment_confirmation_requests.status in ('sent','unknown') then public.appointment_confirmation_requests.status else 'pending' end,
        updated_at=now();
  else
    update public.appointment_confirmation_requests set status='cancelled',updated_at=now()
      where clinic_id=new.clinic_id and appointment_id=new.id and status in ('pending','failed');
  end if;
  return new;
end; $$;
revoke all on function private.schedule_appointment_confirmation_request() from public, anon, authenticated;
create trigger appointments_schedule_confirmation_request after insert or update of status,starts_at on public.appointments
  for each row execute function private.schedule_appointment_confirmation_request();

-- Move any still-pending 48-hour notices off the legacy reminder queue so
-- they cannot be sent twice by the existing reminder worker.
update public.appointment_reminders
   set status='cancelled',last_error='Two-day confirmation moved to the confirmation queue.',updated_at=now()
 where kind='confirmation_2d' and status in ('pending','failed');

-- Existing appointments do not fire the new trigger at migration time.
-- Queue every future pending appointment, sending short-notice requests now.
insert into public.appointment_confirmation_requests(clinic_id,appointment_id,schedule_version,scheduled_at,status)
select a.clinic_id,a.id,a.reminder_schedule_version,greatest(a.starts_at-interval '48 hours',now()),'pending'
  from public.appointments a
 where a.status='pending' and a.starts_at>now()
on conflict(appointment_id,schedule_version) do nothing;
