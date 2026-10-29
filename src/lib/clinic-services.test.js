import test from 'node:test';
import assert from 'node:assert/strict';
import { initialClinicServices, serviceSetupState } from './clinic-services.js';

test('service import preserves unique identities, currencies, package quantities and unresolved values', () => {
  assert.ok(initialClinicServices.length >= 50);
  assert.equal(new Set(initialClinicServices.map(item => item.code)).size, initialClinicServices.length);
  const depilation = initialClinicServices.find(item => item.code === 'dep-area-01');
  assert.deepEqual(depilation.offers[0], { kind: 'package', amount: 4000, currency: 'MXN', sessions: 10, label: '' });
  assert.equal(initialClinicServices.find(item => item.code === 'fac-morpheus8').offers[0].currency, 'USD');
  assert.equal(initialClinicServices.find(item => item.code === 'corp-drenaje').durationMax, 30);
  const lipoAssessment = initialClinicServices.find(item => item.code === 'lipo-assessment').offers[0];
  assert.equal(lipoAssessment.amount, 500);
  assert.equal(lipoAssessment.currency, 'MXN');
  assert.equal(initialClinicServices.find(item => item.code === 'corp-emszero-peptonas').offers.some(item => item.kind === 'single'), false);
  assert.equal(serviceSetupState(initialClinicServices.find(item => item.code === 'lipo-assessment')), 'setup_needed');
});
