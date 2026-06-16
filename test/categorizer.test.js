const test = require('node:test');
const assert = require('node:assert/strict');
const { categorize } = require('../src/categorizer');

const RULES = [
  { pattern: 'sample mart', category: 'Groceries' },
  { pattern: 'sample butcher', category: 'Groceries' },
  { pattern: 'bakery', category: 'Dining' },
];

test('matches a keyword rule (case-insensitive, substring)', () => {
  assert.equal(categorize('Sample Mart D', RULES, {}), 'Groceries');
  assert.equal(categorize('Sample Bakery E', RULES, {}), 'Dining');
});

test('override beats rules and is exact on the merchant', () => {
  const overrides = { 'sample store a': 'Dining' };
  assert.equal(categorize('Sample Store A', RULES, overrides), 'Dining');
});

test('unmatched merchant is Uncategorized', () => {
  assert.equal(categorize('Sample Cafe One', RULES, {}), 'Uncategorized');
});
