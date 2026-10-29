import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsAppSettingsActions } from './settings-actions-core.js';

const clinicId = '10000000-0000-0000-0000-000000000001';
const branchId = '30000000-0000-0000-0000-000000000001';

function fakeDatabase({ role = 'admin', user = { id: '20000000-0000-0000-0000-000000000001' }, failedRead = false } = {}) {
  const state = { config: null, senders: [] };
  const calls = [];
  const from = table => {
    let selected = '';
    const filters = {};
    const query = {
      select(columns) { selected = columns; return query; },
      eq(key, value) { filters[key] = value; return query; },
      async maybeSingle() {
        calls.push({ table, selected, filters: { ...filters } });
        if (table === 'clinic_memberships') return { data: role ? { role } : null, error: null };
        if (failedRead) return { data: null, error: new Error('missing migration') };
        if (table === 'clinic_whatsapp_configurations') return { data: state.config, error: null };
        return { data: null, error: null };
      },
      async order() {
        calls.push({ table, selected, filters: { ...filters } });
        return failedRead ? { data: null, error: new Error('missing migration') } : { data: state.senders, error: null };
      },
      then(resolve, reject) {
        calls.push({ table, selected, filters: { ...filters } });
        const result = failedRead ? { data: null, error: new Error('missing migration') } : { data: state.senders, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from,
    async rpc(name, args) {
      calls.push({ name, args });
      if (name !== 'save_clinic_whatsapp_settings') throw new Error(`Unexpected RPC: ${name}`);
      state.config = {
        clinic_id: clinicId,
        provider_mode: 'mock',
        allow_default_fallback: args.target_allow_default_fallback,
        template_readiness: args.target_template_readiness,
      };
      state.senders = args.target_senders.map(sender => ({
        sender_key: sender.sender_key,
        display_label: sender.display_label,
        branch_id: sender.branch_id,
        is_default: sender.is_default,
        active: sender.active,
      }));
      return { data: true, error: null };
    },
  };
  return { client, state, calls, actions: createWhatsAppSettingsActions({ createServerClient: async () => client }) };
}

test('admin can load, save, and execute an inspectable clinic-scoped synthetic test', async () => {
  const { actions, calls } = fakeDatabase();
  const initial = await actions.load(clinicId);
  assert.equal(initial.configured, false);
  assert.deepEqual(initial.settings.templateReadiness, { confirmation_2d: false, reminder_1d: false, reminder_5h: false });
  const saved = await actions.save({
    clinicId,
    allowDefaultFallback: true,
    templateReadiness: { confirmation_2d: true, reminder_1d: true, reminder_5h: false },
    senders: [
      { senderKey: 'mock:east', displayLabel: 'Sucursal Este', branchId, active: true },
      { senderKey: 'mock:default', displayLabel: 'Predeterminado', branchId: '', isDefault: true, active: true },
    ],
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.configured, true);
  assert.equal(saved.senders.length, 2);
  assert.deepEqual(calls.find(call => call.name === 'save_clinic_whatsapp_settings').args.target_senders.map(item => item.branch_id), [branchId, null]);
  const result = await actions.testSend({ clinicId, branchId, templateKind: 'confirmation_2d', outcome: 'accepted' });
  assert.equal(result.ok, true);
  assert.equal(result.simulated, true);
  assert.equal(result.route, 'branch');
  assert.equal(result.senderLabel, 'Sucursal Este');
  assert.match(result.message, /No se envió a WhatsApp/);
});

test('rejects non-admin writes, invalid branch identifiers, and settings reads before the migration exists', async () => {
  const receptionist = fakeDatabase({ role: 'receptionist' });
  assert.equal((await receptionist.actions.save({ clinicId, senders: [] })).ok, false);
  assert.equal(receptionist.calls.some(call => call.name === 'save_clinic_whatsapp_settings'), false);

  const admin = fakeDatabase();
  const badBranch = await admin.actions.save({
    clinicId,
    templateReadiness: { confirmation_2d: true, reminder_1d: true, reminder_5h: true },
    senders: [{ senderKey: 'mock:east', displayLabel: 'East', branchId: 'not-a-uuid' }],
  });
  assert.match(badBranch.message, /sucursal válida/);
  assert.equal(admin.calls.some(call => call.name === 'save_clinic_whatsapp_settings'), false);

  const missingMigration = fakeDatabase({ failedRead: true });
  assert.match((await missingMigration.actions.load(clinicId)).message, /migración de modo de prueba/);
});

test('requires authenticated clinic admin for test-send actions', async () => {
  const signedOut = fakeDatabase({ user: null });
  const result = await signedOut.actions.testSend({ clinicId });
  assert.equal(result.ok, false);
  assert.match(result.message, /Inicia sesión/);
});
