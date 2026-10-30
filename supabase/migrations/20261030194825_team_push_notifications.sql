-- Staff alerts contain no patient names, services, contact details or clinical text.
create table public.staff_notification_preferences (
  clinic_id uuid not null,
  user_id uuid not null default auth.uid(),
  new_appointment boolean not null default true,
  agenda_change boolean not null default true,
  include_self boolean not null default false,
  push_enabled boolean not null default true,
  primary key (clinic_id,user_id),
  foreign key (clinic_id,user_id) references public.clinic_memberships(clinic_id,user_id) on delete cascade
);
create table public.staff_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  user_id uuid not null default auth.uid(),
  endpoint text not null check (length(endpoint) between 20 and 2048),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 16 and 100),
  created_at timestamptz not null default now(),
  unique (endpoint),
  foreign key (clinic_id,user_id) references public.clinic_memberships(clinic_id,user_id) on delete cascade
);
create table public.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  user_id uuid not null,
  appointment_id uuid references public.appointments(id) on delete cascade,
  kind text not null check (kind in ('new_appointment','agenda_change','test')),
  message text not null check (message in ('Nueva cita registrada','Cita cancelada','Horario o asignación de cita actualizado','Prueba de notificaciones')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  foreign key (clinic_id,user_id) references public.clinic_memberships(clinic_id,user_id) on delete cascade
);
create index staff_notifications_inbox on public.staff_notifications(user_id,clinic_id,created_at desc);
create table private.staff_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.staff_notifications(id) on delete cascade,
  subscription_id uuid not null references public.staff_push_subscriptions(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','sending','sent','failed','skipped')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claim_token uuid,
  last_error text,
  unique (notification_id,subscription_id)
);
create index staff_push_due on private.staff_push_deliveries(available_at) where state in ('pending','sending');
alter table public.staff_notification_preferences enable row level security;
alter table public.staff_push_subscriptions enable row level security;
alter table public.staff_notifications enable row level security;
alter table private.staff_push_deliveries enable row level security;
revoke all on public.staff_notification_preferences,public.staff_push_subscriptions,public.staff_notifications from anon,authenticated;
grant select,insert,update,delete on public.staff_notification_preferences to authenticated;
-- Subscriptions may only be written through the validated server route.
grant select,delete on public.staff_push_subscriptions to authenticated;
grant select,delete on public.staff_notifications to authenticated;
grant update (read_at) on public.staff_notifications to authenticated;
grant all on public.staff_notification_preferences,public.staff_push_subscriptions,public.staff_notifications,private.staff_push_deliveries to service_role;
create policy preferences_owner on public.staff_notification_preferences to authenticated
  using (user_id=(select auth.uid()) and private.has_clinic_access(clinic_id))
  with check (user_id=(select auth.uid()) and private.has_clinic_access(clinic_id));
create policy subscriptions_owner on public.staff_push_subscriptions to authenticated
  using (user_id=(select auth.uid()) and private.has_clinic_access(clinic_id));
create policy notifications_owner on public.staff_notifications to authenticated
  using (user_id=(select auth.uid()) and private.has_clinic_access(clinic_id));

-- Runs only from the appointment trigger. The definer is needed to fan out to
-- other members' inboxes; no public role can invoke this function directly.
create function private.capture_staff_appointment_alert() returns trigger
language plpgsql security definer set search_path='' as $$
declare alert_kind text; alert_message text; recipient record; alert_id uuid;
begin
  if TG_OP='INSERT' then
    alert_kind := 'new_appointment'; alert_message := 'Nueva cita registrada';
  elsif new.status='cancelled' and old.status is distinct from new.status then
    alert_kind := 'agenda_change'; alert_message := 'Cita cancelada';
  elsif row(new.starts_at,new.ends_at,new.provider_id,new.branch_id) is distinct from row(old.starts_at,old.ends_at,old.provider_id,old.branch_id) then
    alert_kind := 'agenda_change'; alert_message := 'Horario o asignación de cita actualizado';
  else return new;
  end if;
  for recipient in
    select m.user_id,coalesce(p.push_enabled,true) as push_enabled
    from public.clinic_memberships m
    left join public.staff_notification_preferences p on p.clinic_id=m.clinic_id and p.user_id=m.user_id
    where m.clinic_id=new.clinic_id
      and (m.user_id is distinct from auth.uid() or coalesce(p.include_self,false))
      and case when alert_kind='new_appointment' then coalesce(p.new_appointment,true) else coalesce(p.agenda_change,true) end
      and (m.role in ('admin','receptionist') or (m.role='clinician' and exists (
        select 1 from public.clinic_providers cp where cp.clinic_id=m.clinic_id and cp.user_id=m.user_id and cp.active
          and (cp.id=new.provider_id or (TG_OP='UPDATE' and cp.id=old.provider_id))
      )))
  loop
    insert into public.staff_notifications(clinic_id,user_id,appointment_id,kind,message)
      values(new.clinic_id,recipient.user_id,new.id,alert_kind,alert_message) returning id into alert_id;
    if recipient.push_enabled then
      insert into private.staff_push_deliveries(notification_id,subscription_id)
        select alert_id,s.id from public.staff_push_subscriptions s where s.clinic_id=new.clinic_id and s.user_id=recipient.user_id;
    end if;
  end loop;
  return new;
