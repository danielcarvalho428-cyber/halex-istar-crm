import assert from 'node:assert/strict';
import test from 'node:test';
import { isoDateInTimeZone, localIsoDate } from './date.ts';

test('formats a calendar date without converting it through UTC', () => {
  assert.equal(localIsoDate(new Date(2026, 6, 5, 23, 30)), '2026-07-05');
});

test('uses the São Paulo business day near the UTC date boundary', () => {
  const instant = new Date('2026-07-06T01:30:00.000Z');
  assert.equal(isoDateInTimeZone(instant, 'America/Sao_Paulo'), '2026-07-05');
});
