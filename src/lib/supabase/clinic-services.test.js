import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createClinicServicesStore } from './clinic-services.js';

test('clinic service store saves through the clinic-scoped atomic catalog RPC', async () => {
  const calls = [];
  const store = createClinicServicesStore({ clientFactory: () => ({ rpc: async (name,args) => { calls.push({name,args}); return {data:'service-id',error:null}; }, from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({data:{id:'service-id',code:'fac-limpieza',category:'Faciales',name:'Limpieza',duration_min:30,duration_max:30,offers:[{kind:'single',amount:700,currency:'MXN'}],variants:[],active:true,status:'ready'},error:null}) }) }) }) }) }) });
  const saved = await store.save('clinic-id', { code:'fac-limpieza', category:'Faciales', name:' Limpieza ', durationMin:30, durationMax:30, offers:[{kind:'single',amount:700,currency:'MXN'}], branchIds:['branch-id'] });
  assert.equal(saved.id,'service-id');
  assert.equal(calls[0].name,'save_clinic_service');
  assert.equal(calls[0].args.target_name,'Limpieza');
  assert.deepEqual(calls[0].args.target_branch_ids,['branch-id']);
  assert.deepEqual(calls[0].args.target_provider_ids,[]);
});

test('PostgreSQL enforces service edit permissions, clinic scope, branch assignments and atomic persistence', async t => {
  const db = new PGlite(); t.after(() => db.close());
  const foundation = await readFile(new URL('../../../supabase/migrations/20261028221430_202610260001_clinic_crm.sql', import.meta.url),'utf8');
  const migration = await readFile(new URL('../../../supabase/migrations/20261029191404_clinic_services_catalog.sql', import.meta.url),'utf8');
  const snapshotMigration = await readFile(new URL('../../../supabase/migrations/20261029192115_preserve_service_snapshots.sql', import.meta.url),'utf8');
  const multiServiceMigration = await readFile(new URL('../../../supabase/migrations/20261029192455_multi_service_appointments.sql', import.meta.url),'utf8');
  const globalScopeMigration = await readFile(new URL('../../../supabase/migrations/20261029194320_empty_service_scope_is_clinic_wide.sql', import.meta.url),'utf8');
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema private;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function private.capture_audit_event() returns trigger language plpgsql as $$ begin return new; end $$;
    ${foundation.slice(foundation.indexOf('create table public.clinics'), foundation.indexOf('create table public.patients'))}
    create table public.appointments(id uuid primary key default gen_random_uuid(),clinic_id uuid not null,patient_id uuid not null,business_id uuid not null,branch_id uuid not null,provider_id uuid not null,starts_at timestamptz not null,ends_at timestamptz not null,service text not null);
    ${migration}
    ${snapshotMigration}
    ${multiServiceMigration}
    ${globalScopeMigration}`);
  const clinic='10000000-0000-0000-0000-000000000001', other='10000000-0000-0000-0000-000000000002';
  const admin='20000000-0000-0000-0000-000000000001', clinician='20000000-0000-0000-0000-000000000002', patient='50000000-0000-0000-0000-000000000001';
  const branch='30000000-0000-0000-0000-000000000001', foreignBranch='30000000-0000-0000-0000-000000000002', branchNoProvider='30000000-0000-0000-0000-000000000003', secondBranch='30000000-0000-0000-0000-000000000004', provider='40000000-0000-0000-0000-000000000001';
  await db.exec(`insert into auth.users(id,email) values ('${admin}','a@test'),('${clinician}','c@test');
    insert into public.clinics(id,name) values ('${clinic}','Clinic'),('${other}','Other');
    insert into public.clinic_memberships(clinic_id,user_id,role) values ('${clinic}','${admin}','admin'),('${clinic}','${clinician}','clinician');
    insert into public.businesses(id,clinic_id,name) values ('${clinic}','${clinic}','Business'),('${other}','${other}','Other');
    insert into public.branches(id,clinic_id,business_id,name) values ('${branch}','${clinic}','${clinic}','Branch'),('${foreignBranch}','${other}','${other}','Other branch'),('${branchNoProvider}','${clinic}','${clinic}','Unassigned branch'),('${secondBranch}','${clinic}','${clinic}','Second branch');
    insert into public.clinic_providers(id,clinic_id,name) values ('${provider}','${clinic}','Provider');
    insert into public.provider_branches(clinic_id,provider_id,branch_id) values ('${clinic}','${provider}','${branch}'),('${clinic}','${provider}','${secondBranch}');`);
  const session = async id => db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
  const save = async (user, clinicId=clinic, branches=[branch,secondBranch]) => {
    await session(user); await db.exec('set role authenticated');
    try { return await db.query(`select public.save_clinic_service($1,null,'test','Faciales','Test service',null,30,30,'[{"kind":"single","amount":1,"currency":"MXN"}]','[]',null,'test','ready',true,$2::uuid[],$3::uuid[]) id`,[clinicId,branches,[provider]]); }
    finally { await db.exec('reset role'); }
  };
  await t.test('admin can atomically create the service and its branch mapping', async () => {
    const result=await save(admin); const id=result.rows[0].id;
    assert.equal((await db.query('select count(*)::int count from public.clinic_services where id=$1',[id])).rows[0].count,1);
    assert.deepEqual((await db.query('select branch_id from public.clinic_service_branches where service_id=$1 order by branch_id',[id])).rows.map(item=>item.branch_id),[branch,secondBranch].sort());
    assert.deepEqual((await db.query('select provider_id from public.clinic_service_providers where service_id=$1',[id])).rows.map(item=>item.provider_id),[provider]);
    const appointment=(await db.query("insert into public.appointments(clinic_id,patient_id,business_id,branch_id,provider_id,starts_at,ends_at,service,service_id) values ($1,$2,$1,$3,$4,'2026-10-29T10:00:00Z','2026-10-29T10:30:00Z','Manual service',$5) returning service,service_snapshot",[clinic,patient,branch,provider,id])).rows[0];
    assert.equal(appointment.service,'Test service'); assert.equal(appointment.service_snapshot.services[0].code,'test');
    await db.query("update public.clinic_services set offers='[{\"kind\":\"single\",\"amount\":99,\"currency\":\"MXN\"}]' where id=$1",[id]);
    await db.query("update public.appointments set service_snapshot='{}',service='Tampered label',branch_id=$2 where clinic_id=$1",[clinic,secondBranch]);
    const snapshot=(await db.query("select service,service_snapshot->'services'->0->>'code' code,service_snapshot->'services'->0->'offers' offers from public.appointments where clinic_id=$1",[clinic])).rows[0];
    assert.equal(snapshot.code,'test'); assert.equal(snapshot.service,'Test service'); assert.equal(snapshot.offers[0].amount,1);
    await assert.rejects(db.query("insert into public.appointments(clinic_id,patient_id,business_id,branch_id,provider_id,starts_at,ends_at,service,service_id) values ($1,$2,$1,$3,$4,'2026-10-29T11:00:00Z','2026-10-29T11:30:00Z','Manual service',$5)",[clinic,patient,branchNoProvider,provider,id]),/Cada servicio debe estar activo/);
  });
  await t.test('non-admin, anonymous, cross-clinic branch and cross-clinic write are rejected', async () => {
    await assert.rejects(save(clinician),/administradora/);
    await assert.rejects(save(admin,clinic,[foreignBranch]),/sucursales/);
    await assert.rejects(save(admin,clinic,[branchNoProvider]),/profesional debe estar activo/);
    await assert.rejects(save(admin,other),/administradora/);
    await assert.rejects(save(null),/administradora/);
    assert.equal((await db.query("select has_function_privilege('anon','public.save_clinic_service(uuid,uuid,text,text,text,text,integer,integer,jsonb,jsonb,text,text,text,boolean,uuid[],uuid[])','execute') allowed")).rows[0].allowed,false);
  });
  await t.test('appointments can snapshot multiple assigned services and reject duplicate or invalid sets', async () => {
    const first=(await db.query('select id from public.clinic_services limit 1')).rows[0].id;
    await session(admin); await db.exec('set role authenticated');
    let second;
    try {
      second=(await db.query(`select public.save_clinic_service($1,null,'test-second','Faciales','Second service',null,45,45,'[{"kind":"single","amount":2,"currency":"MXN"}]','[]',null,'test-second','ready',true,$2::uuid[],$3::uuid[]) id`,[clinic,[branch],[provider]])).rows[0].id;
    } finally { await db.exec('reset role'); }
    const result=await db.query("insert into public.appointments(clinic_id,patient_id,business_id,branch_id,provider_id,starts_at,ends_at,service,service_ids) values ($1,$2,$1,$3,$4,'2026-10-29T12:00:00Z','2026-10-29T13:15:00Z','ignored',array[$5::uuid,$6::uuid]) returning service,service_id,service_snapshot",[clinic,patient,branch,provider,first,second]);
    assert.equal(result.rows[0].service,'Test service + Second service');
    assert.equal(result.rows[0].service_id,first);
    assert.equal(result.rows[0].service_snapshot.services.length,2);
    assert.equal(result.rows[0].service_snapshot.scheduledDurationMinutes,75);
    await assert.rejects(db.query("insert into public.appointments(clinic_id,patient_id,business_id,branch_id,provider_id,starts_at,ends_at,service,service_ids) values ($1,$2,$1,$3,$4,'2026-10-29T14:00:00Z','2026-10-29T14:45:00Z','ignored',array[$5::uuid,$5::uuid])",[clinic,patient,branch,provider,first]),/No repitas servicios/);
    await assert.rejects(db.query("insert into public.appointments(clinic_id,patient_id,business_id,branch_id,provider_id,starts_at,ends_at,service,service_ids) values ($1,$2,$1,$3,$4,'2026-10-29T14:00:00Z','2026-10-29T14:20:00Z','ignored',array[$5::uuid])",[clinic,patient,branch,provider,first]),/duración de la cita/);
    await session(admin); await db.exec('set role authenticated');
    let unscoped;
    try {
      unscoped=(await db.query(`select public.save_clinic_service($1,null,'unscoped-test','Faciales','Clinic-wide service',null,null,null,'[]','[]',null,'unscoped-test','setup_needed',true,'{}'::uuid[],'{}'::uuid[]) id`,[clinic])).rows[0].id;
    } finally { await db.exec('reset role'); }
    const global=(await db.query("insert into public.appointments(clinic_id,patient_id,business_id,branch_id,provider_id,starts_at,ends_at,service,service_ids) values ($1,$2,$1,$3,$4,'2026-10-29T15:00:00Z','2026-10-29T15:45:00Z','ignored',array[$5::uuid]) returning service,service_snapshot",[clinic,patient,branch,provider,unscoped])).rows[0];
    assert.equal(global.service,'Clinic-wide service');
    assert.equal(global.service_snapshot.services[0].durationMin,null);
  });
});
