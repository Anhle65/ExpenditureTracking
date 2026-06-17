'use strict';

// Manually add a transaction (cash spends, things OCR missed). Run from the
// Scriptable home grid or a Home Screen icon. Saves to transactions.json with
// source "manual".
const { makeId } = importModule('store');
const { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS } = importModule('categories');
const storeFile = importModule('storeFile');

async function note(message) {
  const a = new Alert();
  a.title = 'Add Expense';
  a.message = message;
  a.addAction('OK');
  await a.present();
}

async function askAmountAndMerchant() {
  const a = new Alert();
  a.title = 'Add Expense';
  a.message = 'Enter the amount and what it was for.';
  a.addTextField('Amount, e.g. 12.50');
  a.addTextField('Merchant / description');
  a.addAction('Next');
  a.addCancelAction('Cancel');
  if (await a.presentAlert() !== 0) return null;
  const amount = parseFloat(String(a.textFieldValue(0)).replace(/[^0-9.]/g, ''));
  const merchant = String(a.textFieldValue(1)).trim();
  if (!amount || !merchant) { await note('Please enter a valid amount and description.'); return null; }
  return { amount, merchant };
}

async function pickDirection() {
  const a = new Alert();
  a.title = 'Money out or in?';
  a.addAction('Out (spending)');
  a.addAction('In (income)');
  a.addCancelAction('Cancel');
  const idx = await a.presentSheet();
  if (idx === -1) return null;
  return idx === 0 ? 'out' : 'in';
}

// Offer the presets plus any categories already used on stored transactions,
// plus a free-text "New category…" so you're never limited to the list.
function categoryChoices() {
  const set = new Set(DEFAULT_CATEGORIES);
  storeFile.loadTransactions().forEach(t => { if (t.category) set.add(t.category); });
  return [...set];
}

async function pickCategory() {
  const choices = categoryChoices();
  const a = new Alert();
  a.title = 'Category';
  choices.forEach(c => a.addAction(c));
  a.addAction('➕ New category…');
  a.addCancelAction('Cancel');
  const idx = await a.presentSheet();
  if (idx === -1) return null;
  if (idx === choices.length) return askCustomCategory();
  return choices[idx];
}

async function askCustomCategory() {
  const a = new Alert();
  a.title = 'New category';
  a.addTextField('Category name, e.g. Pets');
  a.addAction('OK');
  a.addCancelAction('Cancel');
  if (await a.presentAlert() !== 0) return null;
  const v = String(a.textFieldValue(0)).trim();
  return v || null;
}

function accountChoices() {
  const set = new Set(DEFAULT_ACCOUNTS);
  storeFile.loadTransactions().forEach(t => { if (t.account) set.add(t.account); });
  return [...set];
}

async function pickAccount() {
  const choices = accountChoices();
  const a = new Alert();
  a.title = 'Account';
  choices.forEach(c => a.addAction(c));
  a.addAction('➕ New account…');
  a.addCancelAction('Cancel');
  const idx = await a.presentSheet();
  if (idx === -1) return null;
  if (idx === choices.length) {
    const c = new Alert();
    c.title = 'New account';
    c.addTextField('Account name, e.g. Savings');
    c.addAction('OK');
    c.addCancelAction('Cancel');
    if (await c.presentAlert() !== 0) return null;
    const v = String(c.textFieldValue(0)).trim();
    return v || null;
  }
  return choices[idx];
}

async function pickDate() {
  const today = new Date().toISOString().slice(0, 10);
  const a = new Alert();
  a.title = 'Date';
  a.message = 'Format YYYY-MM-DD (leave as-is for today).';
  a.addTextField('Date', today);
  a.addAction('Save');
  a.addCancelAction('Cancel');
  if (await a.presentAlert() !== 0) return null;
  const v = String(a.textFieldValue(0)).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : today;
}

async function main() {
  const base = await askAmountAndMerchant();
  if (!base) return;
  const account = await pickAccount();
  if (!account) return;
  const direction = await pickDirection();
  if (!direction) return;
  const category = await pickCategory();
  if (!category) return;
  const date = await pickDate();
  if (!date) return;

  const txn = {
    date,
    amount: base.amount,
    direction,
    merchant: base.merchant,
    category,
    account,
    source: 'manual',
  };
  txn.id = makeId(txn);

  const all = storeFile.loadTransactions();
  all.push(txn);
  storeFile.saveTransactions(all);

  const sign = direction === 'out' ? '-' : '+';
  await note(`Added ${sign}$${base.amount.toFixed(2)} · ${base.merchant} · ${category} · ${account} on ${date}.`);
}

await main();
