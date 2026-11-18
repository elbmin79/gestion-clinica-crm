import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = name => readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const clinic = '10000000-0000-0000-0000-000000000001';
const otherClinic = '10000000-0000-0000-0000-000000000002';
const patient = '20000000-0000-0000-0000-000000000001';
const actor = '30000000-0000-0000-0000-000000000001';

test('procedure edits and deletes require clinical.edit in the record clinic', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema private;
    grant usage on schema auth, private to authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select '${actor}'::uuid $$;
    create table clinics(id uuid primary key);
    create table patients(id uuid, clinic_id uuid, primary key (id, clinic_id));
    create table patient_documents(id uuid, patient_id uuid, clinic_id uuid, primary key(id, patient_id, clinic_id));
    create table clinic_providers(id uuid, clinic_id uuid, primary key(id, clinic_id));
    create table appointments(id uuid, patient_id uuid, clinic_id uuid, primary key(id, patient_id, clinic_id));
    create function private.has_clinic_access(target uuid, roles text[]) returns boolean
    language sql stable as $$ select target = '${clinic}'::uuid $$;
    create function private.has_clinic_permission(target uuid, permission text) returns boolean
    language sql stable as $$
      select target = '${clinic}'::uuid and
        (permission = 'clinical.create' or current_setting('test.permission', true) = permission)
    $$;
    insert into auth.users values ('${actor}');
    insert into clinics values ('${clinic}'), ('${otherClinic}');
    insert into patients values ('${patient}', '${clinic}'), ('${patient}', '${otherClinic}');
  `);
  const workspace = await migration('20261116203448_patient_clinical_workspace');
  await db.exec(workspace.slice(workspace.indexOf('create table if not exists public.patient_procedure_records')));
  await db.exec(`insert into patient_procedure_records (clinic_id, patient_id, procedure_type)
    values ('${clinic}', '${patient}', 'Existing'), ('${otherClinic}', '${patient}', 'Other clinic')`);
  await db.exec(await migration('20261117202725_patient_procedure_mutations'));

  await db.exec('set role authenticated');
  const insert = await db.query(`insert into patient_procedure_records (clinic_id, patient_id, procedure_type)
    values ($1, $2, 'Second') returning id`, [clinic, patient]);
  assert.equal(insert.rows.length, 1);
  assert.deepEqual((await db.query("update patient_procedure_records set follow_up = 'Denied' returning id")).rows, []);
  assert.deepEqual((await db.query('delete from patient_procedure_records returning id')).rows, []);

  await db.exec("set test.permission = 'clinical.edit'");
  const edited = await db.query(`update patient_procedure_records set follow_up = 'Updated'
    where procedure_type = 'Existing' returning follow_up, created_by`);
  assert.deepEqual(edited.rows, [{ follow_up: 'Updated', created_by: actor }]);
  const zones = [
    { name: 'Frente', dose: 'Detalle previo' },
    { kind: 'face-points-v1', name: 'Puntos del rostro', dose: '2', points: [
      { id: 'point-a', x: 172.125, y: 112, amount: '2.5', unit: 'U', zone: 'Frente', note: '' },
      { id: 'point-b', x: 183.5, y: 115, amount: '1', unit: 'U', zone: 'Frente', note: 'Seguimiento' },
    ] },
  ];
  await db.query("update patient_procedure_records set zones = $1 where procedure_type = 'Existing'", [JSON.stringify(zones)]);
  const reloaded = await db.query("select zones from patient_procedure_records where procedure_type = 'Existing'");
  assert.deepEqual(reloaded.rows[0].zones, zones);
  await assert.rejects(db.query('update patient_procedure_records set clinic_id = $1', [otherClinic]), { code: '42501' });
  assert.deepEqual((await db.query('delete from patient_procedure_records where clinic_id = $1 returning id', [otherClinic])).rows, []);
  assert.equal((await db.query("delete from patient_procedure_records where procedure_type = 'Existing' returning id")).rows.length, 1);
  await db.exec('reset role');
  assert.deepEqual((await db.query('select procedure_type from patient_procedure_records order by procedure_type')).rows,
    [{ procedure_type: 'Other clinic' }, { procedure_type: 'Second' }]);
});
