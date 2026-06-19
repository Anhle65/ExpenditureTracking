const test = require('node:test');
const assert = require('node:assert/strict');
const { renameCategory, accountChoices, DEFAULT_ACCOUNTS } = require('../src/categories');

test('renameCategory updates transactions, override values, and rules', () => {
  const data = {
    transactions: [
      { merchant: 'A', category: 'Cafe/drink' },
      { merchant: 'B', category: 'Dining' },
    ],
    overrides: { a: 'Cafe/drink', c: 'Bills' },
    rules: [
      { pattern: 'cafe', category: 'Cafe/drink' },
      { pattern: 'x', category: 'Dining' },
    ],
  };
  renameCategory(data, 'Cafe/drink', 'Coffee');
  assert.equal(data.transactions[0].category, 'Coffee');
  assert.equal(data.transactions[1].category, 'Dining');
  assert.equal(data.overrides.a, 'Coffee');
  assert.equal(data.overrides.c, 'Bills');
  assert.equal(data.rules[0].category, 'Coffee');
  assert.equal(data.rules[1].category, 'Dining');
});

test('renaming into an existing category merges them (delete = reassign)', () => {
  const data = {
    transactions: [{ category: 'Cafe/drink' }, { category: 'Dining' }],
    overrides: {},
    rules: [],
  };
  renameCategory(data, 'Cafe/drink', 'Dining');
  assert.deepEqual(data.transactions.map(t => t.category), ['Dining', 'Dining']);
});

test('accountChoices starts from the defaults when no transactions use accounts', () => {
  assert.deepEqual(accountChoices([]), DEFAULT_ACCOUNTS);
});

test('accountChoices merges in accounts already used on transactions, deduped, defaults first', () => {
  const txns = [{ account: 'Spending' }, { account: 'Savings' }, { account: 'Investment' }, {}];
  assert.deepEqual(accountChoices(txns), ['Spending', 'Investment', 'Savings']);
});
