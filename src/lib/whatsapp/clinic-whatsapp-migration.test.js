import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('mock WhatsApp migration persists clinic and branch settings with admin-only writes', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const migration = await readFile(new URL('../../../supabase/migrations/20261029225620_clinic_whatsapp_mock_setup.sql', import.meta.url), 'utf8');
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    create table public.clinics(id uuid primary key, name text);
    create table public.branches(id uuid, clinic_id uuid, name text, primary key(id,clinic_id));
    create table public.clinic_memberships(clinic_id uuid, user_id uuid, role text);
    create function private.has_clinic_access(target uuid, allowed text[] default null) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.clinic_memberships m where m.clinic_id=target and m.user_id=auth.uid() and (allowed is null or m.role=any(allowed)))
    $$;
    create table public.appointments(id uuid primary key, clinic_id uuid, patient_id uuid, branch_id uuid, provider_id uuid, starts_at timestamptz, status text, service text default 'Service', reminder_schedule_version integer default 1, deposit_required boolean default false, deposit_amount numeric default 0);
    create table public.patients(id uuid primary key, clinic_id uuid, full_name text, phone text, appointment_whatsapp_opt_in boolean default true);
    create table public.clinic_providers(id uuid primary key, clinic_id uuid, name text);
    create table public.appointment_reminders(id uuid primary key, clinic_id uuid, appointment_id uuid, kind text, scheduled_at timestamptz, status text, attempt_count integer default 0, schedule_version integer default 1, provider_message_id text, last_error text);
    create table public.appointment_confirmation_requests(id uuid primary key, clinic_id uuid, appointment_id uuid, scheduled_at timestamptz, status text, schedule_version integer, provider_message_id text);
    create table public.appointment_confirmation_replies(provider_message_id text primary key, context_message_id text, action text, outcome text);
    create table public.payments(appointment_id uuid, clinic_id uuid, direction text, amount numeric);
    create table public.patient_activities(clinic_id uuid, patient_id uuid, activity_type text, note text, author_id uuid);
    create function public.get_appointment_reminders(uuid,timestamptz,timestamptz) returns table(id uuid) language sql as $$ select null::uuid $$;
    ${migration}`);
  assert.equal((await db.query("select to_regprocedure('public.get_appointment_reminders(uuid,timestamptz,timestamptz)') is not null preserved")).rows[0].preserved, true);

  const clinic = '10000000-0000-0000-0000-000000000001';
  const other = '10000000-0000-0000-0000-000000000002';
  const admin = '20000000-0000-0000-0000-000000000001';
  const receptionist = '20000000-0000-0000-0000-000000000002';
  const branch = '30000000-0000-0000-0000-000000000001';
  await db.exec(`insert into public.clinics values ('${clinic}','Clinic'),('${other}','Other');
    insert into public.branches values ('${branch}','${clinic}','Branch');
    insert into public.clinic_memberships values ('${clinic}','${admin}','admin'),('${clinic}','${receptionist}','receptionist');`);
  const session = async (user, role = 'authenticated') => db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[user || '', role]);
  const save = async (user, senders, fallback = false) => {
    await session(user); await db.exec('set role authenticated');
    try {
      return await db.query(`select public.save_clinic_whatsapp_settings($1,$2,$3::jsonb,$4::jsonb) saved`, [clinic, fallback,
        JSON.stringify({ confirmation_2d: true, reminder_1d: true, reminder_5h: false }), JSON.stringify(senders)]);
    } finally { await db.exec('reset role'); }
  };
  await t.test('admin saves branch senders and explicit default fallback atomically', async () => {
    const senders = [
      { sender_key: 'mock:east', display_label: 'East', branch_id: branch, is_default: false, active: true },
      { sender_key: 'mock:default', display_label: 'Default', branch_id: null, is_default: true, active: true },
    ];
    assert.equal((await save(admin, senders, true)).rows[0].saved, true);
    assert.equal((await db.query('select count(*)::int count from public.clinic_whatsapp_senders where clinic_id=$1',[clinic])).rows[0].count, 2);
    assert.equal((await db.query('select allow_default_fallback from public.clinic_whatsapp_configurations where clinic_id=$1',[clinic])).rows[0].allow_default_fallback, true);
    await save(admin, [senders[0]], false);
    const senderCounts = (await db.query('select count(*)::int total, count(*) filter (where active)::int active from public.clinic_whatsapp_senders where clinic_id=$1',[clinic])).rows[0];
    assert.deepEqual(senderCounts, { total: 2, active: 1 });
  });
  await t.test('rejects non-admin, cross-tenant branches, and Meta sender IDs', async () => {
    await assert.rejects(save(receptionist, []), /administrators/);
    await assert.rejects(save(admin, [{ sender_key: 'mock:foreign', display_label: 'Foreign', branch_id: other, is_default: false, active: true }]), /foreign key|violates foreign key/i);
    await assert.rejects(save(admin, [{ sender_key: 'mock:bad', display_label: 'Bad', meta_phone_number_id: '123456789', is_default: false, active: true }]), /Meta phone-number IDs are disabled/);
    assert.equal((await db.query("select has_function_privilege('anon','public.save_clinic_whatsapp_settings(uuid,boolean,jsonb,jsonb)','execute') allowed")).rows[0].allowed, false);
    await session(admin); await db.exec('set role authenticated');
    try {
      await assert.rejects(db.query('select public.save_clinic_whatsapp_settings($1,false,\'{}\'::jsonb,\'[]\'::jsonb)', [clinic]), /Invalid simulated template readiness/);
    } finally { await db.exec('reset role'); }
  });
  await t.test('reminder ledger identifies mock results without returning patient contact data', async () => {
    const patient = '50000000-0000-0000-0000-000000000001';
    const provider = '40000000-0000-0000-0000-000000000001';
    const appointment = '60000000-0000-0000-0000-000000000001';
    const reminder = '70000000-0000-0000-0000-000000000001';
    await db.exec(`insert into public.patients values ('${patient}','${clinic}','Test Patient','+525550102030',true);
      insert into public.clinic_providers values ('${provider}','${clinic}','Provider');
      insert into public.appointments(id,clinic_id,patient_id,branch_id,provider_id,starts_at,status,reminder_schedule_version)
        values ('${appointment}','${clinic}','${patient}','${branch}','${provider}',now()+interval '2 days','confirmed',1);
      insert into public.appointment_reminders(id,clinic_id,appointment_id,kind,scheduled_at,status,attempt_count,schedule_version,provider_message_id)
        values ('${reminder}','${clinic}','${appointment}','reminder_1d',now()+interval '1 day','sent',1,1,'mock:synthetic');`);
    await session(admin); await db.exec('set role authenticated');
    try {
      const result = await db.query('select * from public.get_appointment_reminders_v2($1,now(),now()+interval \'3 days\')',[clinic]);
      assert.equal(result.rows[0].simulated, true);
      assert.equal('phone' in result.rows[0], false);
    } finally { await db.exec('reset role'); }
  });
  await t.test('server recheck blocks opt-out, invalid phone, unconfirmed and expired appointments', async () => {
    const patient = '50000000-0000-0000-0000-000000000002';
    const provider = '40000000-0000-0000-0000-000000000001';
    const appointment = '60000000-0000-0000-0000-000000000002';
    const reminder = '70000000-0000-0000-0000-000000000002';
    await db.exec(`insert into public.patients values ('${patient}','${clinic}','Dispatch Patient','+525550102030',true);
      insert into public.appointments(id,clinic_id,patient_id,branch_id,provider_id,starts_at,status,reminder_schedule_version)
        values ('${appointment}','${clinic}','${patient}','${branch}','${provider}',now()+interval '2 days','confirmed',1);
      insert into public.appointment_reminders(id,clinic_id,appointment_id,kind,scheduled_at,status,attempt_count,schedule_version)
        values ('${reminder}','${clinic}','${appointment}','reminder_1d',now()-interval '1 minute','sending',1,1);`);
    const checked = async () => {
      await session(null, 'service_role'); await db.exec('set role service_role');
      try { return (await db.query('select * from public.get_claimed_reminder_for_dispatch_v2($1)', [reminder])).rows; }
      finally { await db.exec('reset role'); }
    };
    assert.equal((await checked()).length, 1);
    await db.exec(`update public.patients set appointment_whatsapp_opt_in=false where id='${patient}'`);
    assert.equal((await checked()).length, 0);
    await db.exec(`update public.patients set appointment_whatsapp_opt_in=true, phone='5550102030' where id='${patient}'`);
    assert.equal((await checked()).length, 0);
    await db.exec(`update public.patients set phone='+525550102030' where id='${patient}'; update public.appointments set status='pending' where id='${appointment}'`);
    assert.equal((await checked()).length, 0);
    await db.exec(`update public.appointments set status='confirmed', starts_at=now()-interval '1 minute' where id='${appointment}'`);
    assert.equal((await checked()).length, 0);
    await db.exec(`update public.appointments set starts_at=now()+interval '2 days', reminder_schedule_version=2 where id='${appointment}'`);
    assert.equal((await checked()).length, 0);
  });
});
