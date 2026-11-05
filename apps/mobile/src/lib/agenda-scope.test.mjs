import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultAgendaProvider } from './agenda-scope.ts';

test('defaults to the linked clinician when their schedule has appointments', () => {
  assert.equal(defaultAgendaProvider('own', [{ providerId: 'other' }, { providerId: 'own' }]), 'own');
});

test('defaults to the team without a linked clinician or matching appointments', () => {
  assert.equal(defaultAgendaProvider(undefined, [{ providerId: 'other' }]), '');
  assert.equal(defaultAgendaProvider('own', [{ providerId: 'other' }]), '');
  assert.equal(defaultAgendaProvider('own', []), '');
});
