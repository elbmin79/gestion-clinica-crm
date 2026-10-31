// Opt-in integration fixture. Creates only synthetic users/clinic; never sends email.
// node --env-file=.env.local scripts/invitation-smoke.mjs setup|cleanup
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { permissionsForPreset } from '../src/lib/clinic-permissions.js';

const fixturePath = new URL('../.invitation-qa/fixture.json', import.meta.url);
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const check = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; };

if (process.argv[2] === 'new-recipient') {
  const fixture = JSON.parse(await readFile(fixturePath,'utf8'));
  fixture.email = `codex-invite-${randomUUID()}@example.invalid`;
  const invitation = check(await client.rpc('prepare_clinic_invitation', { p_clinic:fixture.clinicId,p_inviter:fixture.adminId,p_email:fixture.email,p_role:'clinician',p_permissions:permissionsForPreset('clinician') }), 'prepare new test invitation');
  fixture.invitationId = invitation.id;
  const link = check(await client.auth.admin.generateLink({type:'invite',email:fixture.email}), 'generate new test invitation');
  fixture.userId = link.user.id; fixture.userIds.push(link.user.id); fixture.tokenHash = link.properties.hashed_token;
  fixture.verificationType = 'invite';
  check(await client.from('clinic_invitations').update({delivery_status:'sent'}).eq('id',invitation.id),'mark synthetic delivery');
  await writeFile(fixturePath,JSON.stringify(fixture),'utf8');
  console.log('Fresh synthetic invite created; no email sent.');
} else if (process.argv[2] === 'refresh') {
  const fixture = JSON.parse(await readFile(fixturePath,'utf8'));
  const link = check(await client.auth.admin.generateLink({ type:'magiclink',email:fixture.email }), 'refresh test sign-in');
  fixture.tokenHash = link.properties.hashed_token;
  fixture.verificationType = 'email';
  await writeFile(fixturePath,JSON.stringify(fixture),'utf8');
  console.log('Synthetic test sign-in refreshed; no email sent.');
} else if (process.argv[2] === 'cleanup') {
  const fixture = JSON.parse(await readFile(fixturePath,'utf8'));
  // The persisted fixture is generated here, never inferred from production records.
  if (!fixture.email.startsWith('codex-invite-') || !fixture.adminEmail.startsWith('codex-invite-admin-')) throw new Error('Unexpected fixture');
  check(await client.from('clinics').delete().eq('id',fixture.clinicId).eq('name',fixture.clinicName), 'delete synthetic clinic');
  for (const id of fixture.userIds) check(await client.auth.admin.deleteUser(id), 'delete synthetic user');
  await unlink(fixturePath);
  console.log('Synthetic invitation clinic/users removed.');
} else if (process.argv[2] === 'setup') {
  try { await readFile(fixturePath); throw new Error('Fixture already exists; clean it up first.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const suffix = randomUUID();
  const fixture = { clinicId: randomUUID(), clinicName: `Codex invitation test ${suffix}`, userIds: [],
    email: `codex-invite-${suffix}@example.invalid`, adminEmail: `codex-invite-admin-${suffix}@example.invalid`,
    password: `Test-${randomBytes(18).toString('hex')}` };
  await mkdir(new URL('../.invitation-qa/',import.meta.url),{ recursive:true });
  const save = () => writeFile(fixturePath,JSON.stringify(fixture),'utf8');
  await save();
  const admin = check(await client.auth.admin.createUser({ email: fixture.adminEmail, password: fixture.password, email_confirm: true }), 'create synthetic admin').user;
  fixture.adminId = admin.id; fixture.userIds.push(admin.id); await save();
  check(await client.from('clinics').insert({ id: fixture.clinicId, name: fixture.clinicName }), 'create synthetic clinic');
  check(await client.from('clinic_memberships').insert({ clinic_id: fixture.clinicId,user_id: admin.id,role:'admin',permissions:permissionsForPreset('admin') }), 'assign synthetic admin');
  const invitation = check(await client.rpc('prepare_clinic_invitation', { p_clinic:fixture.clinicId,p_inviter:admin.id,p_email:fixture.email,p_role:'clinician',p_permissions:permissionsForPreset('clinician') }), 'prepare invitation');
  fixture.invitationId = invitation.id;
  const link = check(await client.auth.admin.generateLink({ type:'invite',email:fixture.email }), 'generate invitation without email');
  fixture.userId = link.user.id; fixture.userIds.push(link.user.id); fixture.tokenHash = link.properties.hashed_token;
  check(await client.from('clinic_invitations').update({ delivery_status:'sent' }).eq('id',invitation.id), 'mark synthetic delivery');
  await save();
  console.log('Synthetic invitation fixture ready; no email sent.');
} else throw new Error('Use setup or cleanup');
