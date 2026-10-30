import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

export async function bookingDatabase(){
 const db=new PGlite();
 const read=name=>readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');
 const foundation=await read('20261028221430_202610260001_clinic_crm.sql');
 const catalog=await read('20261029191404_clinic_services_catalog.sql');
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;
 grant usage on schema auth,private to authenticated,service_role;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 ${foundation.slice(foundation.indexOf('create table public.clinics'),foundation.indexOf('-- Enforce schedule conflicts'))}
 alter table public.appointments add column deposit_required boolean default true,add column deposit_amount numeric default 0,add column service_id uuid,add column service_ids uuid[] default '{}',add column service_snapshot jsonb default '{}';
 ${catalog.slice(0,catalog.indexOf('alter table public.appointments'))}
 ${await read('20261029194320_empty_service_scope_is_clinic_wide.sql')}
 create trigger appointments_catalog_service_guard before insert or update of service_id,service_ids,branch_id,provider_id,starts_at,ends_at on public.appointments for each row execute function private.validate_appointment_catalog_service();
 create table public.payments(id uuid primary key default gen_random_uuid(),clinic_id uuid,patient_id uuid,appointment_id uuid,direction text,amount numeric);
 ${(await read('20261028221452_202610260008_payment_deposit_consistency.sql')).split('create or replace function private.validate_payment_refund')[0]}
 create trigger appointments_deposit_guard before insert or update on public.appointments for each row execute function private.enforce_appointment_deposit();
 ${await read('20261030072515_clinic_availability.sql')}
 ${await read('20261030072602_clinic_availability_policy_tuneup.sql')}
 ${await read('20261030194825_team_push_notifications.sql')}
 ${await read('20261030202528_public_agenda_requests.sql')}`);
 return db;
}
const c='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002',a='20000000-0000-0000-0000-000000000001',r='20000000-0000-0000-0000-000000000002',x='20000000-0000-0000-0000-000000000003',b='30000000-0000-0000-0000-000000000001',p='40000000-0000-0000-0000-000000000001',s='50000000-0000-0000-0000-000000000001',o='60000000-0000-0000-0000-000000000001';

test('public agenda database: settings, private catalog, slots, idempotent requests, review, and clinic boundaries',async t=>{
 const db=await bookingDatabase();t.after(()=>db.close());
 await db.exec(`insert into auth.users values('${a}'),('${r}'),('${x}');
 insert into public.clinics(id,name,timezone) values('${c}','Test clinic','America/Tijuana'),('${other}','Other clinic','America/Tijuana');
 insert into public.clinic_memberships(clinic_id,user_id,role) values('${c}','${a}','admin'),('${c}','${r}','receptionist'),('${other}','${x}','admin');
 insert into public.businesses(id,clinic_id,name) values('${c}','${c}','Business');
 insert into public.branches(id,clinic_id,business_id,name) values('${b}','${c}','${c}','Branch');
 insert into public.clinic_providers(id,clinic_id,name) values('${p}','${c}','Doctor');
 insert into public.provider_branches values('${c}','${p}','${b}');
 insert into public.clinic_services(id,clinic_id,code,category,name) values('${s}','${c}','test','Test','Test service');
 select set_config('request.jwt.claim.sub','${a}',false);`);
 const cfg={slug:'test-clinic',published:true,min_notice_minutes:0,max_days:30,buffer_minutes:15,require_email:true};
 const offers=[{id:o,service_id:s,branch_id:b,provider_id:p,duration_minutes:45,deposit_amount:100}];
 const hours=Array.from({length:7},(_,day)=>({branch_id:b,provider_id:p,day_of_week:day,opens_minute:540,closes_minute:720}));
 const save=async(settings=cfg,options=offers,windows=hours)=>db.query('select public.save_public_agenda($1,$2,$3,$4)',[c,JSON.stringify(settings),JSON.stringify(options),JSON.stringify(windows)]);
 await save();
 const catalog=(await db.query("select public.public_agenda_catalog('test-clinic') data")).rows[0].data;
 assert.equal(catalog.name,'Test clinic');assert.equal(catalog.offers.length,1);assert.equal(catalog.offers[0].duration,45);assert.equal('clinic_id' in catalog,false);
 const date=(await db.query("select ((now() at time zone 'America/Tijuana')::date+2)::text as slot_date")).rows[0].slot_date;
 const slots=async()=> (await db.query('select * from public.public_agenda_slots($1,$2,$3)',['test-clinic',o,date])).rows;
 const open=await slots();assert.equal(open.length,10);
 assert.equal(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Tijuana',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(open[0].starts_at),'09:00');
 await save(cfg,offers,[...hours,{branch_id:b,provider_id:p,on_date:date,day_of_week:null,closed:true,opens_minute:null,closes_minute:null}]);
 assert.equal((await slots()).length,0,'date closure overrides weekly opening');
 await save(cfg,offers,[...hours,{branch_id:b,provider_id:p,on_date:date,day_of_week:null,closed:false,opens_minute:570,closes_minute:660}]);
 assert.equal((await slots()).length,4,'date opening replaces weekly windows');
 await save({...cfg,min_notice_minutes:43200});assert.equal((await slots()).length,0,'lead time enforced');
 await save();
 const block=(await db.query("insert into public.clinic_availability_blocks(clinic_id,title,scope,provider_id,starts_at,ends_at) values($1,'Break','provider',$2,$3,$4) returning id",[c,p,open[4].starts_at,open[6].starts_at])).rows[0].id;
 assert.equal((await slots()).length,6,'provider blocks remove overlapping visits');
 await db.query('delete from public.clinic_availability_blocks where id=$1',[block]);
 await db.query('update public.clinic_services set active=false where id=$1',[s]);assert.equal((await slots()).length,0,'inactive service is hidden');
 await db.query('update public.clinic_services set active=true where id=$1',[s]);
 const request=async(nonce='70000000-0000-0000-0000-000000000001',fingerprint='a'.repeat(64),start=open[0].starts_at,phone='+526640000001')=> (await db.query('select public.submit_public_booking($1,$2,$3,$4,$5,$6,$7,$8,true) id',['test-clinic',o,start,nonce,fingerprint,'Synthetic visitor',phone,'test@example.test'])).rows[0].id;
 const id=await request();assert.equal(await request(),id);assert.equal((await slots()).length,10,'requests do not reserve slots');
 await assert.rejects(request(undefined,'b'.repeat(64)),/otros datos/);
 assert.equal((await db.query('select count(*)::int n from public.staff_notifications where booking_request_id=$1',[id])).rows[0].n,2);
 await assert.rejects(request('70000000-0000-0000-0000-000000000009'),/duplicate key/);
 const competing=await request('70000000-0000-0000-0000-000000000002','c'.repeat(64),open[0].starts_at,'+526640000002');
 await db.exec(`set role anon;`);await assert.rejects(db.query('select * from public.public_booking_requests'),/permission denied/);await assert.rejects(db.query("select public.public_agenda_catalog('test-clinic')"),/permission denied/);await db.exec('reset role;');
 await db.exec(`select set_config('request.jwt.claim.sub','${x}',false);set role authenticated;`);
 assert.equal((await db.query('select * from public.public_booking_requests')).rows.length,0);
 await assert.rejects(db.query("select public.review_public_booking($1,'approve')",[id]),/permiso/);
 await db.exec('reset role;');
 await db.exec(`select set_config('request.jwt.claim.sub','${r}',false);set role authenticated;`);
 await assert.rejects(save(),/administración/);
 const approved=(await db.query("select public.review_public_booking($1,'approve') id",[id])).rows[0].id;
 assert.equal((await db.query("select public.review_public_booking($1,'approve') id",[id])).rows[0].id,approved);
 await assert.rejects(db.query("select public.review_public_booking($1,'approve')",[competing]),/horario/);
 await db.query("select public.review_public_booking($1,'reject')",[competing]);
 await db.exec('reset role;');
 const appointment=(await db.query('select * from public.appointments where id=$1',[approved])).rows[0];
 assert.equal(appointment.status,'pending');assert.equal(Number(appointment.deposit_amount),100);
 assert.equal((await db.query('select count(*)::int n from public.patients')).rows[0].n,1,'no duplicate patients on approval retry');
 assert.equal((await slots()).length,6,'booking and configured buffers remove conflicting starts');
 await db.query('insert into public.clinic_availability_settings(clinic_id,allow_provider_overlaps) values($1,true)',[c]);
 assert.equal((await slots()).length,6,'public capacity stays one despite internal parallel booking');
 const linked=await request('70000000-0000-0000-0000-000000000003','d'.repeat(64),open[6].starts_at,'+526640000003');
 await db.query("select public.review_public_booking($1,'approve',$2)",[linked,appointment.patient_id]);
 assert.equal((await db.query('select count(*)::int n from public.patients')).rows[0].n,1,'explicit patient linking preserves the existing record');
 await assert.rejects(db.query("update public.appointments set status='confirmed' where id=$1",[approved]),/deposit/);
 await assert.rejects(request('70000000-0000-0000-0000-000000000010'),/horario/);
 await db.exec(`select set_config('request.jwt.claim.sub','${a}',false);`);
 await assert.rejects(save(cfg,offers,[...hours,hours[0]]),/traslaparse/);
 await assert.rejects(save(cfg,offers,[]),/horarios de atención/);
 assert.equal((await db.query('select public.public_agenda_rate_check($1,1,60) ok',['f'.repeat(64)])).rows[0].ok,true);
 assert.equal((await db.query('select public.public_agenda_rate_check($1,1,60) ok',['f'.repeat(64)])).rows[0].ok,false);
 await save({...cfg,published:false});assert.equal((await db.query("select public.public_agenda_catalog('test-clinic') data")).rows[0].data,null);assert.equal((await slots()).length,0);
});
