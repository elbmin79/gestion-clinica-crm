import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const clinic = '10000000-0000-0000-0000-000000000001';
const otherClinic = '10000000-0000-0000-0000-000000000002';
const admin = '20000000-0000-0000-0000-000000000001';
const recipient = '20000000-0000-0000-0000-000000000002';
const stranger = '20000000-0000-0000-0000-000000000003';

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key,email text,encrypted_password text,email_confirmed_at timestamptz,deleted_at timestamptz,invited_at timestamptz,last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email',current_setting('request.jwt.claim.email',true)) $$;
    create table public.clinics(id uuid primary key);
    create table public.clinic_memberships(clinic_id uuid references public.clinics,user_id uuid references auth.users,role text,permissions jsonb default '{}',primary key(clinic_id,user_id));
    create function private.has_clinic_access(c uuid,r text[]) returns boolean language sql stable security definer as $$
      select exists(select 1 from public.clinic_memberships where clinic_id=c and user_id=auth.uid() and role=any(r)) $$;
    grant usage on schema auth,private to authenticated,service_role;
    grant execute on function private.has_clinic_access(uuid,text[]) to authenticated;
    insert into public.clinics values('${clinic}'),('${otherClinic}');
    insert into auth.users(id,email,encrypted_password,email_confirmed_at) values('${admin}','admin@example.com','hash',now()),('${recipient}','new@example.com','',now()),('${stranger}','other@example.com','hash',now());
    insert into public.clinic_memberships values('${clinic}','${admin}','admin','{}'),('${otherClinic}','${stranger}','admin','{}');`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261031174240_clinic_invitations.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/20261031175123_invitation_password_completion.sql', import.meta.url),'utf8'));
  return db;
}

async function prepare(db, inviter = admin, email = 'new@example.com') {
  return (await db.query('select public.prepare_clinic_invitation($1,$2,$3,$4,$5) value',[clinic,inviter,email,'clinician',JSON.stringify({ 'clinical.create': true })])).rows[0].value;
}
async function accept(db, id, user = recipient) {
  return db.query('select public.accept_clinic_invitation($1,$2) value',[id,user]);
}

test('invitation database enforces password, identity, atomic activation, permissions and replay safety', async t => {
  const db = await setup(); t.after(() => db.close());
  await assert.rejects(prepare(db,stranger),/admin_required/);
  const invitation = await prepare(db);
  assert.equal(invitation.requires_password,true);
  assert.equal((await db.query('select * from public.clinic_memberships where user_id=$1',[recipient])).rows.length,0);
  await assert.rejects(prepare(db),/invite_rate_limited/);
  await assert.rejects(accept(db,invitation.id,stranger),/invitation_not_found/);
  await assert.rejects(accept(db,invitation.id),/password_required/);
  await db.query("update auth.users set encrypted_password='newhash' where id=$1",[recipient]);
  await assert.rejects(accept(db,invitation.id),/password_required/);
  await db.query('update public.clinic_invitations set password_set_at=now() where id=$1',[invitation.id]);
  await accept(db,invitation.id);
  await accept(db,invitation.id);
  const rows = (await db.query('select * from public.clinic_memberships where user_id=$1',[recipient])).rows;
  assert.equal(rows.length,1); assert.equal(rows[0].clinic_id,clinic); assert.equal(rows[0].role,'clinician');
  assert.deepEqual(rows[0].permissions,{ 'clinical.create': true });
  await assert.rejects(prepare(db),/already_member/);
});

test('revoked, expired, failed and unconfirmed invitations never activate; inviter must still be admin', async t => {
  const db = await setup(); t.after(() => db.close());
  const invitation = await prepare(db);
  await db.query("update auth.users set encrypted_password='hash' where id=$1",[recipient]);
  for (const change of ["status='revoked'","expires_at=now()-interval '1 second'","delivery_status='failed'"]) {
    await db.exec(`update public.clinic_invitations set ${change} where id='${invitation.id}'`);
    await assert.rejects(accept(db,invitation.id),/invitation_unavailable/);
    await db.exec(`update public.clinic_invitations set status='pending',expires_at=now()+interval '1 day',delivery_status='sent' where id='${invitation.id}'`);
  }
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[recipient]);
  await assert.rejects(accept(db,invitation.id),/invitation_not_found/);
  await db.query('update auth.users set email_confirmed_at=now() where id=$1',[recipient]);
  await db.query('update public.clinic_invitations set password_set_at=now() where id=$1',[invitation.id]);
  await db.query("update public.clinic_memberships set role='receptionist' where user_id=$1",[admin]);
  await assert.rejects(accept(db,invitation.id),/inviter_no_longer_admin/);
  assert.equal((await db.query('select * from public.clinic_memberships where user_id=$1',[recipient])).rows.length,0);
});

test('resends preserve invitation identity, refresh expiry and never skip unfinished password setup', async t => {
  const db = await setup(); t.after(() => db.close());
  const initial = await prepare(db);
  await db.exec("update public.clinic_invitations set last_sent_at=now()-interval '2 minutes',expires_at=now()-interval '1 day'");
  await db.query("update auth.users set encrypted_password='existinghash' where id=$1",[recipient]);
  const resent = await prepare(db);
  assert.equal(resent.id,initial.id); assert.equal(resent.requires_password,true); assert.equal(resent.email_confirmed,true);
  await assert.rejects(accept(db,resent.id),/password_required/);
  await db.query('update public.clinic_invitations set password_set_at=now() where id=$1',[resent.id]);
  await accept(db,resent.id);
  assert.equal((await db.query('select encrypted_password from auth.users where id=$1',[recipient])).rows[0].encrypted_password,'existinghash');
});

test('existing accounts keep their password; unopened Auth invites still require setup despite a generated hash', async t => {
  const db = await setup(); t.after(() => db.close());
  const existing = await prepare(db,admin,'other@example.com');
  assert.equal(existing.requires_password,false);
  await accept(db,existing.id,stranger);
  await db.query("update auth.users set encrypted_password='generated-random-hash',invited_at=now(),last_sign_in_at=null where id=$1",[recipient]);
  const unopened = await prepare(db);
  assert.equal(unopened.requires_password,true);
  await assert.rejects(accept(db,unopened.id),/password_required/);
});

test('RLS isolates invitations and authenticated clients cannot mutate or activate them directly', async t => {
  const db = await setup(); t.after(() => db.close());
  const invitation = await prepare(db);
  const identity = async (id,email) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.email',$2,false)",[id,email]);
    await db.exec('set role authenticated');
  };
  await identity(stranger,'other@example.com');
  assert.equal((await db.query('select * from public.clinic_invitations')).rows.length,0);
  await identity(recipient,'new@example.com');
  assert.equal((await db.query('select * from public.clinic_invitations')).rows.length,1);
  await assert.rejects(accept(db,invitation.id),/permission denied/);
  await assert.rejects(prepare(db),/permission denied/);
  await assert.rejects(db.exec("update public.clinic_invitations set role='admin'"),/permission denied/);
  await identity(admin,'admin@example.com');
  assert.equal((await db.query('select * from public.clinic_invitations')).rows.length,1);
});
