import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingUnlinkedProfessional, professionalAccountOptions, validateProfessional } from './professional-accounts.js';

test('account options are clinic members and exclude all existing links, including inactive professionals', () => {
  const accounts = ['available', 'linked', 'inactive', 'revoked'].map(userId => ({ userId, hasAccess: userId !== 'revoked' }));
  const providers = [{ id: 'p1', userId: 'linked' }, { id: 'p2', userId: 'inactive', active: false }];
  assert.deepEqual(professionalAccountOptions(accounts, providers).map(a => a.userId), ['available']);
  assert.deepEqual(professionalAccountOptions(accounts, providers, 'p1').map(a => a.userId), ['available', 'linked']);
});

test('name matches suggest an existing unlinked record without equating account identities', () => {
  const existing = { id: 'p1', name: 'Iliana Verdugo Fernández' };
  assert.equal(matchingUnlinkedProfessional({ name: '  ILIANA  Verdugo Fernandez ' }, [existing]), existing);
  assert.equal(matchingUnlinkedProfessional({ name: 'Iliana Verdugo Fernandez' }, [{ ...existing, userId: 'other-account' }]), undefined);
});

test('professional validation requires a bounded name, clinical title and active clinic branches', () => {
  const branches = [{ id: 'active', active: true }, { id: 'inactive', active: false }];
  const input = { name: 'Test professional', role: 'Médica', branchIds: ['active'] };
  assert.equal(validateProfessional(input, branches), '');
  assert.match(validateProfessional({ ...input, name: ' ' }, branches), /nombre/);
  assert.match(validateProfessional({ ...input, name: 'x'.repeat(161) }, branches), /160/);
  assert.match(validateProfessional({ ...input, role: 'x'.repeat(161) }, branches), /160/);
  for (const branchIds of [[], ['inactive'], ['other-clinic']]) assert.ok(validateProfessional({ ...input, branchIds }, branches));
});
