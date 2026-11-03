import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationPreferencesForRole, normalizeNotificationPreferences } from './notification-preferences.ts';

test('notification preferences preserve CRM role defaults and clinic-specific choices', () => {
  assert.deepEqual(notificationPreferencesForRole('billing'), {
    new_appointment: false,
    agenda_change: false,
    include_self: false,
    push_enabled: true,
  });
  assert.deepEqual(notificationPreferencesForRole('clinician'), {
    new_appointment: true,
    agenda_change: true,
    include_self: false,
    push_enabled: true,
  });
  assert.deepEqual(normalizeNotificationPreferences('billing', { agenda_change: true, push_enabled: false }), {
    new_appointment: false,
    agenda_change: true,
    include_self: false,
    push_enabled: false,
  });
});
