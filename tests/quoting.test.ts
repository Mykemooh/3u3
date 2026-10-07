import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_QUOTING, parseQuoting, pricedMethods, quoteFromConfig, quotingForTenant, quotingFromSignup, quotingSchema, type QuotingConfig } from '@/lib/quoting';

const cfg = (patch: Partial<{ [K in keyof QuotingConfig]: Partial<QuotingConfig[K]> }> = {}): QuotingConfig => {
  const c: QuotingConfig = JSON.parse(JSON.stringify(DEFAULT_QUOTING));
  for (const [k, v] of Object.entries(patch)) Object.assign((c as any)[k], v);
  return c;
};
const sum = (lines: { amountCents: number }[]) => lines.reduce((s, l) => s + l.amountCents, 0);

test('quoting: rooms, square feet (with minimum) and hourly (with minimum hours)', () => {
  const c = cfg({ rooms: { on: true }, sqft: { on: true }, hourly: { on: true } });
  assert.equal(quoteFromConfig(c, { method: 'ROOMS', bedrooms: 3, bathrooms: 2 }, 'Standard').totalCents, 10000 + 3 * 2000 + 2 * 2500);
  assert.equal(quoteFromConfig(c, { method: 'ROOMS', bedrooms: 2, bathrooms: 1.5 }, 'Standard').totalCents, 10000 + 4000 + 3750);
  assert.equal(quoteFromConfig(c, { method: 'SQFT', squareFeet: 2000 }, 'Standard').totalCents, 20000);
  const small = quoteFromConfig(c, { method: 'SQFT', squareFeet: 500 }, 'Standard');
  assert.equal(small.totalCents, 12000);
  assert.match(small.lines[0].description, /minimum/);
  assert.equal(quoteFromConfig(c, { method: 'HOURLY', hours: 1, cleaners: 2 }, 'Standard').totalCents, 2 * 2 * 5000);
});

test('quoting: adjustments apply only when switched on, and the discount never makes a negative line', () => {
  const off = cfg({ rooms: { on: true } });
  const plain = quoteFromConfig(off, { method: 'ROOMS', bedrooms: 3, bathrooms: 2, clutter: 'HEAVY', pets: 2, frequency: 'WEEKLY', deep: true }, 'Standard');
  assert.equal(plain.lines.length, 1);

  const on = cfg({ rooms: { on: true }, clutter: { on: true }, pets: { on: true }, frequency: { on: true }, deep: { on: true } });
  const r = quoteFromConfig(on, { method: 'ROOMS', bedrooms: 3, bathrooms: 2, clutter: 'HEAVY', pets: 2, frequency: 'BIWEEKLY', deep: true }, 'Deep Cleaning');
  const base = 21000;
  const before = base + base * 0.5 + base * 0.35 + 2 * 1000;
  assert.equal(r.totalCents, before - Math.round(before * 0.1));
  assert.equal(sum(r.lines), r.totalCents);
  assert.ok(r.lines.every((l) => l.amountCents >= 0));
  assert.match(r.lines[0].description, /every two weeks: 10% off/);
});

test('quoting: signup answer picks the defaults; saved settings win; bad JSON is ignored', () => {
  assert.equal(quotingFromSignup('HOURLY').hourly.on, true);
  assert.equal(quotingFromSignup('WALKTHROUGH').walkthrough.on, true);
  assert.deepEqual(pricedMethods(quotingFromSignup('WALKTHROUGH')), []);
  assert.equal(quotingForTenant({ intakeJson: JSON.stringify({ pricing: 'FLAT_BY_SIZE' }) }).config.rooms.on, true);
  const saved = cfg({ sqft: { on: true, centsPerSqFt: 12 } });
  const t = quotingForTenant({ quotingJson: JSON.stringify(saved) });
  assert.equal(t.saved, true);
  assert.equal(t.config.sqft.centsPerSqFt, 12);
  // A setting added later is filled from the defaults.
  const partial = JSON.parse(JSON.stringify(saved));
  delete partial.deep;
  assert.equal(parseQuoting(JSON.stringify(partial))?.deep.extraPct, DEFAULT_QUOTING.deep.extraPct);
  assert.equal(parseQuoting('{not json'), null);
  assert.equal(quotingSchema.safeParse({ ...saved, pets: { on: true, perPetCents: -5 } }).success, false);
});
