'use strict';

// Scriptable-only glue: the account picker shared by Add Expense and
// Recategorize. The choice logic (defaults + accounts already in use) is the
// pure categories.accountChoices; this module only adds the Alert UI and the
// "New account…" free-text path. Returns the chosen account name, or null if
// the user cancels.
const storeFile = importModule('storeFile');
const { accountChoices } = importModule('categories');

async function pickAccount(opts = {}) {
  const choices = accountChoices(storeFile.loadTransactions());
  const a = new Alert();
  a.title = opts.title || 'Account';
  if (opts.message) a.message = opts.message;
  choices.forEach(c => a.addAction(c));
  a.addAction('➕ New account…');
  a.addCancelAction('Cancel');
  const idx = await a.presentSheet();
  if (idx === -1) return null;
  if (idx === choices.length) return askNewAccount();
  return choices[idx];
}

async function askNewAccount() {
  const c = new Alert();
  c.title = 'New account';
  c.addTextField('Account name, e.g. Savings');
  c.addAction('OK');
  c.addCancelAction('Cancel');
  if (await c.presentAlert() !== 0) return null;
  const v = String(c.textFieldValue(0)).trim();
  return v || null;
}

module.exports = { pickAccount };
