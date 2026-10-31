import test from 'node:test';
import assert from 'node:assert/strict';
import { hasClinicPermission, permissionsForPreset, sanitizeClinicPermissions } from './clinic-permissions.js';

test('all presets can view every clinic section while WhatsApp visibility is configurable', () => {
  for (const role of ['clinician', 'receptionist', 'billing']) {
    const permissions = permissionsForPreset(role);
    for (const section of ['patients', 'agenda', 'payments', 'documents', 'clinical', 'team', 'settings', 'reminders']) {
      assert.equal(hasClinicPermission(role, permissions, `${section}.view`), true, `${role} can view ${section}`);
    }
    assert.equal(hasClinicPermission(role, permissions, 'whatsapp.view'), role === 'receptionist');
  }
});

test('presets grant distinct actions and custom permissions override the preset', () => {
  const finance = permissionsForPreset('billing');
  assert.equal(hasClinicPermission('billing', finance, 'payments.create'), true);
  assert.equal(hasClinicPermission('billing', finance, 'patients.create'), false);
  assert.equal(hasClinicPermission('billing', finance, 'payments.refund'), false);
  assert.equal(hasClinicPermission('billing', { ...finance, 'patients.create': true }, 'patients.create'), true);
  assert.equal(hasClinicPermission('billing', { ...finance, 'whatsapp.reply': true }, 'whatsapp.reply'), false);
});

test('configuration stays visible to all; write permissions are granular', () => {
  const billing = permissionsForPreset('billing');
  assert.equal(hasClinicPermission('billing', billing, 'settings.view'), true);
  assert.equal(hasClinicPermission('billing', billing, 'services.manage'), false);
  assert.equal(hasClinicPermission('billing', billing, 'public_agenda.view'), true);
  assert.equal(hasClinicPermission('billing', billing, 'public_agenda.manage'), false);
  assert.equal(hasClinicPermission('billing', { ...billing, 'services.manage': true }, 'services.manage'), true);
  assert.equal(hasClinicPermission('billing', { ...billing, 'public_agenda.manage': true }, 'public_agenda.manage'), true);
});

test('availability scope grants only its selected level', () => {
  for (const [role, scope] of [['clinician', 'self'], ['receptionist', 'branch'], ['admin', 'clinic'], ['billing', 'none']]) {
    const permissions = permissionsForPreset(role);
    assert.equal(permissions['availability.scope'], scope);
    assert.equal(hasClinicPermission(role, permissions, 'availability.manage_clinic'), scope === 'clinic');
    assert.equal(hasClinicPermission(role, permissions, 'availability.manage_branch'), ['clinic', 'branch'].includes(scope));
    assert.equal(hasClinicPermission(role, permissions, 'availability.manage_self'), ['clinic', 'self'].includes(scope));
  }
  assert.equal(sanitizeClinicPermissions({ 'availability.scope': 'unexpected' }, 'clinician')['availability.scope'], 'none');
});

test('administrator permissions are always complete and cannot be narrowed by supplied values', () => {
  const permissions = sanitizeClinicPermissions({ 'whatsapp.view': false, 'payments.refund': false }, 'admin');
  assert.equal(hasClinicPermission('admin', permissions, 'whatsapp.view'), true);
  assert.equal(hasClinicPermission('admin', permissions, 'payments.refund'), true);
});
