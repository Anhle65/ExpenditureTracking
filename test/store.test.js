const test = require('node:test');
const assert = require('node:assert/strict');
const { makeId, dedupe, partitionByDateRange } = require('../src/store');

const txn = (date, amount, merchant, extra = {}) =>
  ({ date, amount, merchant, direction: 'out', ...extra });

const stored = (date, amount, merchant, extra = {}) => {
  const t = txn(date, amount, merchant, extra);
  return { ...t, id: makeId(t) };
};

test('makeId is deterministic and order-stable', () => {
  const a = makeId(txn('2026-06-12', 10.00, 'Sample Store A'));
  const b = makeId(txn('2026-06-12', 10.00, 'Sample Store A'));
  assert.equal(a, b);
});

test('makeId differs when any key field differs', () => {
  const base = makeId(txn('2026-06-12', 10.00, 'Sample Store A'));
  assert.notEqual(base, makeId(txn('2026-06-12', 10.01, 'Sample Store A')));
  assert.notEqual(base, makeId(txn('2026-06-11', 10.00, 'Sample Store A')));
  assert.notEqual(base, makeId(txn('2026-06-12', 10.00, 'Sample Mart D')));
});

test('dedupe skips exact duplicates and stamps ids on new ones', () => {
  const existing = [stored('2026-06-12', 10.00, 'Sample Store A')];
  const incoming = [
    txn('2026-06-12', 10.00, 'Sample Store A'),   // exact duplicate
    txn('2026-06-11', 5.00, 'Sample Bakery E'),   // new
  ];
  const { added, skipped } = dedupe(existing, incoming);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].reason, 'exact-duplicate');
  assert.equal(added.length, 1);
  assert.equal(added[0].merchant, 'Sample Bakery E');
  assert.ok(added[0].id, 'new transaction is stamped with an id');
});

test('dedupe treats an uncertain-date row as duplicate within the day window', () => {
  // Stored yesterday with a confident date; re-scanned today in the dateless
  // leading block, so it arrives with a different (fallback) date, uncertain.
  const existing = [stored('2026-06-14', 15.00, 'Sample Mart D')];
  const incoming = [txn('2026-06-15', 15.00, 'Sample Mart D', { dateUncertain: true })];
  const { added, skipped } = dedupe(existing, incoming);
  assert.equal(added.length, 0);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].reason, 'near-duplicate');
});

test('dedupe also matches when the STORED row had the uncertain date', () => {
  const existing = [stored('2026-06-14', 15.00, 'Sample Mart D', { dateUncertain: true })];
  const incoming = [txn('2026-06-15', 15.00, 'Sample Mart D', { dateUncertain: false })];
  const { added, skipped } = dedupe(existing, incoming);
  assert.equal(added.length, 0);
  assert.equal(skipped.length, 1);
});

test('dedupe does NOT fuzzy-merge two confident-date rows (real separate-day spends)', () => {
  const existing = [stored('2026-06-14', 15.00, 'Sample Mart D')];
  const incoming = [txn('2026-06-15', 15.00, 'Sample Mart D', { dateUncertain: false })];
  const { added, skipped } = dedupe(existing, incoming);
  assert.equal(added.length, 1);
  assert.equal(skipped.length, 0);
});

test('dedupe keeps an uncertain row that falls outside the day window', () => {
  const existing = [stored('2026-06-10', 15.00, 'Sample Mart D')];
  const incoming = [txn('2026-06-15', 15.00, 'Sample Mart D', { dateUncertain: true })];
  const { added, skipped } = dedupe(existing, incoming, { windowDays: 2 });
  assert.equal(added.length, 1);
  assert.equal(skipped.length, 0);
});

test('partitionByDateRange splits on an inclusive [start, end] window', () => {
  const txns = [
    stored('2026-06-09', 1, 'A'),  // before
    stored('2026-06-10', 2, 'B'),  // start boundary — removed
    stored('2026-06-12', 3, 'C'),  // inside — removed
    stored('2026-06-15', 4, 'D'),  // end boundary — removed
    stored('2026-06-16', 5, 'E'),  // after
  ];
  const { kept, removed } = partitionByDateRange(txns, '2026-06-10', '2026-06-15');
  assert.deepEqual(removed.map(t => t.merchant), ['B', 'C', 'D']);
  assert.deepEqual(kept.map(t => t.merchant), ['A', 'E']);
});

test('partitionByDateRange removes nothing when the window misses every row', () => {
  const txns = [stored('2026-06-09', 1, 'A'), stored('2026-06-16', 5, 'E')];
  const { kept, removed } = partitionByDateRange(txns, '2026-06-10', '2026-06-15');
  assert.equal(removed.length, 0);
  assert.equal(kept.length, 2);
});

test('partitionByDateRange treats a non-date row as outside the window (kept)', () => {
  const txns = [stored('2026-06-12', 3, 'C'), { merchant: 'X', amount: 1, date: null }];
  const { kept, removed } = partitionByDateRange(txns, '2026-06-10', '2026-06-15');
  assert.deepEqual(removed.map(t => t.merchant), ['C']);
  assert.deepEqual(kept.map(t => t.merchant), ['X']);
});
