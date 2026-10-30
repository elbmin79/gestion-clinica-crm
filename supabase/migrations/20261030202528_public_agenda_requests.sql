-- Public reads/writes go through server-only, narrowly scoped functions.
create table public.public_agenda_settings (
 clinic_id uuid primary key references public.clinics(id) on delete cascade,
 slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
 published boolean not null default false,
 min_notice_minutes integer not null default 1440 check(min_notice_minutes between 0 and 43200),
 max_days integer not null default 90 check(max_days between 1 and 365),
 buffer_minutes integer not null default 0 check(buffer_minutes between 0 and 120),
 require_email boolean not null default false
);
create table public.public_agenda_offers (
 id uuid primary key default gen_random_uuid(),clinic_id uuid not null references public.clinics(id) on delete cascade,
 service_id uuid not null,branch_id uuid not null,provider_id uuid not null,
 duration_minutes integer not null check(duration_minutes between 15 and 720 and duration_minutes%15=0),
 deposit_amount numeric(12,2) not null check(deposit_amount>0),active boolean not null default true,
 unique(id,clinic_id),unique(clinic_id,service_id,branch_id,provider_id),
 foreign key(service_id,clinic_id) references public.clinic_services(id,clinic_id),
 foreign key(branch_id,clinic_id) references public.branches(id,clinic_id),
 foreign key(provider_id,clinic_id) references public.clinic_providers(id,clinic_id)
);
create table public.public_agenda_hours (
 id uuid primary key default gen_random_uuid(),clinic_id uuid not null references public.clinics(id) on delete cascade,
 branch_id uuid not null,provider_id uuid not null,
 day_of_week integer check(day_of_week between 0 and 6),on_date date,
 closed boolean not null default false,opens_minute integer,closes_minute integer,
 check((day_of_week is null)<>(on_date is null)),
 check((closed and on_date is not null and opens_minute is null and closes_minute is null)
   or (not closed and opens_minute is not null and closes_minute is not null and opens_minute>=360 and closes_minute<=1440 and closes_minute>opens_minute and opens_minute%15=0 and closes_minute%15=0)),
 foreign key(branch_id,clinic_id) references public.branches(id,clinic_id),
 foreign key(provider_id,clinic_id) references public.clinic_providers(id,clinic_id)
);
create index public_agenda_hours_lookup on public.public_agenda_hours(clinic_id,provider_id,branch_id,day_of_week,on_date);
create table public.public_booking_requests (
 id uuid primary key default gen_random_uuid(),clinic_id uuid not null references public.clinics(id) on delete cascade,
 offer_id uuid not null,nonce uuid not null unique,fingerprint text not null check(length(fingerprint)=64),
 full_name text not null check(length(trim(full_name)) between 2 and 160),
 phone text not null check(phone ~ '^\+[1-9][0-9]{7,14}$'),email text check(email is null or (length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 contact_consent boolean not null check(contact_consent),
 starts_at timestamptz not null,ends_at timestamptz not null,
 duration_minutes integer not null,deposit_amount numeric(12,2) not null,service_name text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 appointment_id uuid unique references public.appointments(id),
 created_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by uuid references auth.users(id),
 foreign key(offer_id,clinic_id) references public.public_agenda_offers(id,clinic_id)
);
create index public_booking_request_inbox on public.public_booking_requests(clinic_id,status,created_at desc);
create unique index public_booking_request_no_duplicates on public.public_booking_requests(clinic_id,phone,offer_id,starts_at) where status='pending';
create table private.public_agenda_rate_limits (
 key_hash text not null,window_start timestamptz not null,hits integer not null,
 primary key(key_hash,window_start)
);
alter table private.public_agenda_rate_limits enable row level security;
alter table public.public_agenda_settings enable row level security;
alter table public.public_agenda_offers enable row level security;
alter table public.public_agenda_hours enable row level security;
alter table public.public_booking_requests enable row level security;
revoke all on public.public_agenda_settings,public.public_agenda_offers,public.public_agenda_hours,public.public_booking_requests from anon,authenticated;
grant select on public.public_agenda_settings,public.public_agenda_offers,public.public_agenda_hours to authenticated;
grant select on public.public_booking_requests to authenticated;
grant all on public.public_agenda_settings,public.public_agenda_offers,public.public_agenda_hours,public.public_booking_requests,private.public_agenda_rate_limits to service_role;
create policy public_agenda_settings_staff on public.public_agenda_settings for select to authenticated using(private.has_clinic_access(clinic_id,array['admin','receptionist']));
create policy public_agenda_offers_staff on public.public_agenda_offers for select to authenticated using(private.has_clinic_access(clinic_id,array['admin','receptionist']));
create policy public_agenda_hours_staff on public.public_agenda_hours for select to authenticated using(private.has_clinic_access(clinic_id,array['admin','receptionist']));
create policy public_booking_requests_staff on public.public_booking_requests for select to authenticated using(private.has_clinic_access(clinic_id,array['admin','receptionist']));

create function private.public_offer_valid(p_offer uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.public_agenda_offers o
 join public.branches b on b.id=o.branch_id and b.clinic_id=o.clinic_id and b.active
 join public.businesses business on business.id=b.business_id and business.clinic_id=o.clinic_id and business.active
 join public.clinic_providers p on p.id=o.provider_id and p.clinic_id=o.clinic_id and p.active
 join public.provider_branches pb on pb.provider_id=p.id and pb.branch_id=b.id and pb.clinic_id=o.clinic_id
 join public.clinic_services s on s.id=o.service_id and s.clinic_id=o.clinic_id and s.active
 where o.id=p_offer and o.active
 and (not exists(select 1 from public.clinic_service_branches x where x.service_id=s.id) or exists(select 1 from public.clinic_service_branches x where x.service_id=s.id and x.branch_id=b.id))
 and (not exists(select 1 from public.clinic_service_providers x where x.service_id=s.id) or exists(select 1 from public.clinic_service_providers x where x.service_id=s.id and x.provider_id=p.id)));
$$;
revoke all on function private.public_offer_valid(uuid) from public,anon,authenticated;

create function private.public_slot_open(p_offer uuid,p_start timestamptz,p_review boolean default false) returns boolean
language plpgsql stable set search_path='' as $$
declare o public.public_agenda_offers;cfg public.public_agenda_settings;tz text;local_start timestamp;day date;minute integer;visit_end timestamptz;
begin
 select * into o from public.public_agenda_offers where id=p_offer;
 if not found or not private.public_offer_valid(p_offer) then return false;end if;
 select * into cfg from public.public_agenda_settings where clinic_id=o.clinic_id;
 if not found or not cfg.published then return false;end if;
 select timezone into tz from public.clinics where id=o.clinic_id;
 local_start:=p_start at time zone tz;day:=local_start::date;
 minute:=extract(hour from local_start)::integer*60+extract(minute from local_start)::integer;
 visit_end:=p_start+make_interval(mins=>o.duration_minutes);
 if p_start<=now() or (not p_review and p_start<now()+make_interval(mins=>cfg.min_notice_minutes))
 or day>(now() at time zone tz)::date+cfg.max_days or extract(second from local_start)<>0 or minute%15<>0 then return false;end if;
 -- Date exceptions replace that day's recurring windows, including all-day closures.
 if not exists(select 1 from public.public_agenda_hours h where h.clinic_id=o.clinic_id and h.branch_id=o.branch_id and h.provider_id=o.provider_id and not h.closed
   and (h.on_date=day or (h.day_of_week=extract(dow from day)::integer and not exists(select 1 from public.public_agenda_hours e where e.clinic_id=o.clinic_id and e.branch_id=o.branch_id and e.provider_id=o.provider_id and e.on_date=day)))
   and minute>=h.opens_minute and minute+o.duration_minutes<=h.closes_minute) then return false;end if;
 -- Public capacity is always one, even if internal staff permit overlapping visits.
 if exists(select 1 from public.appointments a where a.clinic_id=o.clinic_id and a.provider_id=o.provider_id and a.status<>'cancelled'
   and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(p_start-make_interval(mins=>cfg.buffer_minutes),visit_end+make_interval(mins=>cfg.buffer_minutes),'[)')) then return false;end if;
 if exists(select 1 from public.clinic_availability_blocks b where b.clinic_id=o.clinic_id and (b.scope='clinic' or b.branch_id=o.branch_id or b.provider_id=o.provider_id)
   and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(p_start,visit_end,'[)')) then return false;end if;
 return true;
end $$;
revoke all on function private.public_slot_open(uuid,timestamptz,boolean) from public,anon,authenticated;

create function public.save_public_agenda(p_clinic uuid,p_settings jsonb,p_offers jsonb,p_hours jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb;offer_id uuid;
begin
 if auth.uid() is null or not private.has_clinic_access(p_clinic,array['admin']) then raise exception 'Solo administración puede configurar la agenda pública.' using errcode='42501';end if;
 if jsonb_array_length(p_offers)>100 or jsonb_array_length(p_hours)>300 then raise exception 'Demasiadas opciones u horarios.';end if;
 perform pg_advisory_xact_lock(hashtextextended('availability:'||p_clinic::text,0));
 insert into public.public_agenda_settings(clinic_id,slug,published,min_notice_minutes,max_days,buffer_minutes,require_email)
 values(p_clinic,p_settings->>'slug',coalesce((p_settings->>'published')::boolean,false),(p_settings->>'min_notice_minutes')::integer,(p_settings->>'max_days')::integer,(p_settings->>'buffer_minutes')::integer,coalesce((p_settings->>'require_email')::boolean,false))
 on conflict(clinic_id) do update set slug=excluded.slug,published=excluded.published,min_notice_minutes=excluded.min_notice_minutes,max_days=excluded.max_days,buffer_minutes=excluded.buffer_minutes,require_email=excluded.require_email;
 update public.public_agenda_offers set active=false where clinic_id=p_clinic;
 for item in select * from jsonb_array_elements(p_offers) loop
   offer_id:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
   if exists(select 1 from public.public_agenda_offers where id=offer_id and (clinic_id<>p_clinic or service_id<>(item->>'service_id')::uuid or branch_id<>(item->>'branch_id')::uuid or provider_id<>(item->>'provider_id')::uuid)) then raise exception 'La identidad de una opción guardada no puede cambiar; agrega una opción nueva.';end if;
   -- Re-adding an archived combination retains its identity and request history.
   select coalesce((select id from public.public_agenda_offers where clinic_id=p_clinic and service_id=(item->>'service_id')::uuid and branch_id=(item->>'branch_id')::uuid and provider_id=(item->>'provider_id')::uuid),offer_id) into offer_id;
   insert into public.public_agenda_offers(id,clinic_id,service_id,branch_id,provider_id,duration_minutes,deposit_amount,active)
   values(offer_id,p_clinic,(item->>'service_id')::uuid,(item->>'branch_id')::uuid,(item->>'provider_id')::uuid,(item->>'duration_minutes')::integer,(item->>'deposit_amount')::numeric,true)
   on conflict(id) do update set duration_minutes=excluded.duration_minutes,deposit_amount=excluded.deposit_amount,active=true;
   if not private.public_offer_valid(offer_id) then raise exception 'Revisa el servicio, sucursal y profesional de cada opción.';end if;
 end loop;
 delete from public.public_agenda_hours where clinic_id=p_clinic;
 for item in select * from jsonb_array_elements(p_hours) loop
   insert into public.public_agenda_hours(clinic_id,branch_id,provider_id,day_of_week,on_date,closed,opens_minute,closes_minute)
   values(p_clinic,(item->>'branch_id')::uuid,(item->>'provider_id')::uuid,nullif(item->>'day_of_week','')::integer,nullif(item->>'on_date','')::date,coalesce((item->>'closed')::boolean,false),nullif(item->>'opens_minute','')::integer,nullif(item->>'closes_minute','')::integer);
 end loop;
 if exists(select 1 from public.public_agenda_hours h join public.public_agenda_hours e on e.clinic_id=h.clinic_id and e.branch_id=h.branch_id and e.provider_id=h.provider_id and e.id>h.id
   and e.day_of_week is not distinct from h.day_of_week and e.on_date is not distinct from h.on_date
   where h.clinic_id=p_clinic and (h.closed or e.closed or int4range(h.opens_minute,h.closes_minute,'[)') && int4range(e.opens_minute,e.closes_minute,'[)'))) then raise exception 'Los horarios no pueden traslaparse ni combinar un cierre con una apertura en la misma fecha.';end if;
 if (p_settings->>'published')::boolean and (not exists(select 1 from public.public_agenda_offers where clinic_id=p_clinic and active)
   or exists(select 1 from public.public_agenda_offers o where o.clinic_id=p_clinic and o.active and not exists(select 1 from public.public_agenda_hours h where h.clinic_id=o.clinic_id and h.branch_id=o.branch_id and h.provider_id=o.provider_id and not h.closed))) then raise exception 'Agrega opciones y horarios de atención antes de publicar.';end if;
end $$;
revoke all on function public.save_public_agenda(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_public_agenda(uuid,jsonb,jsonb,jsonb) to authenticated;

create function public.public_agenda_catalog(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',c.name,'timezone',c.timezone,'slug',cfg.slug,'today',(now() at time zone c.timezone)::date,'lastDate',(now() at time zone c.timezone)::date+cfg.max_days,'minNotice',cfg.min_notice_minutes,'maxDays',cfg.max_days,'requireEmail',cfg.require_email,
 'offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'serviceId',s.id,'branchId',b.id,'providerId',p.id,'service',s.name,'branch',b.name,'provider',p.name,'duration',o.duration_minutes,'deposit',o.deposit_amount) order by s.name,b.name,p.name)
 from public.public_agenda_offers o join public.clinic_services s on s.id=o.service_id join public.branches b on b.id=o.branch_id join public.clinic_providers p on p.id=o.provider_id
 where o.clinic_id=c.id and private.public_offer_valid(o.id)),'[]'::jsonb))
 from public.public_agenda_settings cfg join public.clinics c on c.id=cfg.clinic_id where cfg.slug=p_slug and cfg.published;
$$;
create function public.public_agenda_slots(p_slug text,p_offer uuid,p_date date) returns table(starts_at timestamptz,ends_at timestamptz)
language sql stable security definer set search_path='' as $$
 select slot.at,slot.at+make_interval(mins=>o.duration_minutes)
 from public.public_agenda_settings cfg join public.clinics c on c.id=cfg.clinic_id
 join public.public_agenda_offers o on o.clinic_id=c.id and o.id=p_offer
 cross join generate_series(360,1425,15) minute
 cross join lateral(select (p_date::timestamp+make_interval(mins=>minute)) at time zone c.timezone as at) slot
 where cfg.slug=p_slug and cfg.published and p_date between (now() at time zone c.timezone)::date and (now() at time zone c.timezone)::date+cfg.max_days
 and private.public_slot_open(o.id,slot.at);
$$;
revoke all on function public.public_agenda_catalog(text),public.public_agenda_slots(text,uuid,date) from public,anon,authenticated;
grant execute on function public.public_agenda_catalog(text),public.public_agenda_slots(text,uuid,date) to service_role;

create function public.public_agenda_rate_check(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare bucket timestamptz;total integer;
begin
 if length(p_key)<>64 or p_seconds not in (60,3600) or p_limit not between 1 and 100 then return false;end if;
 bucket:=to_timestamp(floor(extract(epoch from now())/p_seconds)*p_seconds);
 insert into private.public_agenda_rate_limits values(p_key,bucket,1) on conflict(key_hash,window_start) do update set hits=public_agenda_rate_limits.hits+1 returning hits into total;
 delete from private.public_agenda_rate_limits where window_start<now()-interval '2 hours';
 return total<=p_limit;
end $$;
revoke all on function public.public_agenda_rate_check(text,integer,integer) from public,anon,authenticated;
grant execute on function public.public_agenda_rate_check(text,integer,integer) to service_role;

create function public.submit_public_booking(p_slug text,p_offer uuid,p_start timestamptz,p_nonce uuid,p_fingerprint text,p_name text,p_phone text,p_email text,p_consent boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare cfg public.public_agenda_settings;o public.public_agenda_offers;existing public.public_booking_requests;request_id uuid;
begin
 select * into cfg from public.public_agenda_settings where slug=p_slug and published;
 if not found then raise exception 'La agenda no está disponible.' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('availability:'||cfg.clinic_id::text,0));
 select * into existing from public.public_booking_requests where nonce=p_nonce;
 if found then
   if existing.clinic_id<>cfg.clinic_id or existing.fingerprint<>p_fingerprint then raise exception 'La solicitud ya se utilizó con otros datos.';end if;
   return existing.id;
 end if;
 select * into o from public.public_agenda_offers where id=p_offer and clinic_id=cfg.clinic_id;
 if not found or not private.public_slot_open(p_offer,p_start) then raise exception 'Ese horario ya no está disponible. Elige otro.' using errcode='23P01';end if;
 if cfg.require_email and nullif(trim(p_email),'') is null then raise exception 'El correo es obligatorio.';end if;
 insert into public.public_booking_requests(clinic_id,offer_id,nonce,fingerprint,full_name,phone,email,contact_consent,starts_at,ends_at,duration_minutes,deposit_amount,service_name)
 values(cfg.clinic_id,p_offer,p_nonce,p_fingerprint,trim(p_name),p_phone,nullif(lower(trim(p_email)),''),p_consent,p_start,p_start+make_interval(mins=>o.duration_minutes),o.duration_minutes,o.deposit_amount,(select name from public.clinic_services where id=o.service_id)) returning id into request_id;
 return request_id;
end $$;
revoke all on function public.submit_public_booking(text,uuid,timestamptz,uuid,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.submit_public_booking(text,uuid,timestamptz,uuid,text,text,text,text,boolean) to service_role;

create function public.review_public_booking(p_request uuid,p_action text,p_patient uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.public_booking_requests;o public.public_agenda_offers;v_patient_id uuid;booked_id uuid;business_id uuid;
begin
 select * into r from public.public_booking_requests where id=p_request;
 if not found or auth.uid() is null or not private.has_clinic_access(r.clinic_id,array['admin','receptionist']) then raise exception 'No tienes permiso para revisar esta solicitud.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('availability:'||r.clinic_id::text,0));
 select * into r from public.public_booking_requests where id=p_request for update;
 if r.status='approved' and p_action='approve' then return r.appointment_id;end if;
 if r.status<>'pending' then raise exception 'Esta solicitud ya fue revisada.';end if;
 if p_action='reject' then update public.public_booking_requests set status='rejected',reviewed_at=now(),reviewed_by=auth.uid() where id=r.id;return null;end if;
 if p_action<>'approve' then raise exception 'Acción inválida.';end if;
 select * into o from public.public_agenda_offers where id=r.offer_id;
 if not private.public_slot_open(o.id,r.starts_at,true) or r.duration_minutes<>o.duration_minutes or r.deposit_amount<>o.deposit_amount then raise exception 'El horario o la configuración cambió. Revisa la solicitud con el paciente antes de agendar.' using errcode='23P01';end if;
 v_patient_id:=p_patient;
 if v_patient_id is not null then
   if not exists(select 1 from public.patients where id=v_patient_id and clinic_id=r.clinic_id) then raise exception 'El expediente no pertenece a esta clínica.';end if;
   if exists(select 1 from public.appointments a where a.clinic_id=r.clinic_id and a.patient_id=v_patient_id and a.status<>'cancelled' and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(r.starts_at,r.ends_at,'[)')) then raise exception 'El paciente ya tiene una cita en ese horario.' using errcode='23P01';end if;
 else
   insert into public.patients(clinic_id,record_number,full_name,phone,email,service_summary,status,primary_branch_id,primary_provider_id)
   values(r.clinic_id,'WEB-'||replace(r.id::text,'-',''),r.full_name,r.phone,r.email,r.service_name,'new',o.branch_id,o.provider_id) returning id into v_patient_id;
 end if;
 select b.business_id into business_id from public.branches b where b.id=o.branch_id;
 insert into public.appointments(clinic_id,patient_id,business_id,branch_id,provider_id,starts_at,ends_at,service,service_id,service_ids,service_snapshot,status,deposit_required,deposit_amount,created_by)
 values(r.clinic_id,v_patient_id,business_id,o.branch_id,o.provider_id,r.starts_at,r.ends_at,r.service_name,o.service_id,array[o.service_id],jsonb_build_object('source','public_agenda','service',r.service_name,'durationMinutes',r.duration_minutes),'pending',true,r.deposit_amount,auth.uid()) returning id into booked_id;
 update public.public_booking_requests set status='approved',appointment_id=booked_id,reviewed_at=now(),reviewed_by=auth.uid() where id=r.id;
 return booked_id;
end $$;
revoke all on function public.review_public_booking(uuid,text,uuid) from public,anon;
grant execute on function public.review_public_booking(uuid,text,uuid) to authenticated;

alter table public.staff_notifications drop constraint staff_notifications_message_check;
alter table public.staff_notifications add constraint staff_notifications_message_check check(message in ('Nueva cita registrada','Cita cancelada','Horario o asignación de cita actualizado','Prueba de notificaciones','Nueva solicitud de cita'));
alter table public.staff_notifications add column booking_request_id uuid references public.public_booking_requests(id) on delete cascade;
create function private.notify_public_booking_request() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient record;alert_id uuid;
begin
 for recipient in select m.user_id,coalesce(p.push_enabled,true) as push_enabled from public.clinic_memberships m
 left join public.staff_notification_preferences p on p.clinic_id=m.clinic_id and p.user_id=m.user_id
 where m.clinic_id=new.clinic_id and m.role in ('admin','receptionist') and coalesce(p.new_appointment,true)
 loop
   insert into public.staff_notifications(clinic_id,user_id,kind,message,booking_request_id) values(new.clinic_id,recipient.user_id,'new_appointment','Nueva solicitud de cita',new.id) returning id into alert_id;
   if recipient.push_enabled then insert into private.staff_push_deliveries(notification_id,subscription_id) select alert_id,s.id from public.staff_push_subscriptions s where s.clinic_id=new.clinic_id and s.user_id=recipient.user_id;end if;
 end loop;
 return new;
end $$;
revoke all on function private.notify_public_booking_request() from public,anon,authenticated;
create trigger public_booking_request_notice after insert on public.public_booking_requests for each row execute function private.notify_public_booking_request();
