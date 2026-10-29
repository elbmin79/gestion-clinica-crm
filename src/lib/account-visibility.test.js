import test from 'node:test';
import assert from 'node:assert/strict';
import { hiddenDirectoryUserIds, isHiddenDirectoryAccount, visibleProviderFilter } from './account-visibility.js';

test('hides the development account by email and by stable ID after an email change', () => {
  assert.equal(isHiddenDirectoryAccount({ email: ' ADMIN@MKZSOLUTIONS.COM.MX ' }), true);
  assert.equal(isHiddenDirectoryAccount({ id: hiddenDirectoryUserIds[0], email: 'changed@example.com' }), true);
  assert.equal(isHiddenDirectoryAccount({ user_id: hiddenDirectoryUserIds[0] }), true);
});

test('keeps normal accounts, similarly named emails, and unlinked professionals visible', () => {
  for (const account of [null, {}, { email: 'admin@another-clinic.com' }, { email: 'otheradmin@mkzsolutions.com.mx' }, { user_id: null }]) {
    assert.equal(isHiddenDirectoryAccount(account), false);
  }
  assert.match(visibleProviderFilter, /^user_id\.is\.null,user_id\.not\.in\.\(/);
});