end $$;
revoke all on function private.capture_staff_appointment_alert() from public,anon,authenticated;
create trigger appointments_staff_alert after insert or update on public.appointments
  for each row execute function private.capture_staff_appointment_alert();

-- SKIP LOCKED and a lease prevent concurrent workers claiming the same delivery.
create function public.claim_staff_push(target_limit integer default 20)
returns table(delivery_id uuid,token uuid,subscription_id uuid,endpoint text,p256dh text,auth text,message text,clinic_id uuid,appointment_id uuid)
language plpgsql security definer set search_path='' as $$
begin
  -- Expired leases get at most three attempts. A crash can cause a repeated push;
  -- the stable notification tag replaces it on the receiving device.
  update private.staff_push_deliveries set state='failed',last_error='Delivery attempts exhausted'
    where state='sending' and available_at<=now() and attempts>=3;
  return query
  with due as (
    select d.id from private.staff_push_deliveries d
    where d.state in ('pending','sending') and d.available_at<=now() and d.attempts<3
    order by d.available_at for update skip locked limit greatest(1,least(target_limit,50))
  ), claimed as (
    update private.staff_push_deliveries d set state='sending',attempts=d.attempts+1,claim_token=gen_random_uuid(),available_at=now()+interval '2 minutes'
    from due where d.id=due.id returning d.*
  )
  select c.id,c.claim_token,s.id,s.endpoint,s.p256dh,s.auth,n.message,n.clinic_id,n.appointment_id
  from claimed c join public.staff_notifications n on n.id=c.notification_id
  join public.staff_push_subscriptions s on s.id=c.subscription_id;
end $$;
revoke all on function public.claim_staff_push(integer) from public,anon,authenticated;
grant execute on function public.claim_staff_push(integer) to service_role;

-- Recheck membership and preferences immediately before any provider call.
create function public.staff_push_is_eligible(target_id uuid,target_token uuid) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from private.staff_push_deliveries d
 join public.staff_notifications n on n.id=d.notification_id
 join public.clinic_memberships m on m.clinic_id=n.clinic_id and m.user_id=n.user_id
 join public.staff_push_subscriptions s on s.id=d.subscription_id and s.clinic_id=n.clinic_id and s.user_id=n.user_id
 left join public.staff_notification_preferences p on p.clinic_id=m.clinic_id and p.user_id=m.user_id
 where d.id=target_id and d.claim_token=target_token and d.state='sending' and d.available_at>now()
 and (m.role in ('admin','receptionist') or n.kind='test' or (m.role='clinician' and exists(select 1 from public.clinic_providers cp where cp.clinic_id=m.clinic_id and cp.user_id=m.user_id and cp.active)))
 and coalesce(p.push_enabled,true)
 and case n.kind when 'new_appointment' then coalesce(p.new_appointment,true) when 'agenda_change' then coalesce(p.agenda_change,true) else true end);
$$;
revoke all on function public.staff_push_is_eligible(uuid,uuid) from public,anon,authenticated;
grant execute on function public.staff_push_is_eligible(uuid,uuid) to service_role;
create function public.settle_staff_push(target_id uuid,target_token uuid,target_state text,target_error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if target_state not in ('sent','failed','skipped','pending') then raise exception 'Invalid delivery state'; end if;
 update private.staff_push_deliveries set state=case when target_state='pending' and attempts>=3 then 'failed' else target_state end,
   available_at=now()+interval '1 minute' * power(2,attempts),last_error=left(target_error,120),claim_token=null
 where id=target_id and claim_token=target_token and state='sending';
 return found;
end $$;
revoke all on function public.settle_staff_push(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.settle_staff_push(uuid,uuid,text,text) to service_role;

create function public.queue_staff_push_test(target_clinic uuid,target_user uuid,target_subscription uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare alert_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(target_user::text,0));
 if not exists(select 1 from public.staff_push_subscriptions where id=target_subscription and clinic_id=target_clinic and user_id=target_user) then raise exception 'Device not registered'; end if;
 if exists(select 1 from public.staff_notifications where clinic_id=target_clinic and user_id=target_user and kind='test' and created_at>now()-interval '1 minute') then raise exception 'Wait one minute before testing again'; end if;
 insert into public.staff_notifications(clinic_id,user_id,kind,message) values(target_clinic,target_user,'test','Prueba de notificaciones') returning id into alert_id;
 insert into private.staff_push_deliveries(notification_id,subscription_id) values(alert_id,target_subscription);
 return alert_id;
end $$;
revoke all on function public.queue_staff_push_test(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.queue_staff_push_test(uuid,uuid,uuid) to service_role;
