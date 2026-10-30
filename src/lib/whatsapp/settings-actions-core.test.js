import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsAppSettingsActions } from './settings-actions-core.js';

const clinicId = '10000000-0000-0000-0000-000000000001';
const branchId = '30000000-0000-0000-0000-000000000001';
const testEnv = {
  TWILIO_WHATSAPP_CONTENT_SID_CONFIRMATION_2D: `HX${'a'.repeat(32)}`,
  TWILIO_WHATSAPP_CONTENT_SID_REMINDER_1D: `HX${'b'.repeat(32)}`,
  TWILIO_WHATSAPP_CONTENT_SID_REMINDER_5H: `HX${'c'.repeat(32)}`,
};

function fakeDatabase({ role = 'admin', user = { id: '20000000-0000-0000-0000-000000000001' }, failedRead = false, listWhatsAppSenders = async () => [], env = testEnv, getTemplateStatuses = async ({ env: source }) => Object.fromEntries([
  ['confirmation_2d', 'TWILIO_WHATSAPP_CONTENT_SID_CONFIRMATION_2D'],
  ['reminder_1d', 'TWILIO_WHATSAPP_CONTENT_SID_REMINDER_1D'],
  ['reminder_5h', 'TWILIO_WHATSAPP_CONTENT_SID_REMINDER_5H'],
].map(([kind, key]) => [kind, /^HX[0-9a-f]{32}$/i.test(source[key] || '') ? 'approved' : 'not_configured'])) } = {}) {
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
      if (name !== 'save_clinic_whatsapp_settings_v2') throw new Error(`Unexpected RPC: ${name}`);
      state.config = {
        clinic_id: clinicId,
        provider_mode: args.target_provider_mode,
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
  return { client, state, calls, actions: createWhatsAppSettingsActions({ createServerClient: async () => client, listWhatsAppSenders, getTemplateStatuses, env }) };
}

test('admin can load and save clinic-scoped WhatsApp settings', async () => {
  const { actions, calls } = fakeDatabase({ listWhatsAppSenders: async () => [
    { phoneNumber: '+15017122661', displayLabel: 'Clinic Main', senderSid: 'XE-one' },
    { phoneNumber: '+15017122662', displayLabel: 'Clinic Backup', senderSid: 'XE-two' },
  ] });
  const initial = await actions.load(clinicId);
  assert.equal(initial.configured, false);
  assert.deepEqual(initial.settings.templateReadiness, { confirmation_2d: false, reminder_1d: false, reminder_5h: false });
  const saved = await actions.save({
    clinicId,
    allowDefaultFallback: true,
    templateReadiness: { confirmation_2d: true, reminder_1d: true, reminder_5h: false },
    senders: [
      { whatsappNumber: '+15017122661', displayLabel: 'Sucursal Este', branchId, active: true },
      { whatsappNumber: '+15017122662', displayLabel: 'Predeterminado', branchId: '', isDefault: true, active: true },
    ],
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.configured, true);
  assert.equal(saved.senders.length, 2);
  const savedCall = calls.find(call => call.name === 'save_clinic_whatsapp_settings_v2');
  assert.equal(savedCall.args.target_provider_mode, 'twilio');
  assert.deepEqual(savedCall.args.target_senders.map(item => item.sender_key), ['twilio:+15017122661', 'twilio:+15017122662']);
  assert.deepEqual(savedCall.args.target_senders.map(item => item.branch_id), [branchId, null]);
});

test('rejects non-admin writes, invalid branch identifiers, and settings reads before the migration exists', async () => {
  const receptionist = fakeDatabase({ role: 'receptionist' });
  assert.equal((await receptionist.actions.save({ clinicId, senders: [] })).ok, false);
  assert.equal(receptionist.calls.some(call => call.name === 'save_clinic_whatsapp_settings_v2'), false);

  const admin = fakeDatabase();
  const badBranch = await admin.actions.save({
    clinicId,
    templateReadiness: { confirmation_2d: true, reminder_1d: true, reminder_5h: true },
    senders: [{ senderKey: 'mock:east', displayLabel: 'East', branchId: 'not-a-uuid' }],
  });
  assert.match(badBranch.message, /sucursal válida/);
  assert.equal(admin.calls.some(call => call.name === 'save_clinic_whatsapp_settings_v2'), false);

  const missingMigration = fakeDatabase({ failedRead: true });
  assert.match((await missingMigration.actions.load(clinicId)).message, /base de datos esté actualizada/);
});

test('lists registered WhatsApp numbers only for an authenticated clinic admin', async () => {
  const registered = [{ phoneNumber: '+15017122661', displayLabel: 'Clinic Main', senderSid: 'XE-test' }];
  const admin = fakeDatabase({ listWhatsAppSenders: async () => registered });
  assert.deepEqual(await admin.actions.loadAvailableSenders(clinicId), {
    ok: true,
    senders: registered,
    availableTemplates: { confirmation_2d: true, reminder_1d: true, reminder_5h: true },
    templateStatuses: { confirmation_2d: 'approved', reminder_1d: 'approved', reminder_5h: 'approved' },
    deliveryEnabled: false,
  });

  const receptionist = fakeDatabase({ role: 'receptionist', listWhatsAppSenders: async () => { throw new Error('must not run'); } });
  const denied = await receptionist.actions.loadAvailableSenders(clinicId);
  assert.equal(denied.ok, false);
  assert.match(denied.message, /administradora/);
});

test('returns live template approval states and refuses pending templates', async () => {
  const getTemplateStatuses = async () => ({ confirmation_2d: 'pending', reminder_1d: 'approved', reminder_5h: 'not_configured' });
  const admin = fakeDatabase({ getTemplateStatuses });
  const loaded = await admin.actions.loadAvailableSenders(clinicId);
  assert.deepEqual(loaded.templateStatuses, { confirmation_2d: 'pending', reminder_1d: 'approved', reminder_5h: 'not_configured' });
  assert.deepEqual(loaded.availableTemplates, { confirmation_2d: false, reminder_1d: true, reminder_5h: false });

  const refused = await admin.actions.save({
    clinicId,
    templateReadiness: { confirmation_2d: true, reminder_1d: false, reminder_5h: false },
    senders: [],
  });
  assert.equal(refused.ok, false);
  assert.match(refused.message, /plantilla aprobada antes de activarla/);
});

test('hides stale mock sender assignments from Twilio settings', async () => {
  const { actions, state } = fakeDatabase();
  state.config = { allow_default_fallback: true, template_readiness: {} };
  state.senders = [
    { sender_key: 'mock:legacy', display_label: 'Old test sender', branch_id: null, is_default: true, active: true },
    { sender_key: 'twilio:+15017122661', display_label: 'Clinic Main', branch_id: null, is_default: true, active: true },
  ];
  const loaded = await actions.load(clinicId);
  assert.deepEqual(loaded.senders.map(sender => sender.senderKey), ['twilio:+15017122661']);
  assert.equal(loaded.settings.allowDefaultFallback, true);

  state.senders = [{ sender_key: 'mock:legacy', display_label: 'Old test sender', branch_id: null, is_default: true, active: true }];
  const mockOnlyLoaded = await actions.load(clinicId);
  assert.deepEqual(mockOnlyLoaded.senders, []);
  assert.equal(mockOnlyLoaded.settings.allowDefaultFallback, false);
});

test('saves clinic WhatsApp sender configuration only with active registered numbers', async () => {
  const { actions, calls } = fakeDatabase({
    listWhatsAppSenders: async () => [{ phoneNumber: '+15017122661', displayLabel: 'Clinic Main', senderSid: 'XE-test' }],
  });
  const saved = await actions.save({
    clinicId,
    providerMode: 'twilio',
    allowDefaultFallback: true,
    templateReadiness: { confirmation_2d: true, reminder_1d: true, reminder_5h: false },
    senders: [
      { senderKey: 'client-key', whatsappNumber: '+15017122661', displayLabel: 'Clínica', isDefault: true, active: true },
    ],
  });
  assert.equal(saved.ok, true);
  const call = calls.find(item => item.name === 'save_clinic_whatsapp_settings_v2');
  assert.equal(call.args.target_provider_mode, 'twilio');
  assert.equal(call.args.target_senders[0].sender_key, 'twilio:+15017122661');

  const invalid = await actions.save({
    clinicId,
    providerMode: 'twilio',
    templateReadiness: { confirmation_2d: false, reminder_1d: false, reminder_5h: false },
    senders: [{ whatsappNumber: '6861234567', displayLabel: 'Bad' }],
  });
  assert.equal(invalid.ok, false);
  assert.match(invalid.message, /teléfono internacional válido/);

  const unregistered = await actions.save({
    clinicId,
    providerMode: 'twilio',
    templateReadiness: { confirmation_2d: false, reminder_1d: false, reminder_5h: false },
    senders: [{ whatsappNumber: '+15017122662', displayLabel: 'Not registered', isDefault: true }],
  });
  assert.equal(unregistered.ok, false);
  assert.match(unregistered.message, /Solo puedes asignar números registrados y activos/);
  assert.equal(calls.filter(item => item.name === 'save_clinic_whatsapp_settings_v2').length, 1);

  const missingContentId = fakeDatabase({
    listWhatsAppSenders: async () => [{ phoneNumber: '+15017122661', displayLabel: 'Clinic Main', senderSid: 'XE-test' }],
    env: {},
  });
  const notReady = await missingContentId.actions.save({
    clinicId,
    templateReadiness: { confirmation_2d: true, reminder_1d: false, reminder_5h: false },
    senders: [{ whatsappNumber: '+15017122661', displayLabel: 'Clinic Main', isDefault: true }],
  });
  assert.equal(notReady.ok, false);
  assert.match(notReady.message, /plantilla aprobada antes de activarla/);
});
