import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('last-admin guard protects existing clinics but permits whole-clinic cascades',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 const original=await readFile(new URL('../../supabase/migrations/20261029080207_admin_manage_clinic_memberships.sql',import.meta.url),'utf8');
 const foundation=await readFile(new URL('../../supabase/migrations/20261028221430_202610260001_clinic_crm.sql',import.meta.url),'utf8');
 const auditFix=await readFile(new URL('../../supabase/migrations/20261030204929_skip_audit_for_deleted_clinic_cascades.sql',import.meta.url),'utf8');
 const fix=await readFile(new URL('../../supabase/migrations/20261030204811_allow_clinic_delete_admin_cascade.sql',import.meta.url),'utf8');
 await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table public.clinics(id uuid primary key);create table public.clinic_memberships(clinic_id uuid references public.clinics(id) on delete cascade,user_id integer,role text);
 create table public.audit_events(id bigint generated always as identity,clinic_id uuid not null references public.clinics(id) on delete cascade,actor_id uuid,entity text,action text,record_id text);
 ${foundation.slice(foundation.indexOf('create function private.capture_audit_event()'),foundation.indexOf('create function private.prevent_clinic_change()'))}
 create trigger test_membership_audit after insert or update or delete on public.clinic_memberships for each row execute function private.capture_audit_event();
 ${original.slice(original.indexOf('create or replace function private.prevent_last_clinic_admin_removal()'))}
 insert into public.clinics values('10000000-0000-0000-0000-000000000001');insert into public.clinic_memberships values('10000000-0000-0000-0000-000000000001',1,'admin');`);
 await assert.rejects(db.exec("delete from public.clinics where id='10000000-0000-0000-0000-000000000001'"),/clinic_must_keep_admin/);
 await db.exec(fix);
 await assert.rejects(db.exec('delete from public.clinic_memberships where user_id=1'),/clinic_must_keep_admin/);
 await assert.rejects(db.exec("update public.clinic_memberships set role='receptionist' where user_id=1"),/clinic_must_keep_admin/);
 await db.exec("insert into public.clinic_memberships values('10000000-0000-0000-0000-000000000001',2,'admin');delete from public.clinic_memberships where user_id=2;");
 assert.equal((await db.query("select count(*)::int n from public.audit_events where action='DELETE'")).rows[0].n,1,'ordinary membership removal remains audited');
 await assert.rejects(db.exec("delete from public.clinics where id='10000000-0000-0000-0000-000000000001'"),/foreign key/);
 await db.exec(auditFix);
 await db.exec("delete from public.clinics where id='10000000-0000-0000-0000-000000000001'");
 assert.equal((await db.query('select count(*)::int n from public.clinic_memberships')).rows[0].n,0);
});

test('Auth deletion can remove an admin account while a clinic still has another admin', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const loadMigration = name => readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
  const [lastAdminGuard, permissions, fix] = await Promise.all([
    loadMigration('20261030204811_allow_clinic_delete_admin_cascade'),
    loadMigration('20261031074344_custom_clinic_permissions'),
    loadMigration('20261110043652_allow_auth_admin_account_deletion'),
  ]);
  const clinic = '10000000-0000-0000-0000-000000000001';
  const departing = '20000000-0000-0000-0000-000000000001';
  const remaining = '20000000-0000-0000-0000-000000000002';
  await db.exec(`
    create schema auth;
    create schema private;
    create table auth.users(id uuid primary key);
    create table public.clinics(id uuid primary key);
    create table public.clinic_memberships(
      clinic_id uuid references public.clinics(id),
      user_id uuid references auth.users(id) on delete cascade,
      role text,
      permissions jsonb default '{}',
      primary key (clinic_id, user_id)
    );
    ${lastAdminGuard}
    create trigger prevent_last_clinic_admin_removal
    before delete or update of role on public.clinic_memberships
    for each row execute function private.prevent_last_clinic_admin_removal();
    ${permissions.slice(permissions.indexOf('create or replace function private.prevent_clinic_admin_membership_changes()'), permissions.indexOf('for each row execute function private.prevent_clinic_admin_membership_changes();') + 'for each row execute function private.prevent_clinic_admin_membership_changes();'.length)}
    insert into auth.users values ('${departing}'), ('${remaining}');
    insert into public.clinics values ('${clinic}');
    insert into public.clinic_memberships(clinic_id, user_id, role)
    values ('${clinic}', '${departing}', 'admin'), ('${clinic}', '${remaining}', 'admin');
  `);
  const deleteAuthUser = id => db.query('delete from auth.users where id = $1', [id]);
  await assert.rejects(deleteAuthUser(departing), /No se puede revocar/);
  await db.exec(fix);
  await assert.rejects(db.query('delete from public.clinic_memberships where user_id = $1', [departing]), /No se puede revocar/);
  await assert.rejects(db.query("update public.clinic_memberships set permissions = '{\"changed\":true}' where user_id = $1", [departing]), /no se pueden modificar/);
  await deleteAuthUser(departing);
  const memberships = () => db.query('select user_id from public.clinic_memberships');
  assert.deepEqual((await memberships()).rows, [{user_id: remaining}]);
  await assert.rejects(deleteAuthUser(remaining), /clinic_must_keep_admin/);
  assert.deepEqual((await memberships()).rows, [{user_id: remaining}]);
  assert.deepEqual((await db.query('select id from auth.users')).rows, [{id: remaining}]);
});
