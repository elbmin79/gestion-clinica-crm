import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createClinicAvailabilityStore } from './clinic-availability.js';

const migrationUrl = new URL('../../../supabase/migrations/20261030072515_clinic_availability.sql', import.meta.url);
const policyMigrationUrl = new URL('../../../supabase/migrations/20261030072602_clinic_availability_policy_tuneup.sql', import.meta.url);

async function setupAvailabilityDatabase() {
  const db = new PGlite();
  const migration = await readFile(migrationUrl, 'utf8');
  const policyMigration = await readFile(policyMigrationUrl, 'utf8');
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.clinics(id uuid primary key default gen_random_uuid());
    create table public.clinic_memberships(clinic_id uuid not null, user_id uuid not null, role text not null, primary key(clinic_id,user_id));
    create table public.branches(id uuid primary key, clinic_id uuid not null, unique(id,clinic_id));
    create table public.clinic_providers(id uuid primary key, clinic_id uuid not null, unique(id,clinic_id));
    create table public.appointments(
      id uuid primary key default gen_random_uuid(), clinic_id uuid not null, patient_id uuid not null,
      provider_id uuid not null, branch_id uuid not null, starts_at timestamptz not null,
      ends_at timestamptz not null, status text not null default 'pending'
    );
    create function private.has_clinic_access(target_clinic_id uuid, allowed_roles text[] default null)
    returns boolean language sql stable security definer set search_path = '' as $$
      select exists(select 1 from public.clinic_memberships m where m.clinic_id=target_clinic_id
        and m.user_id=auth.uid() and (allowed_roles is null or m.role=any(allowed_roles)))
    $$;
    grant select, insert, update, delete on public.appointments to authenticated;
    ${migration}
    ${policyMigration}
  `);
  return db;
}

test('availability migration enforces default provider conflicts and permits configured overlaps', async t => {
  const db = await setupAvailabilityDatabase(); t.after(() => db.close());
  const clinic = '10000000-0000-0000-0000-000000000001';
  const provider = '20000000-0000-0000-0000-000000000001';
  const branch = '30000000-0000-0000-0000-000000000001';
  const patientOne = '40000000-0000-0000-0000-000000000001';
  const patientTwo = '40000000-0000-0000-0000-000000000002';
  await db.exec(`insert into public.clinics(id) values ('${clinic}');
    insert into public.clinic_providers(id,clinic_id) values ('${provider}','${clinic}');
    insert into public.branches(id,clinic_id) values ('${branch}','${clinic}');`);
  const insertAppointment = (patient, time='10:00') => db.query(`insert into public.appointments(clinic_id,patient_id,provider_id,branch_id,starts_at,ends_at)
    values ($1,$2,$3,$4,('2026-11-02 ' || $5 || ':00+00')::timestamptz,('2026-11-02 ' || $5 || ':30+00')::timestamptz)`, [clinic,patient,provider,branch,time]);
  await insertAppointment(patientOne);
  await assert.rejects(insertAppointment(patientTwo), /El profesional ya tiene una cita/);
  await db.query('insert into public.clinic_availability_settings(clinic_id,allow_provider_overlaps) values ($1,true)', [clinic]);
  await insertAppointment(patientTwo);
  await assert.rejects(db.query(`insert into public.clinic_availability_settings(clinic_id,allow_provider_overlaps) values ($1,false)
    on conflict(clinic_id) do update set allow_provider_overlaps=excluded.allow_provider_overlaps`,[clinic]), /No puedes desactivar/);
  await db.exec("update public.appointments set status='cancelled' where patient_id='40000000-0000-0000-0000-000000000002'");
  await db.query(`update public.clinic_availability_settings set allow_provider_overlaps=false where clinic_id=$1`,[clinic]);
});

test('availability blocks enforce their clinic, branch, or provider scope and cannot cover booked appointments', async t => {
  const db = await setupAvailabilityDatabase(); t.after(() => db.close());
  const clinic = '10000000-0000-0000-0000-000000000001';
  const provider = '20000000-0000-0000-0000-000000000001';
  const providerTwo = '20000000-0000-0000-0000-000000000002';
  const branch = '30000000-0000-0000-0000-000000000001';
  const branchTwo = '30000000-0000-0000-0000-000000000002';
  const patient = '40000000-0000-0000-0000-000000000001';
  await db.exec(`insert into public.clinics(id) values ('${clinic}');
    insert into public.clinic_providers(id,clinic_id) values ('${provider}','${clinic}'),('${providerTwo}','${clinic}');
    insert into public.branches(id,clinic_id) values ('${branch}','${clinic}'),('${branchTwo}','${clinic}');`);
  await db.query(`insert into public.clinic_availability_blocks(clinic_id,title,scope,provider_id,starts_at,ends_at)
    values ($1,'Comida','provider',$2,'2026-11-02 10:00+00','2026-11-02 11:00+00')`, [clinic,provider]);
  const appointment = (clinician, location, start='10:15') => db.query(`insert into public.appointments(clinic_id,patient_id,provider_id,branch_id,starts_at,ends_at)
    values ($1,$2,$3,$4,('2026-11-02 ' || $5 || ':00+00')::timestamptz,('2026-11-02 ' || $5 || ':30+00')::timestamptz)`, [clinic,patient,clinician,location,start]);
  await assert.rejects(appointment(provider, branch), /horario bloqueado/);
  await appointment(providerTwo, branch);
  await assert.rejects(db.query(`insert into public.clinic_availability_blocks(clinic_id,title,starts_at,ends_at)
    values ($1,'Cierre','2026-11-02 10:00+00','2026-11-02 11:00+00')`, [clinic]), /horario que ya tiene citas/);
});

test('availability store persists settings and date ranges in the clinic timezone', async () => {
  const calls = [];
  const block = { id: 'block-id', title: 'Vacaciones', scope: 'clinic', branch_id: null, provider_id: null, starts_at: '2026-11-03T17:00:00.000Z', ends_at: '2026-11-03T18:00:00.000Z' };
  const client = {
    from(table) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => Promise.resolve({ data: [block], error: null }),
        maybeSingle: async () => ({ data: { allow_provider_overlaps: true }, error: null }),
        upsert: (values, options) => { calls.push({ table, operation: 'upsert', values, options }); return Promise.resolve({ error: null }); },
        insert: values => { calls.push({ table, operation: 'insert', values }); return { select: () => ({ single: async () => ({ data: { ...values, ...block }, error: null }) }) }; },
        delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      };
      return builder;
    },
  };
  const store = createClinicAvailabilityStore({ clientFactory: () => client });
  const loaded = await store.load('clinic-id');
  assert.equal(loaded.allowProviderOverlaps, true);
  assert.equal(loaded.blocks[0].id, 'block-id');
  await store.saveProviderOverlaps('clinic-id', false);
  const created = await store.createBlock('clinic-id', { title: ' Vacaciones ', scope: 'clinic', startDate: '2026-11-03', startTime: '10:00', endDate: '2026-11-03', endTime: '11:00' }, 'America/Tijuana');
  assert.equal(created.id, 'block-id');
  assert.equal(calls[0].values.allow_provider_overlaps, false);
  assert.equal(calls[1].values.title, 'Vacaciones');
  assert.equal(calls[1].values.starts_at, '2026-11-03T18:00:00.000Z');
  assert.equal(calls[1].values.ends_at, '2026-11-03T19:00:00.000Z');
  await assert.rejects(store.createBlock('clinic-id', { title: 'Invalid', startDate: '2026-11-03', startTime: '11:00', endDate: '2026-11-03', endTime: '10:00' }, 'America/Tijuana'), /hora de fin/);
});

test('availability RLS limits rule changes to admins and block management to clinic staff', async t => {
  const db = await setupAvailabilityDatabase(); t.after(() => db.close());
  const clinic = '10000000-0000-0000-0000-000000000001';
  const otherClinic = '10000000-0000-0000-0000-000000000002';
  const admin = '50000000-0000-0000-0000-000000000001';
  const clinician = '50000000-0000-0000-0000-000000000002';
  const outsider = '50000000-0000-0000-0000-000000000003';
  const provider = '20000000-0000-0000-0000-000000000001';
  await db.exec(`insert into public.clinics(id) values ('${clinic}'),('${otherClinic}');
    insert into public.clinic_providers(id,clinic_id) values ('${provider}','${clinic}');
    insert into public.clinic_memberships(clinic_id,user_id,role) values ('${clinic}','${admin}','admin'),('${clinic}','${clinician}','clinician');`);
  const asUser = async user => { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec('set role authenticated'); };
  const reset = () => db.exec('reset role');
  await asUser(admin);
  await db.query('insert into public.clinic_availability_settings(clinic_id,allow_provider_overlaps) values ($1,false)', [clinic]);
  await reset();
  await asUser(clinician);
  assert.equal((await db.query('select clinic_id from public.clinic_availability_settings')).rows.length, 1);
  const deniedUpdate = await db.query('update public.clinic_availability_settings set allow_provider_overlaps=true where clinic_id=$1', [clinic]);
  assert.equal(deniedUpdate.affectedRows, 0);
  await db.query(`insert into public.clinic_availability_blocks(clinic_id,title,scope,provider_id,starts_at,ends_at)
    values ($1,'Bloqueo profesional','provider',$2,'2026-12-02 10:00+00','2026-12-02 11:00+00')`, [clinic,provider]);
  await reset();
  await asUser(outsider);
  assert.equal((await db.query('select clinic_id from public.clinic_availability_settings')).rows.length, 0);
  await assert.rejects(db.query(`insert into public.clinic_availability_blocks(clinic_id,title,starts_at,ends_at)
    values ($1,'No autorizado','2026-12-02 10:00+00','2026-12-02 11:00+00')`, [clinic]));
  await reset();
});
