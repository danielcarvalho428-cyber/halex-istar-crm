import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAllSupabaseRows } from './supabase-pagination.ts';

test('loads every page instead of stopping at the Supabase row limit', async () => {
  const source = Array.from({ length: 2501 }, (_, index) => ({ id: index + 1 }));
  const ranges: Array<[number, number]> = [];

  const rows = await fetchAllSupabaseRows((from, to) => {
    ranges.push([from, to]);
    return Promise.resolve({ data: source.slice(from, to + 1), error: null });
  }, 1000);

  assert.equal(rows.length, 2501);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('requests a final empty page when the total is an exact page multiple', async () => {
  const source = Array.from({ length: 2000 }, (_, index) => index);
  let calls = 0;

  const rows = await fetchAllSupabaseRows((from, to) => {
    calls += 1;
    return Promise.resolve({ data: source.slice(from, to + 1), error: null });
  }, 1000);

  assert.equal(rows.length, 2000);
  assert.equal(calls, 3);
});
