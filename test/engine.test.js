const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWithProfile } = require('../src/engine');
const { BANK1, BANK2 } = require('../src/profiles');
const bank1Sample = require('./fixtures/2degrees-sample');
const bank2Sample = require('./fixtures/bank2-sample');

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

test('row-stacked pairs each signed amount with its preceding description, skipping balances', () => {
  const { transactions } = parseWithProfile(bank2Sample, BANK2, { fallbackDate: '2026-05-20' });
  // 3 signed transactions; the 3 unsigned balances are ignored
  assert.equal(transactions.length, 3);

  const tax = transactions.find(t => t.amount === 4.96);
  assert.equal(tax.merchant, 'IRD: TAX ON TD INT EX AC');
  assert.equal(tax.direction, 'out');
  assert.equal(tax.date, '2026-03-18');

  const interest = transactions.find(t => t.amount === 47.25);
  assert.equal(interest.merchant, 'TD INTEREST EX AC');
  assert.equal(interest.direction, 'in');

  const transfer = transactions.find(t => t.amount === 5000);
  assert.equal(transfer.direction, 'out');
  assert.equal(transfer.date, '2026-05-10');
});

test('column-zip drops bare account-number lines (reference noise, not a merchant)', () => {
  // Intentional: account-number lines are reference rows, dropped in both layouts.
  // Bank 1's transaction list never shows bare account numbers (its transfers use
  // a "To:" prefix, which is kept); this pins the behavior so it can't silently change.
  const text = 'FRI 12 JUN 2026\nSome Merchant\n12-3602-0581571-00\n-$10.00';
  const { transactions, warnings } = parseWithProfile(text, BANK1, {});
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].merchant, 'Some Merchant');
  assert.equal(transactions[0].amount, 10);
  assert.deepEqual(warnings, []);
});
