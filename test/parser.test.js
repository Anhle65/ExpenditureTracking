const test = require('node:test');
const assert = require('node:assert/strict');
const { parseOcr } = require('../src/parser');
const sample = require('./fixtures/2degrees-sample');

test('parses the sample fixture into 8 transactions', () => {
  const { transactions, warnings } = parseOcr(sample, { fallbackDate: '2026-06-13' });
  assert.equal(transactions.length, 8);
  assert.deepEqual(warnings, []);
});

test('leading block (above first date) uses fallbackDate, flagged uncertain', () => {
  const { transactions } = parseOcr(sample, { fallbackDate: '2026-06-13' });
  const lead = transactions.slice(0, 2);
  assert.deepEqual(lead.map(t => t.merchant), ['Sample Cafe One', 'Sample Cafe One']);
  assert.deepEqual(lead.map(t => t.amount), [12, 34]);
  assert.equal(lead[0].date, '2026-06-13');
  assert.equal(lead[0].dateUncertain, true);
  assert.equal(lead[0].direction, 'out');
});

test('a date header labels the block that follows it (zip by order)', () => {
  const { transactions } = parseOcr(sample, { fallbackDate: '2026-06-13' });
  const fri = transactions.filter(t => t.date === '2026-06-12');
  assert.deepEqual(fri.map(t => t.merchant),
    ['Sample Store A', 'Sample Eatery B', 'Sample Butcher C', 'Sample Butcher C', 'Sample Mart D']);
  assert.deepEqual(fri.map(t => t.amount), [10, 2.5, 99, 40, 15]);
  assert.equal(fri.every(t => t.direction === 'out'), true);
  assert.equal(fri.every(t => t.dateUncertain === false), true);

  const thu = transactions.filter(t => t.date === '2026-06-11');
  assert.deepEqual(thu.map(t => t.merchant), ['Sample Bakery E']);
  assert.deepEqual(thu.map(t => t.amount), [5]);
});

test('emits a warning when a segment has mismatched counts', () => {
  const text = 'FRI 12 JUN 2026\nMerchant A\nMerchant B\n-$10.00';
  const { transactions, warnings } = parseOcr(text, {});
  assert.equal(transactions.length, 1);          // zips the min (1 pair)
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /mismatch/i);
});
