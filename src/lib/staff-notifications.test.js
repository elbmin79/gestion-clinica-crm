import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {runInNewContext} from 'node:vm';
import {validPushSubscription} from './push-validation.js';
import {dispatchStaffPush,authorizedPushDispatch} from './push-dispatch.js';

const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test-endpoint',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}};
test('service worker suppresses unapproved notification text and refuses cross-origin notification navigation',async()=>{
  const listeners=new Map(),shown=[],opened=[];
  const worker={location:{origin:'https://crm.example'},addEventListener:(name,handler)=>listeners.set(name,handler),registration:{showNotification:async(title,options)=>shown.push({title,...options})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
  runInNewContext(await readFile(new URL('../../public/sw.js',import.meta.url),'utf8'),{self:worker,URL});
  let pending;
  listeners.get('push')({data:{json:()=>({title:'Patient name',body:'Private clinical details',url:'https://untrusted.example'})},waitUntil:promise=>pending=promise});
  await pending;
  assert.equal(shown[0].title,'CRM clínico');
  assert.equal(shown[0].body,'Hay una actualización en tu clínica.');
  listeners.get('notificationclick')({notification:{close(){},data:{url:'https://untrusted.example/agenda'}},waitUntil:promise=>pending=promise});
  assert.equal(opened.length,0);
  listeners.get('notificationclick')({notification:{close(){},data:{url:'/agenda?clinic=test'}},waitUntil:promise=>pending=promise});
  await pending;
  assert.deepEqual(opened,['https://crm.example/agenda?clinic=test']);
});
test('push subscriptions reject local addresses, credentials, arbitrary hosts and malformed keys',()=>{
  assert.equal(validPushSubscription(subscription),true);
  for(const endpoint of ['http://fcm.googleapis.com/test','https://127.0.0.1/private','https://fcm.googleapis.com.evil.test/private','https://user@fcm.googleapis.com/test','https://fcm.googleapis.com:444/test'])assert.equal(validPushSubscription({...subscription,endpoint}),false);
  assert.equal(validPushSubscription({...subscription,keys:{auth:'invalid'}}),false);
  assert.equal(validPushSubscription({...subscription,endpoint:'https://managed-push.example/send'},['managed-push.example']),true);
  assert.equal(authorizedPushDispatch(new Request('http://localhost',{headers:{authorization:'Bearer secret'}}),'secret'),true);
  assert.equal(authorizedPushDispatch(new Request('http://localhost'),''),false);
});
test('dispatcher rechecks eligibility, retries temporary failures, removes expired endpoints and sends no patient content',async()=>{
  for(const scenario of ['sent','skipped','retry','expired','checkError']){
    const calls=[];let sent=0;let payload;
    const row={delivery_id:'delivery',token:'lease',subscription_id:'sub',endpoint:subscription.endpoint,p256dh:subscription.keys.p256dh,auth:subscription.keys.auth,message:'Nueva cita registrada',clinic_id:'clinic',appointment_id:'appointment'};
    const client={rpc:async(name,args)=>{calls.push({name,args});if(name==='claim_staff_push')return {data:[row]};if(name==='staff_push_is_eligible')return scenario==='checkError'?{error:{message:'offline'}}:{data:scenario!=='skipped'};return {data:true};},from:()=>({delete:()=>({eq:async()=>({error:null})})})};
    const result=await dispatchStaffPush(client,async(sub,value)=>{sent++;payload=JSON.parse(value);if(scenario==='retry')throw {statusCode:503};if(scenario==='expired')throw {statusCode:410};});
    if(scenario==='sent'){assert.equal(result.sent,1);assert.deepEqual(Object.keys(payload).sort(),['body','tag','title','url']);assert.equal(payload.body,'Nueva cita registrada');}
    if(scenario==='skipped'||scenario==='checkError')assert.equal(sent,0);
    if(scenario==='retry'||scenario==='checkError')assert.equal(calls.at(-1).args.target_state,'pending');
    if(scenario==='expired')assert.equal(result.skipped,1);
  }
});

test('PostgreSQL staff alerts enforce recipients, preferences, clinic isolation, immutable content and delivery leases',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 const foundation=await readFile(new URL('../../supabase/migrations/20261028221430_202610260001_clinic_crm.sql',import.meta.url),'utf8');
 const migration=await readFile(new URL('../../supabase/migrations/20261030194825_team_push_notifications.sql',import.meta.url),'utf8');
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;grant usage on schema private to authenticated,service_role;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 ${foundation.slice(foundation.indexOf('create table public.clinics'),foundation.indexOf('create table public.patients'))}
 create table public.appointments(id uuid primary key default gen_random_uuid(),clinic_id uuid not null,provider_id uuid,branch_id uuid,starts_at timestamptz,ends_at timestamptz,status text default 'pending',service text);
 ${migration}`);
 const c='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002';
 const a='20000000-0000-0000-0000-000000000001',r='20000000-0000-0000-0000-000000000002',p='20000000-0000-0000-0000-000000000003',b='20000000-0000-0000-0000-000000000004',x='20000000-0000-0000-0000-000000000005';
 const provider='30000000-0000-0000-0000-000000000001',nextProvider='30000000-0000-0000-0000-000000000002';
 await db.exec(`insert into auth.users values('${a}'),('${r}'),('${p}'),('${b}'),('${x}');insert into public.clinics(id,name) values('${c}','Clinic'),('${other}','Other');
 insert into public.clinic_memberships(clinic_id,user_id,role) values('${c}','${a}','admin'),('${c}','${r}','receptionist'),('${c}','${p}','clinician'),('${c}','${b}','billing'),('${other}','${x}','admin');
 insert into public.clinic_providers(id,clinic_id,user_id,name) values('${provider}','${c}','${p}','Doctor'),('${nextProvider}','${c}',null,'Other doctor');
 insert into public.staff_push_subscriptions(clinic_id,user_id,endpoint,p256dh,auth) values('${c}','${r}','${subscription.endpoint}','${subscription.keys.p256dh}','${subscription.keys.auth}');
 select set_config('request.jwt.claim.sub','${a}',false);`);
 const appointment=(await db.query(`insert into public.appointments(clinic_id,provider_id,starts_at,ends_at) values($1,$2,'2026-11-01T16:00Z','2026-11-01T17:00Z') returning id`,[c,provider])).rows[0].id;
 assert.deepEqual((await db.query('select user_id from public.staff_notifications order by user_id')).rows.map(v=>v.user_id),[r,p]);
 assert.equal((await db.query('select count(*)::int n from private.staff_push_deliveries')).rows[0].n,1);
 await db.query('update public.appointments set service=$1 where id=$2',['Sensitive patient service',appointment]);
 assert.equal((await db.query('select count(*)::int n from public.staff_notifications')).rows[0].n,2);
 await db.query('update public.appointments set provider_id=$1 where id=$2',[nextProvider,appointment]);
 assert.equal((await db.query('select count(*)::int n from public.staff_notifications where user_id=$1',[p])).rows[0].n,2,'old professional notified on reassignment');
 await db.exec(`insert into public.staff_notification_preferences(clinic_id,user_id,agenda_change,push_enabled) values('${c}','${r}',false,false);`);
 await db.query("update public.appointments set status='cancelled' where id=$1",[appointment]);
 assert.equal((await db.query("select count(*)::int n from public.staff_notifications where message='Cita cancelada'")).rows[0].n,0);
 await db.exec(`select set_config('request.jwt.claim.sub','${r}',false);set role authenticated;`);
 assert.equal((await db.query('select count(*)::int n from public.staff_notifications')).rows[0].n,2);
 await assert.rejects(db.exec("update public.staff_notifications set message='Cita cancelada'"),/permission denied/);
 await assert.rejects(db.exec(`insert into public.staff_notification_preferences(clinic_id,user_id) values('${c}','${a}')`),/row-level security/);
 await db.exec("update public.staff_notifications set read_at=now();reset role;");
 assert.equal((await db.query('select count(*)::int n from public.staff_notifications where read_at is not null')).rows[0].n,2);
 await db.exec(`select set_config('request.jwt.claim.sub','${x}',false);set role authenticated;`);
 assert.equal((await db.query('select count(*)::int n from public.staff_notifications')).rows[0].n,0);
 await assert.rejects(db.exec('select * from public.claim_staff_push(20)'),/permission denied/);
 await db.exec('reset role;');
 const claimed=(await db.query('select * from public.claim_staff_push(20)')).rows;
 assert.equal(claimed.length,2);
 assert.equal((await db.query('select * from public.claim_staff_push(20)')).rows.length,0,'leased deliveries are not reclaimed');
 assert.equal((await db.query('select public.staff_push_is_eligible($1,$2) ok',[claimed[0].delivery_id,claimed[0].token])).rows[0].ok,false,'preferences rechecked');
 assert.equal((await db.query("select public.settle_staff_push($1,gen_random_uuid(),'sent') ok",[claimed[0].delivery_id])).rows[0].ok,false,'wrong lease cannot settle');
 await db.query("select public.settle_staff_push($1,$2,'pending')",[claimed[0].delivery_id,claimed[0].token]);
 assert.equal((await db.query('select * from public.claim_staff_push(20)')).rows.length,0,'retry is delayed');
 await db.exec("update private.staff_push_deliveries set available_at=now()-interval '1 minute',attempts=3,state='sending';select * from public.claim_staff_push(20);");
 assert.equal((await db.query("select count(*)::int n from private.staff_push_deliveries where state='failed'")).rows[0].n,2);
 await db.exec(`delete from public.clinic_memberships where clinic_id='${c}' and user_id='${r}'`);
 assert.equal((await db.query('select count(*)::int n from public.staff_push_subscriptions')).rows[0].n,0,'revoked membership removes subscriptions and queued deliveries');
 await db.exec(`select set_config('request.jwt.claim.sub','${a}',false);
 insert into public.staff_notification_preferences(clinic_id,user_id,include_self,push_enabled) values('${c}','${a}',true,false);
 insert into public.staff_notification_preferences(clinic_id,user_id,new_appointment) values('${c}','${p}',false);`);
 const before=(await db.query('select count(*)::int n from public.staff_notifications')).rows[0].n;
 await db.query(`insert into public.appointments(clinic_id,provider_id,starts_at,ends_at) values($1,$2,'2026-11-02T16:00Z','2026-11-02T17:00Z')`,[c,provider]);
 assert.equal((await db.query('select count(*)::int n from public.staff_notifications')).rows[0].n,before+1,'self opt-in works while clinician new-booking opt-out suppresses their alert');
 assert.equal((await db.query('select count(*)::int n from private.staff_push_deliveries')).rows[0].n,0,'push opt-out retains inbox without queueing');
 const registered=(await db.query(`insert into public.staff_push_subscriptions(clinic_id,user_id,endpoint,p256dh,auth) values($1,$2,$3,$4,$5) returning id`,[c,a,subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth])).rows[0].id;
 await db.query('select public.queue_staff_push_test($1,$2,$3)',[c,a,registered]);
 await assert.rejects(db.query('select public.queue_staff_push_test($1,$2,$3)',[c,a,registered]),/Wait one minute/);
 const testClaim=(await db.query('select * from public.claim_staff_push(1)')).rows[0];
 assert.equal((await db.query('select public.staff_push_is_eligible($1,$2) ok',[testClaim.delivery_id,testClaim.token])).rows[0].ok,false,'device preference also blocks tests');
});
