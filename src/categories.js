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

// Rename a category everywhere it appears — transactions, override values, and
// rule categories. "Delete" is just a rename into a target category (e.g.
// Uncategorized), which reassigns all its transactions. Mutates the passed
// objects in place and returns them. Pure (no Scriptable/Node APIs).
function renameCategory(data, oldName, newName) {
  const { transactions = [], overrides = {}, rules = [] } = data;
  transactions.forEach(t => { if (t.category === oldName) t.category = newName; });
  Object.keys(overrides).forEach(k => { if (overrides[k] === oldName) overrides[k] = newName; });
  rules.forEach(r => { if (r.category === oldName) r.category = newName; });
  return { transactions, overrides, rules };
}

module.exports = { DEFAULT_CATEGORIES, renameCategory };
