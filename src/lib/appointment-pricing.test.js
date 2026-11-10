import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { parseSessionPrice, suggestSessionPrice } from './appointment-pricing.js';

const single = (amount, currency) => ({ kind: 'single', amount, currency });
const service = (...offers) => ({ offers });

test('a session price is optional and supports zero, cent precision and the two billing currencies', () => {
  assert.equal(parseSessionPrice('', 'MXN'), null);
  assert.deepEqual(parseSessionPrice('0', 'MXN'), { amount: 0, currency: 'MXN' });
  assert.deepEqual(parseSessionPrice('12.50', 'USD'), { amount: 12.5, currency: 'USD' });
  for (const amount of ['-1', '12.345', '1e2', '10000000000']) {
    assert.throws(() => parseSessionPrice(amount, 'MXN'), /costo válido/);
  }
  assert.throws(() => parseSessionPrice('10', 'EUR'), /costo válido/);
});

test('suggestions add known individual prices in the same currency and leave other quotes open', () => {
  assert.deepEqual(suggestSessionPrice([service(single(0.1, 'USD')), service(single(0.2, 'USD'))]), { amount: 0.3, currency: 'USD' });
  assert.equal(suggestSessionPrice([service(single(10, 'USD')), service(single(10, 'MXN'))]), null);
  assert.equal(suggestSessionPrice([service({ ...single(250, 'MXN'), kind: 'package' })]), null);
  assert.equal(suggestSessionPrice([service(single(null, 'MXN'))]), null);
});

test('session price migration preserves old rows and enforces amount and currency together', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('create table public.appointments (id integer primary key); insert into public.appointments values (1);');
  const migration = await readFile(new URL('../../supabase/migrations/20261109233146_appointment_session_price.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  assert.deepEqual((await db.query('select session_price_amount, session_price_currency from public.appointments')).rows, [
    { session_price_amount: null, session_price_currency: null },
  ]);
  await db.query('update public.appointments set session_price_amount = 24.50, session_price_currency = $1', ['USD']);
  for (const price of [[0, null], [null, 'MXN'], [-1, 'MXN'], [4.123, 'USD'], [10000000000, 'MXN'], [4, 'EUR']]) {
    await assert.rejects(db.query('update public.appointments set session_price_amount = $1, session_price_currency = $2', price), { code: '23514' });
  }
  await db.query('update public.appointments set session_price_amount = 0, session_price_currency = $1', ['MXN']);
  await db.query('update public.appointments set session_price_amount = null, session_price_currency = null');
});
