-- Native devices use Expo push tokens, which have no Web Push endpoint keys.
-- Keep them separate from browser subscriptions and share the generic notice feed.
create table public.staff_native_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  user_id uuid not null,
  expo_push_token text not null unique check (expo_push_token ~ '^(Exponent|Expo)PushToken[[][A-Za-z0-9_-]{8,}[]]$'),
  platform text not null check (platform in ('ios','android')),
  created_at timestamptz not null default now(),
  foreign key (clinic_id,user_id) references public.clinic_memberships(clinic_id,user_id) on delete cascade
);
create index staff_native_push_owner on public.staff_native_push_subscriptions(user_id,clinic_id);
alter table public.staff_native_push_subscriptions enable row level security;
revoke all on public.staff_native_push_subscriptions from anon,authenticated;
grant all on public.staff_native_push_subscriptions to service_role;
create policy native_subscriptions_owner on public.staff_native_push_subscriptions to authenticated
  using (user_id=(select auth.uid()) and private.has_clinic_access(clinic_id));

create table private.staff_native_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.staff_notifications(id) on delete cascade,
  subscription_id uuid not null references public.staff_native_push_subscriptions(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','sending','sent','failed','skipped')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claim_token uuid,
  last_error text,
  unique (notification_id,subscription_id)
);
create index staff_native_push_due on private.staff_native_push_deliveries(available_at) where state in ('pending','sending');
alter table private.staff_native_push_deliveries enable row level security;
revoke all on private.staff_native_push_deliveries from public,anon,authenticated;
grant all on private.staff_native_push_deliveries to service_role;

create function private.enqueue_staff_native_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not coalesce((select p.push_enabled from public.staff_notification_preferences p where p.clinic_id=new.clinic_id and p.user_id=new.user_id),true) then
    return new;
  end if;
  insert into private.staff_native_push_deliveries(notification_id,subscription_id)
    select new.id,s.id from public.staff_native_push_subscriptions s
    where s.clinic_id=new.clinic_id and s.user_id=new.user_id
    on conflict(notification_id,subscription_id) do nothing;
  return new;
end $$;
revoke all on function private.enqueue_staff_native_push() from public,anon,authenticated;
create trigger staff_native_push_fanout after insert on public.staff_notifications
  for each row execute function private.enqueue_staff_native_push();

create function public.claim_staff_native_push(target_limit integer default 20)
returns table(delivery_id uuid,token uuid,subscription_id uuid,expo_push_token text,platform text,message text,clinic_id uuid,appointment_id uuid,booking_request_id uuid,kind text)
language plpgsql security definer set search_path='' as $$
begin
  update private.staff_native_push_deliveries set state='failed',last_error='Delivery attempts exhausted'
    where state='sending' and available_at<=now() and attempts>=3;
  return query
  with due as (
    select d.id from private.staff_native_push_deliveries d
    where d.state in ('pending','sending') and d.available_at<=now() and d.attempts<3
    order by d.available_at for update skip locked limit greatest(1,least(target_limit,50))
  ), claimed as (
    update private.staff_native_push_deliveries d set state='sending',attempts=d.attempts+1,claim_token=gen_random_uuid(),available_at=now()+interval '2 minutes'
    from due where d.id=due.id returning d.*
  )
  select c.id,c.claim_token,s.id,s.expo_push_token,s.platform,n.message,n.clinic_id,n.appointment_id,n.booking_request_id,n.kind
  from claimed c join public.staff_notifications n on n.id=c.notification_id
  join public.staff_native_push_subscriptions s on s.id=c.subscription_id;
end $$;
revoke all on function public.claim_staff_native_push(integer) from public,anon,authenticated;
grant execute on function public.claim_staff_native_push(integer) to service_role;

create function public.staff_native_push_is_eligible(target_id uuid,target_token uuid) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from private.staff_native_push_deliveries d
 join public.staff_notifications n on n.id=d.notification_id
 join public.clinic_memberships m on m.clinic_id=n.clinic_id and m.user_id=n.user_id
 join public.staff_native_push_subscriptions s on s.id=d.subscription_id and s.clinic_id=n.clinic_id and s.user_id=n.user_id
 left join public.staff_notification_preferences p on p.clinic_id=m.clinic_id and p.user_id=m.user_id
 where d.id=target_id and d.claim_token=target_token and d.state='sending' and d.available_at>now()
 and (m.role in ('admin','receptionist') or n.kind='test' or (m.role='clinician' and exists(select 1 from public.clinic_providers cp where cp.clinic_id=m.clinic_id and cp.user_id=m.user_id and cp.active)))
 and coalesce(p.push_enabled,true)
 and case n.kind when 'new_appointment' then coalesce(p.new_appointment,true) when 'agenda_change' then coalesce(p.agenda_change,true) else true end);
$$;
revoke all on function public.staff_native_push_is_eligible(uuid,uuid) from public,anon,authenticated;
grant execute on function public.staff_native_push_is_eligible(uuid,uuid) to service_role;

create function public.settle_staff_native_push(target_id uuid,target_token uuid,target_state text,target_error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if target_state not in ('sent','failed','skipped','pending') then raise exception 'Invalid delivery state'; end if;
 update private.staff_native_push_deliveries set state=case when target_state='pending' and attempts>=3 then 'failed' else target_state end,
   available_at=now()+interval '1 minute' * power(2,attempts),last_error=left(target_error,120),claim_token=null
 where id=target_id and claim_token=target_token and state='sending';
 return found;
end $$;
revoke all on function public.settle_staff_native_push(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.settle_staff_native_push(uuid,uuid,text,text) to service_role;

create function public.queue_staff_native_push_test(target_clinic uuid,target_user uuid,target_subscription uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare alert_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(target_user::text,0));
 if not exists(select 1 from public.staff_native_push_subscriptions where id=target_subscription and clinic_id=target_clinic and user_id=target_user) then raise exception 'Device not registered'; end if;
 if exists(select 1 from public.staff_notifications where clinic_id=target_clinic and user_id=target_user and kind='test' and created_at>now()-interval '1 minute') then raise exception 'Wait one minute before testing again'; end if;
 insert into public.staff_notifications(clinic_id,user_id,kind,message) values(target_clinic,target_user,'test','Prueba de notificaciones') returning id into alert_id;
 return alert_id;
end $$;
revoke all on function public.queue_staff_native_push_test(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.queue_staff_native_push_test(uuid,uuid,uuid) to service_role;
