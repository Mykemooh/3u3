import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payPeriod } from '@/lib/earnings';

test('every-two-weeks paydays count from the anchor', () => {
  // Anchor payday Friday Oct 2, 2026.
  assert.deepEqual(payPeriod('BIWEEKLY', '2026-10-02', '2026-10-05'), { start: '2026-10-02', end: '2026-10-15', payday: '2026-10-16' });
  assert.deepEqual(payPeriod('BIWEEKLY', '2026-10-02', '2026-10-16'), { start: '2026-10-02', end: '2026-10-15', payday: '2026-10-16' });
  assert.equal(payPeriod('WEEKLY', '2026-10-02', '2026-10-03')!.payday, '2026-10-09');
  // Before the anchor it still lines up.
  assert.equal(payPeriod('BIWEEKLY', '2026-10-02', '2026-09-25')!.payday, '2026-10-02');
  assert.equal(payPeriod('BIWEEKLY', null, '2026-10-05'), null);
});

test('twice a month pays on the 15th and the last day', () => {
  assert.equal(payPeriod('SEMIMONTHLY', null, '2026-10-05')!.payday, '2026-10-15');
  assert.equal(payPeriod('SEMIMONTHLY', null, '2026-10-16')!.payday, '2026-10-31');
  assert.equal(payPeriod('SEMIMONTHLY', null, '2026-01-03')!.start, '2025-12-31');
});

test('monthly uses the anchor day, capped at the month end', () => {
  assert.equal(payPeriod('MONTHLY', '2026-01-31', '2026-02-10')!.payday, '2026-02-28');
  assert.equal(payPeriod('MONTHLY', null, '2026-10-05')!.payday, '2026-10-31');
  assert.equal(payPeriod('MONTHLY', '2026-01-05', '2026-10-06')!.payday, '2026-11-05');
});
