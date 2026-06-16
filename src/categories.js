'use strict';

// The category choices offered when assigning manually (Add Expense and
// Recategorize). Rule categories and any categories already on stored
// transactions are merged in on top of these at runtime.
const DEFAULT_CATEGORIES = [
  'Groceries',
  'Dining',
  'Cafe/drink',
  'Transport',
  'Bills',
  'Rent',
  'Shopping',
  'Health',
  'Income',
  'Transfer',
  'Uncategorized',
];

module.exports = { DEFAULT_CATEGORIES };
