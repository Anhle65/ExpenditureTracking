const test = require('node:test');
const assert = require('node:assert/strict');
const { makeId, dedupe } = require('../src/store');

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
