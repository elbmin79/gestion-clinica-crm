import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createPatientDirectoryStore } from './patient-directory.js';

test('professional store saves identity and branches in one database transaction and reports safe errors', async () => {
  const calls = [];
  const store = createPatientDirectoryStore({ clientFactory: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: 'provider-id', error: null }; } }) });
  const input = { name: ' Test ', role: ' Médica ', userId: 'account-id', branchIds: ['branch-id', 'branch-id'] };
  assert.deepEqual(await store.createProvider('clinic-id', input), { id: 'provider-id' });
  assert.deepEqual(calls[0], { name: 'save_clinic_professional_with_colors', args: { p_clinic_id: 'clinic-id', p_provider_id: null, p_user_id: 'account-id', p_name: 'Test', p_role_title: 'Médica', p_branch_ids: ['branch-id'], p_branch_settings: null } });
  await store.updateProvider('clinic-id', { id: 'existing-id' }, { ...input, userId: '' });
  assert.equal(calls[1].args.p_provider_id, 'existing-id');
  assert.equal(calls[1].args.p_user_id, null);
  for (const message of ['Esta cuenta ya está vinculada a otro profesional.', 'internal database details']) {
    const failing = createPatientDirectoryStore({ clientFactory: () => ({ rpc: async () => ({ error: { message } }) }) });
    await assert.rejects(failing.createProvider('clinic-id', input), message.startsWith('Esta cuenta') ? /Esta cuenta ya/ : /No se pudo guardar/);
  }
});

