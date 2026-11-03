import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllPages } from './paged-query.js';

test('fetchAllPages covers every row when the API caps responses below the requested range', async () => {
  const source = Array.from({ length: 1153 }, (_, index) => ({ id: index }));
  const requests = [];
  const rows = await fetchAllPages(async request => {
    requests.push(request);
    return {
      data: source.slice(request.from, Math.min(request.to + 1, request.from + 100)),
      count: request.includeCount ? source.length : null,
    };
  }, { pageSize: 250 });

  assert.equal(rows.length, source.length);
  assert.deepEqual(rows, source);
  assert.deepEqual(requests.map(item => item.from), [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100]);
  assert.deepEqual(requests.slice(0, 3).map(item => item.to), [249, 349, 449]);
  assert.equal(requests.filter(item => item.includeCount).length, 1);
});

test('fetchAllPages handles empty and short final pages with a stable count', async () => {
  assert.deepEqual(await fetchAllPages(async () => ({ data: [], count: 0 })), []);
  const rows = await fetchAllPages(async ({ from, to, includeCount }) => {
    const source = [1, 2, 3, 4, 5];
    return { data: source.slice(from, to + 1), count: includeCount ? source.length : null };
  }, { pageSize: 3 });
  assert.deepEqual(rows, [1, 2, 3, 4, 5]);
});

test('fetchAllPages propagates query errors and rejects invalid page sizes', async () => {
  await assert.rejects(fetchAllPages(async () => ({ data: null, error: new Error('db unavailable') })), /db unavailable/);
  await assert.rejects(fetchAllPages(async () => ({ data: [] }), { pageSize: 0 }), /entero positivo/);
});
