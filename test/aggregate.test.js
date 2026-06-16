const test = require('node:test');
const assert = require('node:assert/strict');
const { monthlyTotals, byCategory, trend, totalsInRange, categoryBreakdownInRange } = require('../src/aggregate');

const DATA = [
  { date: '2026-06-12', amount: 10.00, direction: 'out', category: 'Groceries' },
  { date: '2026-06-12', amount: 2.50,  direction: 'out', category: 'Dining' },
  { date: '2026-06-11', amount: 5.00,  direction: 'out', category: 'Dining' },
  { date: '2026-06-10', amount: 100.0, direction: 'in',  category: 'Income' },
  { date: '2026-05-30', amount: 50.0,  direction: 'out', category: 'Groceries' },
];

test('monthlyTotals sums out vs in for the given month', () => {
  assert.deepEqual(monthlyTotals(DATA, '2026-06'), { out: 17.50, in: 100.0 });
});

test('byCategory sums outgoing spend per category for the month', () => {
  assert.deepEqual(byCategory(DATA, '2026-06'), { Groceries: 10.00, Dining: 7.50 });
});

test('trend groups outgoing spend by month, sorted ascending', () => {
  assert.deepEqual(trend(DATA), [
    { month: '2026-05', out: 50.0 },
    { month: '2026-06', out: 17.50 },
  ]);
});

test('totalsInRange sums out/in within an inclusive date range', () => {
  // 2026-06-11..2026-06-12: out 10 + 2.5 + 5 = 17.5, no income in range
  assert.deepEqual(totalsInRange(DATA, '2026-06-11', '2026-06-12'), { out: 17.50, in: 0 });
  // include 2026-06-10 income
  assert.deepEqual(totalsInRange(DATA, '2026-06-10', '2026-06-12'), { out: 17.50, in: 100.0 });
});

test('categoryBreakdownInRange groups outgoing spend by category in range', () => {
  assert.deepEqual(categoryBreakdownInRange(DATA, '2026-06-01', '2026-06-30'),
    { Groceries: 10.00, Dining: 7.50 });
});

test('trend can be limited to a date range', () => {
  assert.deepEqual(trend(DATA, '2026-06-01', '2026-06-30'), [{ month: '2026-06', out: 17.50 }]);
});