test('PostgreSQL enforces clinic-scoped account links, atomic branch changes, identity sync and access boundaries', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const foundation = await readFile(new URL('../../../supabase/migrations/20261028221430_202610260001_clinic_crm.sql', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../../../supabase/migrations/20261029180738_professional_account_links.sql', import.meta.url), 'utf8');
  const colorMigration = await readFile(new URL('../../../supabase/migrations/20261029182052_agenda_professional_colors.sql', import.meta.url), 'utf8');
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema private;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    ${foundation.slice(foundation.indexOf('create table public.clinics'), foundation.indexOf('create table public.patients'))}
    ${migration}
    ${colorMigration}`);
  const clinic = '10000000-0000-0000-0000-000000000001', otherClinic = '10000000-0000-0000-0000-000000000002';
  const admin = '20000000-0000-0000-0000-000000000001', clinician = '20000000-0000-0000-0000-000000000002', outsider = '20000000-0000-0000-0000-000000000003';
  const branch = '30000000-0000-0000-0000-000000000001', otherBranch = '30000000-0000-0000-0000-000000000002';
  await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('${admin}','admin@example.test','{}'),('${clinician}','doctor@example.test','{"names":"Iliana","firstLastName":"Verdugo","secondLastName":"Fernández"}'),('${outsider}','other@example.test','{}');
    insert into public.clinics(id,name) values ('${clinic}','Test clinic'),('${otherClinic}','Other clinic');
    insert into public.clinic_memberships(clinic_id,user_id,role) values ('${clinic}','${admin}','admin'),('${clinic}','${clinician}','clinician');
    insert into public.businesses(id,clinic_id,name) values ('${clinic}','${clinic}','Business'),('${otherClinic}','${otherClinic}','Other business');
    insert into public.branches(id,clinic_id,business_id,name) values ('${branch}','${clinic}','${clinic}','Branch'),('${otherBranch}','${otherClinic}','${otherClinic}','Other branch');`);
  const session = async userId => { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId || '']); };
  const save = async ({ id = null, userId = null, name = 'Manual professional', branches = [branch], targetClinic = clinic } = {}) => {
    await db.exec('set role authenticated');
    try { return (await db.query('select public.save_clinic_professional($1,$2,$3,$4,$5,$6) id', [targetClinic,id,userId,name,'Médica',branches])).rows[0].id; }
    finally { await db.exec('reset role'); }
  };
  await session(admin);
  const manualId = await save();
  await db.exec(`create table public.test_patient_assignments(provider_id uuid references public.clinic_providers(id)); insert into public.test_patient_assignments values ('${manualId}');`);
  await t.test('an assignment write failure rolls back identity linking, name edits and branch deletion', async () => {
    await db.exec(`create function public.test_reject_assignment() returns trigger language plpgsql as $$ begin raise exception 'simulated assignment failure'; end; $$;
      create trigger test_reject_assignment before insert on public.provider_branches for each row execute function public.test_reject_assignment();`);
    await assert.rejects(save({ id: manualId, userId: clinician, name: 'Changed name' }), /simulated assignment failure/);
    assert.deepEqual((await db.query('select name,user_id from public.clinic_providers where id=$1', [manualId])).rows[0], { name: 'Manual professional', user_id: null });
    assert.equal((await db.query('select branch_id from public.provider_branches where provider_id=$1', [manualId])).rows[0].branch_id, branch);
    await assert.rejects(save({ name: 'Failed create' }), /simulated assignment failure/);
    assert.equal((await db.query('select count(*)::int total from public.clinic_providers')).rows[0].total, 1);
    await db.exec('drop trigger test_reject_assignment on public.provider_branches; drop function public.test_reject_assignment();');
  });
  await t.test('linking preserves the professional ID and existing patient references; identity uses account metadata', async () => {
    assert.equal(await save({ id: manualId, userId: clinician, name: 'Client-supplied name' }), manualId);
    const row = (await db.query('select name,user_id from public.clinic_providers where id=$1', [manualId])).rows[0];
    assert.deepEqual(row, { name: 'Iliana Verdugo Fernández', user_id: clinician });
    assert.equal((await db.query('select provider_id from public.test_patient_assignments')).rows[0].provider_id, manualId);
  });
  await t.test('duplicate links roll back the entire create and preserve prior branches on failed edit', async () => {
    await assert.rejects(save({ userId: clinician }), /ya está vinculada/);
    assert.equal((await db.query('select count(*)::int total from public.clinic_providers')).rows[0].total, 1);
    await assert.rejects(save({ id: manualId, userId: clinician, branches: [otherBranch] }), /sucursales/);
    assert.equal((await db.query('select branch_id from public.provider_branches where provider_id=$1', [manualId])).rows[0].branch_id, branch);
  });
  await t.test('rejects accounts without clinic membership, missing branches and cross-clinic edits', async () => {
    await assert.rejects(save({ userId: outsider }), /no tiene acceso/);
    await assert.rejects(save({ branches: [] }), /al menos una/);
    await assert.rejects(save({ id: manualId, targetClinic: otherClinic }), /administradora/);
    await assert.rejects(save({ id: manualId, userId: admin }), /no se puede sustituir/);
  });
  await t.test('profile changes update linked names and preserve manual identities', async () => {
    const unlinkedId = await save({ name: 'Manual identity' });
    await db.query("update auth.users set raw_user_meta_data = '{\"names\":\"Updated profile\"}' where id=$1", [clinician]);
    assert.equal((await db.query('select name from public.clinic_providers where id=$1', [manualId])).rows[0].name, 'Updated profile');
    assert.equal((await db.query('select name from public.clinic_providers where id=$1', [unlinkedId])).rows[0].name, 'Manual identity');
  });
  await t.test('non-admin and unauthenticated callers cannot save or create links', async () => {
    await session(clinician);
    await assert.rejects(save(), /administradora/);
    await session(null);
    await assert.rejects(save(), /administradora/);
    assert.equal((await db.query("select has_function_privilege('anon','public.save_clinic_professional(uuid,uuid,uuid,text,text,uuid[])','execute') allowed")).rows[0].allowed, false);
    await session(admin);
  });
  await t.test('color configurations are validated, persisted and preserved by older callers', async () => {
    const config = { [branch]: { color: 'red', serviceColors: { revision: 'red', morpheus: 'pink', nctf: 'pink' } } };
    await db.exec('set role authenticated');
    try {
      await db.query('select public.save_clinic_professional_with_colors($1,$2,$3,$4,$5,$6,$7)', [clinic,manualId,clinician,'Name','Médica',[branch],JSON.stringify(config)]);
    } finally { await db.exec('reset role'); }
    await save({ id: manualId, userId: clinician });
    const row = (await db.query('select agenda_color,agenda_service_colors from public.provider_branches where provider_id=$1',[manualId])).rows[0];
    assert.deepEqual(row, { agenda_color: 'red', agenda_service_colors: { revision: 'red', morpheus: 'pink', nctf: 'pink' } });
    await assert.rejects(db.query("update public.provider_branches set agenda_color='invalid' where provider_id=$1",[manualId]), /provider_branch_agenda_colors_valid/);
    await assert.rejects(db.query("update public.provider_branches set agenda_service_colors='[]' where provider_id=$1",[manualId]), /provider_branch_agenda_colors_valid/);
  });
  await t.test('revoking login access retains the clinical record and permits clinical configuration updates', async () => {
    await db.query('delete from public.clinic_memberships where clinic_id=$1 and user_id=$2', [clinic,clinician]);
    assert.equal(await save({ id: manualId, userId: clinician }), manualId);
  });
});
