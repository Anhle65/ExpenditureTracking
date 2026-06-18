const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWithProfile } = require('../src/engine');
const { BANK1 } = require('../src/profiles');
const bank1Sample = require('./fixtures/2degrees-sample');

test('column-zip reproduces the bank-1 fixture (8 transactions, no warnings)', () => {
  const { transactions, warnings } = parseWithProfile(bank1Sample, BANK1, { fallbackDate: '2026-06-13' });
  assert.equal(transactions.length, 8);
  assert.deepEqual(warnings, []);
  const fri = transactions.filter(t => t.date === '2026-06-12');
  assert.deepEqual(fri.map(t => t.merchant),
    ['Sample Store A', 'Sample Eatery B', 'Sample Butcher C', 'Sample Butcher C', 'Sample Mart D']);
  assert.deepEqual(fri.map(t => t.amount), [10, 2.5, 99, 40, 15]);
  assert.equal(fri.every(t => t.direction === 'out'), true);
});
