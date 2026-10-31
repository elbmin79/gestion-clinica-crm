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

test('administrator permissions are always complete and cannot be narrowed by supplied values', () => {
  const permissions = sanitizeClinicPermissions({ 'whatsapp.view': false, 'payments.refund': false }, 'admin');
  assert.equal(hasClinicPermission('admin', permissions, 'whatsapp.view'), true);
  assert.equal(hasClinicPermission('admin', permissions, 'payments.refund'), true);
});
