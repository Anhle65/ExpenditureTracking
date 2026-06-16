'use strict';

// Manually add a transaction (cash spends, things OCR missed). Run from the
// Scriptable home grid or a Home Screen icon. Saves to transactions.json with
// source "manual".
const { makeId } = importModule('store');
const { DEFAULT_CATEGORIES } = importModule('categories');
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

async function pickCategory() {
  const a = new Alert();
  a.title = 'Category';
  DEFAULT_CATEGORIES.forEach(c => a.addAction(c));
  a.addCancelAction('Cancel');
  const idx = await a.presentSheet();
  return idx === -1 ? null : DEFAULT_CATEGORIES[idx];
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
    source: 'manual',
  };
  txn.id = makeId(txn);

  const all = storeFile.loadTransactions();
  all.push(txn);
  storeFile.saveTransactions(all);

  const sign = direction === 'out' ? '-' : '+';
  await note(`Added ${sign}$${base.amount.toFixed(2)} · ${base.merchant} · ${category} on ${date}.`);
}

await main();
