import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrationUrl = new URL('../../../supabase/migrations/20261031074344_custom_clinic_permissions.sql', import.meta.url);
const clinicTables = [
  'appointment_confirmation_requests','appointment_reminders','appointments','botox_treatment_records',
  'branches','businesses','clinic_availability_blocks','clinic_availability_settings','clinic_providers','provider_branches',
  'clinic_service_branches','clinic_service_providers','clinic_services','document_templates',
  'patient_activities','patient_diagnoses','patient_document_files','patient_documents','patient_encounters',
  'patients','payments','public_agenda_hours','public_agenda_offers','public_agenda_settings','public_booking_requests',
  'clinic_whatsapp_configurations','clinic_whatsapp_conversations','clinic_whatsapp_messages',
  'clinic_whatsapp_sender_branches','clinic_whatsapp_senders',
];

async function setupDatabase() {
  const db = new PGlite();
  const migration = await readFile(migrationUrl, 'utf8');
  const tableSql = clinicTables.map(table => {
    const whatsapp = table.startsWith('clinic_whatsapp_');
    const roleScoped = ['patients', 'appointments'].includes(table)
      ? "array['admin','clinician','receptionist']"
      : table === 'payments' ? "array['admin','receptionist','billing']" : 'null';
    const legacyName = table === 'clinic_whatsapp_configurations' ? 'clinic_whatsapp_settings_member_read'
      : table === 'clinic_whatsapp_conversations' ? 'clinic_whatsapp_conversations_staff_read'
        : table === 'clinic_whatsapp_messages' ? 'clinic_whatsapp_messages_staff_read'
          : table === 'clinic_whatsapp_sender_branches' ? 'clinic_whatsapp_sender_branches_member_read' : 'clinic_whatsapp_senders_member_read';
    return `create table public.${table}(id uuid primary key default gen_random_uuid(), clinic_id uuid not null, user_id uuid, patient_id uuid, provider_id uuid, branch_id uuid, business_id uuid, created_by uuid, author_id uuid, uploaded_by uuid, storage_path text, direction text, status text, signed_at timestamptz, signed_by uuid, kind text, diagnosis_id uuid, starts_at timestamptz, ends_at timestamptz, service text, modality text, deposit_required boolean, deposit_amount numeric, appointment_id uuid, schedule_version integer, reminder_schedule_version integer, scheduled_at timestamptz, attempt_count integer, full_name text, record_number text, primary_branch_id uuid, primary_provider_id uuid, name text, appointment_whatsapp_opt_in boolean, phone text, provider_mode text, template_content_sids jsonb, notify_whatsapp_messages boolean, notify_whatsapp_confirmations boolean, updated_at timestamptz, accepted_by uuid); alter table public.${table} enable row level security; grant select,insert,update,delete on public.${table} to authenticated; create policy ${whatsapp ? legacyName : `baseline_${table}`} on public.${table} for ${whatsapp ? 'select' : 'all'} to authenticated using ((select private.has_clinic_access(clinic_id,${whatsapp ? "array['admin','receptionist']" : roleScoped})))${whatsapp ? '' : ` with check ((select private.has_clinic_access(clinic_id,${roleScoped})))`};`;
  }).join('\n');
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private; grant usage on schema private to authenticated;
    create schema storage; create table storage.objects(id uuid primary key default gen_random_uuid(),name text,bucket_id text);
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.clinics(id uuid primary key);
    create table public.clinic_memberships(clinic_id uuid not null, user_id uuid not null, role text not null, permissions jsonb not null default '{}'::jsonb, created_at timestamptz default now(), primary key(clinic_id,user_id));
    create function private.has_clinic_access(target_clinic_id uuid, allowed_roles text[] default null)
    returns boolean language sql stable security definer set search_path = '' as $$
      select exists(select 1 from public.clinic_memberships m where m.clinic_id=target_clinic_id and m.user_id=(select auth.uid()) and (allowed_roles is null or m.role=any(allowed_roles)))
    $$;
    ${tableSql}
    ${migration}
  `);
  return db;
}

test('all clinic members can read core modules; WhatsApp visibility remains per member', async t => {
  const db = await setupDatabase(); t.after(() => db.close());
  const clinic = '10000000-0000-0000-0000-000000000001';
  const billing = '20000000-0000-0000-0000-000000000001';
  const receptionist = '20000000-0000-0000-0000-000000000002';
  const otherClinic = '10000000-0000-0000-0000-000000000002';
  await db.exec(`insert into public.clinics values ('${clinic}'),('${otherClinic}');
    insert into public.clinic_memberships(clinic_id,user_id,role,permissions) values ('${clinic}','${billing}','billing',private.default_clinic_permissions('billing')),('${clinic}','${receptionist}','receptionist',private.default_clinic_permissions('receptionist'));
    insert into public.patients(clinic_id) values ('${clinic}'),('${otherClinic}');
    insert into public.payments(clinic_id) values ('${clinic}');
    insert into public.clinic_whatsapp_messages(clinic_id) values ('${clinic}');`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [billing]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select clinic_id from public.patients')).rows.length, 1);
  assert.equal((await db.query('select clinic_id from public.payments')).rows.length, 1);
  assert.equal((await db.query('select clinic_id from public.clinic_whatsapp_messages')).rows.length, 0);
  await db.exec('reset role');

  await db.query("update public.clinic_memberships set permissions=jsonb_set(jsonb_set(permissions,'{whatsapp.view}','true'::jsonb,true),'{whatsapp.reply}','true'::jsonb,true) where user_id=$1", [billing]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [billing]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select clinic_id from public.clinic_whatsapp_messages')).rows.length, 1);
  assert.equal((await db.query("select private.has_clinic_permission($1,'whatsapp.reply') allowed", [clinic])).rows[0].allowed, true);
  await db.exec('reset role');

  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [receptionist]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select clinic_id from public.clinic_whatsapp_messages')).rows.length, 1);
  await db.exec('reset role');
});

test('saved action permissions block writes and can selectively grant them', async t => {
  const db = await setupDatabase(); t.after(() => db.close());
  const clinic = '10000000-0000-0000-0000-000000000001';
  const billing = '20000000-0000-0000-0000-000000000001';
  await db.exec(`insert into public.clinics values ('${clinic}'); insert into public.clinic_memberships(clinic_id,user_id,role) values ('${clinic}','${billing}','billing');`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [billing]);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('insert into public.patients(clinic_id) values ($1)', [clinic]));
  await db.exec('reset role');
  await db.query("update public.clinic_memberships set permissions=jsonb_set(permissions,'{patients.create}','true'::jsonb,true) where user_id=$1", [billing]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [billing]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('insert into public.patients(clinic_id) values ($1) returning clinic_id', [clinic])).rows.length, 1);
  await db.exec('reset role');
});

test('administrator membership role and permissions cannot be changed or removed', async t => {
  const db = await setupDatabase(); t.after(() => db.close());
  const clinic = '10000000-0000-0000-0000-000000000001';
  const admin = '20000000-0000-0000-0000-000000000001';
  await db.exec(`insert into public.clinics values ('${clinic}'); insert into public.clinic_memberships(clinic_id,user_id,role) values ('${clinic}','${admin}','admin');`);
  await assert.rejects(db.query("update public.clinic_memberships set role='billing' where user_id=$1", [admin]), /administradora/);
  await assert.rejects(db.query('delete from public.clinic_memberships where user_id=$1', [admin]), /administradora/);
});
