const test = require('node:test');
const assert = require('node:assert/strict');
const { categorize, accountFor } = require('../src/categorizer');

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

test('detects transfers by To:/From: prefix or NZ account number', () => {
  assert.equal(categorize('To: 06-0805-0962864-02', RULES, {}), 'Transfer');
  assert.equal(categorize('From: 12-3456-7890123-00', RULES, {}), 'Transfer');
  assert.equal(categorize('06-0805-0962864-02', RULES, {}), 'Transfer');
});

test('override beats transfer detection', () => {
  const ov = { 'to: 06-0805-0962864-02': 'Rent' };
  assert.equal(categorize('To: 06-0805-0962864-02', RULES, ov), 'Rent');
});

test('ordinary merchants are not flagged as transfers', () => {
  assert.equal(categorize('Sample Mart D', RULES, {}), 'Groceries');
  assert.equal(categorize('Sample Cafe One', RULES, {}), 'Uncategorized');
});

test('accountFor returns a learned account override (case-insensitive key)', () => {
  const acctOv = { 'sharesies': 'Investment' };
  assert.equal(accountFor('Sharesies', acctOv, 'Spending'), 'Investment');
});

test('accountFor falls back when the merchant has no override', () => {
  assert.equal(accountFor('Sample Mart D', { sharesies: 'Investment' }, 'Spending'), 'Spending');
  assert.equal(accountFor('Sample Mart D', {}, 'Investment'), 'Investment');
});

test('accountFor defaults the fallback to Spending', () => {
  assert.equal(accountFor('Unknown', {}), 'Spending');
});
