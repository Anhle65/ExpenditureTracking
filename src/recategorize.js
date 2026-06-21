'use strict';

// "Recategorize" — native editable list. Tap a row to recategorize it (the
// choice is remembered in overrides.json), edit a mis-OCR'd name/date/amount,
// move it to another account, or delete a wrong/duplicate entry.
const storeFile = importModule('storeFile');
const { DEFAULT_CATEGORIES } = importModule('categories');
const { pickAccount } = importModule('accountPicker');
const { pickDate } = importModule('datePicker');
const { makeId } = importModule('store');

const txns = storeFile.loadTransactions();
const overrides = storeFile.loadOverrides();
const accountOverrides = storeFile.loadAccountOverrides();
const rules = storeFile.loadRules();

function categoryChoices() {
  const set = new Set(DEFAULT_CATEGORIES);
  rules.forEach(r => set.add(r.category));
  txns.forEach(t => { if (t.category) set.add(t.category); });
  return [...set];
}

async function pickCategory(current) {
  const sheet = new Alert();
  sheet.title = 'Category';
  sheet.message = `Currently: ${current}`;
  const choices = categoryChoices();
  choices.forEach(c => sheet.addAction(c));
  sheet.addAction('➕ New category…');
  sheet.addCancelAction('Cancel');
  const idx = await sheet.presentSheet();
  if (idx === -1) return null;
  if (idx === choices.length) return askCustomCategory();
  return choices[idx];
}

// Free-text category entry, so you're never limited to the preset list.
// A new name sticks: once used on a transaction it shows up in the list next time.
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

function fmt(t) {
  const sign = t.direction === 'out' ? '-' : '+';
  return `${t.date} · ${sign}$${t.amount.toFixed(2)} · ${t.category}`;
}

async function note(message) {
  const a = new Alert();
  a.title = 'Recategorize';
  a.message = message;
  a.addAction('OK');
  await a.present();
}

// Tap action: Recategorize, Edit, Move account, or Delete.
async function chooseAction(t) {
  const a = new Alert();
  a.title = t.merchant;
  a.message = fmt(t);
  a.addAction('Recategorize');
  a.addAction('Edit name / date / amount…');
  a.addAction('Move to account…');
  a.addDestructiveAction('Delete');
  a.addCancelAction('Cancel');
  const idx = await a.presentSheet();
  if (idx === 0) return 'recategorize';
  if (idx === 1) return 'edit';
  if (idx === 2) return 'account';
  if (idx === 3) return 'delete';
  return null;
}

// Fix a mis-OCR'd transaction in place. Merchant + amount via a text Alert,
// date via the native wheel (cancel keeps the current date). Mutates `t` and
// returns true if it changed. The id is hash(date|amount|merchant), so it MUST
// be recomputed here or dedupe on the next import would misbehave.
async function editDetails(t) {
  const a = new Alert();
  a.title = 'Edit transaction';
  a.message = 'Fix the merchant and amount, then pick the date.';
  a.addTextField('Merchant', t.merchant);
  a.addTextField('Amount', t.amount.toFixed(2));
  a.addAction('Next');
  a.addCancelAction('Cancel');
  if (await a.presentAlert() !== 0) return false;

  const merchant = String(a.textFieldValue(0)).trim();
  const amount = parseFloat(String(a.textFieldValue(1)).replace(/[^0-9.]/g, ''));
  if (!merchant || !amount) { await note('Enter a valid merchant and amount.'); return false; }

  const date = (await pickDate(t.date)) || t.date;   // cancelling the wheel keeps the date

  t.merchant = merchant;
  t.amount = amount;
  t.date = date;
  t.id = makeId(t);
  if (t.source === 'ocr') t.source = 'manual';        // it's a human-corrected row now
  return true;
}

async function confirmDelete(t) {
  const a = new Alert();
  a.title = 'Delete this transaction?';
  a.message = `${t.merchant}\n${fmt(t)}`;
  a.addDestructiveAction('Delete');
  a.addCancelAction('Cancel');
  return (await a.presentSheet()) === 0;
}

const table = new UITable();
table.showSeparators = true;

// Keep the title to one line so long merchants (esp. bank-2 rows) can't wrap and
// bleed into the next transaction.
function shorten(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function render() {
  table.removeAllRows();
  for (const t of txns) {
    const row = new UITableRow();
    row.height = 60;   // roomier than the default 44 so rows don't feel cramped
    const sign = t.direction === 'out' ? '-' : '+';
    const title = row.addText(shorten(t.merchant, 28), `${t.date} · ${t.category} · ${t.account || 'Spending'}`);
    title.widthWeight = 72;
    const amt = row.addText(`${sign}$${t.amount.toFixed(2)}`);
    amt.rightAligned();
    amt.widthWeight = 28;
    // Highlight still-uncategorized rows so they're easy to spot and fix.
    // orange reads on both the light and dark native table appearance.
    if ((t.category || 'Uncategorized') === 'Uncategorized') {
      title.titleColor = Color.orange();
      title.subtitleColor = Color.orange();
      amt.titleColor = Color.orange();
    }
    row.onSelect = async () => {
      const action = await chooseAction(t);
      if (action === 'recategorize') {
        const cat = await pickCategory(t.category);
        if (cat) {
          t.category = cat;
          overrides[t.merchant.toLowerCase()] = cat; // learn for future imports
          storeFile.saveTransactions(txns);
          storeFile.saveOverrides(overrides);
        }
      } else if (action === 'edit') {
        if (await editDetails(t)) {
          storeFile.saveTransactions(txns);   // update the same transactions.json in place
        }
      } else if (action === 'account') {
        const account = await pickAccount({ message: `Currently: ${t.account || 'Spending'}` });
        if (account) {
          t.account = account;
          accountOverrides[t.merchant.toLowerCase()] = account; // learn for future imports
          storeFile.saveTransactions(txns);
          storeFile.saveAccountOverrides(accountOverrides);
        }
      } else if (action === 'delete') {
        if (await confirmDelete(t)) {
          const i = txns.indexOf(t);
          if (i >= 0) txns.splice(i, 1);
          storeFile.saveTransactions(txns);
        }
      }
      render();
      table.reload();
    };
    table.addRow(row);
  }
}

render();
await table.present();
