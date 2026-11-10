import test from 'node:test';
import assert from 'node:assert/strict';
import { consultationServices, demoClinicServices, eligibleServiceProviders, initialClinicServices, serviceSetupState } from './clinic-services.js';

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

test('catalog includes a distinct assessment and three 15-minute reviews with prices pending', () => {
  assert.deepEqual(consultationServices.map(service => [service.name, service.durationMin, service.durationMax]), [
    ['Valoración', null, null],
    ['Revisión de Botox', 15, 15],
    ['Revisión de relleno', 15, 15],
    ['Revisión de enolyse', 15, 15],
  ]);
  assert.ok(consultationServices.every(service => service.offers.length === 0 && initialClinicServices.includes(service)));
});

test('a doctor-only service resolves to its sole eligible provider in the selected branch', () => {
  const doctor = { id: 'doctor', branchIds: ['central'] };
  const nurse = { id: 'nurse', branchIds: ['central'] };
  const providers = [doctor, nurse, { id: 'inactive', active: false }, { id: 'other', branchIds: ['north'] }];
  const consult = { providerIds: ['doctor', 'inactive', 'other'] };
  const facial = { providerIds: ['nurse'] };
  assert.deepEqual(eligibleServiceProviders([consult, {}], providers, 'central'), [doctor]);
  assert.deepEqual(eligibleServiceProviders([consult, facial], providers, 'central'), []);
  assert.deepEqual(eligibleServiceProviders([{ ...consult, branchIds: ['north'] }], providers, 'central'), []);
  assert.deepEqual(eligibleServiceProviders([{}], providers, 'central'), [doctor, nurse]);
  assert.equal(new Set(demoClinicServices.map(service => service.id)).size, demoClinicServices.length);
});
