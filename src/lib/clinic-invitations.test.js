import test from 'node:test';
import assert from 'node:assert/strict';
import { authLinkDestination, invitationCallbackUrl, validateInvitationInput } from './clinic-invitations.js';
import { deliverClinicInvitation } from './clinic-invitation-delivery.js';
import { permissionsForPreset } from './clinic-permissions.js';

const clinicId = '10000000-0000-0000-0000-000000000001';
const invitationId = '20000000-0000-0000-0000-000000000001';
const input = { clinicId, email: ' New@Example.com ', role: 'clinician', permissions: permissionsForPreset('clinician') };

test('invitation input validates email, role and permissions and normalizes email', () => {
  assert.equal(validateInvitationInput(input).email, 'new@example.com');
  for (const change of [{ email: 'bad' }, { clinicId: 'bad' }, { role: 'owner' }, { permissions: { 'team.manage_access': 'yes' } }, { permissions: { arbitrary: true } }]) {
    assert.ok(validateInvitationInput({ ...input, ...change }).error);
  }
  const url = new URL(invitationCallbackUrl('https://clinic.example', invitationId));
  assert.equal(url.pathname, '/auth/callback');
  assert.equal(url.searchParams.get('next'), `/accept-invite?id=${invitationId}`);
  assert.throws(() => invitationCallbackUrl('http://evil.example', invitationId));
});

test('invite and recovery links always lead to password setup or their invitation', () => {
  for (const type of ['invite','recovery']) {
    assert.equal(authLinkDestination('/', type), '/update-password');
    assert.equal(authLinkDestination('/agenda', type), '/update-password');
    assert.equal(authLinkDestination(`/accept-invite?id=${invitationId}`, type), `/accept-invite?id=${invitationId}`);
  }
  for (const next of ['https://evil.example','//evil.example','/\\evil.example']) assert.equal(authLinkDestination(next, 'email'), '/');
});

function fakeContext({ existing = false, confirmed = false, prepareError = null, sendError = null, throws = false } = {}) {
  const calls = [];
  const query = { update(value) { calls.push(['update',value]); return this; }, eq() { return this; }, then(resolve) { resolve({ error: null }); } };
  return { calls, serviceClient: {
    async rpc(name, args) { calls.push([name,args]); return { data: { id: invitationId, email: 'new@example.com', user_exists: existing, email_confirmed: confirmed }, error: prepareError }; },
    from() { return query; },
    auth: {
      admin: { async inviteUserByEmail(email, options) { calls.push(['invite',email,options]); if (throws) throw new Error('network'); return { error: sendError }; } },
      async signInWithOtp(args) { calls.push(['otp',args]); return { error: sendError }; },
    },
  }, user: { id: 'admin' } };
}

test('new account invitation sends one email with onboarding redirect and never creates membership', async () => {
  const context = fakeContext();
  const result = await deliverClinicInvitation({ input, context, origin: 'https://clinic.example' });
  assert.equal(result.ok, true);
  assert.equal(context.calls.filter(([name]) => name === 'invite').length, 1);
  const call = context.calls.find(([name]) => name === 'invite');
  assert.equal(new URL(call[2].redirectTo).searchParams.get('next'), `/accept-invite?id=${invitationId}`);
  assert.deepEqual(context.calls.at(-1), ['update',{ delivery_status: 'sent' }]);
  assert.equal(context.calls.some(([name]) => name === 'accept_clinic_invitation'), false);
});

test('existing confirmed account receives one sign-in email without replacing its password', async () => {
  const context = fakeContext({ existing: true, confirmed: true });
  assert.equal((await deliverClinicInvitation({ input, context, origin: 'https://clinic.example' })).ok, true);
  const call = context.calls.find(([name]) => name === 'otp');
  assert.equal(call[1].options.shouldCreateUser, false);
  assert.equal(context.calls.some(([name]) => name === 'invite'), false);
});

test('unauthorized, duplicate, throttled and failed sends do not activate access', async () => {
  const denied = fakeContext(); denied.error = 'Admin required';
  assert.equal((await deliverClinicInvitation({ input, context: denied, origin: 'https://clinic.example' })).ok, false);
  assert.equal(denied.calls.length, 0);
  for (const prepareError of [{ message: 'already_member' },{ message: 'invite_rate_limited' }]) {
    const context = fakeContext({ prepareError });
    assert.equal((await deliverClinicInvitation({ input, context, origin: 'https://clinic.example' })).ok, false);
    assert.equal(context.calls.length, 1);
  }
  for (const options of [{ sendError: { status: 429 } },{ throws: true }]) {
    const context = fakeContext(options);
    assert.equal((await deliverClinicInvitation({ input, context, origin: 'https://clinic.example' })).ok, false);
    assert.deepEqual(context.calls.at(-1), ['update',{ delivery_status: 'failed' }]);
  }
});
