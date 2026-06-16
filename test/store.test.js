const test = require('node:test');
const assert = require('node:assert/strict');
const { makeId, dedupe } = require('../src/store');

const txn = (date, amount, merchant) => ({ date, amount, merchant, direction: 'out' });

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

test('dedupe skips already-stored transactions and stamps ids', () => {
  const existing = [{ ...txn('2026-06-12', 10.00, 'Sample Store A'), id: makeId(txn('2026-06-12', 10.00, 'Sample Store A')) }];
  const incoming = [
    txn('2026-06-12', 10.00, 'Sample Store A'),   // duplicate
    txn('2026-06-11', 5.00, 'Sample Bakery E'),   // new
  ];
  const { added, skipped } = dedupe(existing, incoming);
  assert.equal(skipped, 1);
  assert.equal(added.length, 1);
  assert.equal(added[0].merchant, 'Sample Bakery E');
  assert.ok(added[0].id, 'added transaction is stamped with an id');
});
