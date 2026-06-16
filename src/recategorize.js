'use strict';

// "Recategorize" — native editable list. Tap a row to change its category;
// the choice is remembered in overrides.json for future imports.
const storeFile = importModule('storeFile');
const { DEFAULT_CATEGORIES } = importModule('categories');

const txns = storeFile.loadTransactions();
const overrides = storeFile.loadOverrides();
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

const table = new UITable();
table.showSeparators = true;

function render() {
  table.removeAllRows();
  for (const t of txns) {
    const row = new UITableRow();
    const sign = t.direction === 'out' ? '-' : '+';
    row.addText(t.merchant, `${t.date} · ${t.category}`);
    const amt = row.addText(`${sign}$${t.amount.toFixed(2)}`);
    amt.rightAligned();
    row.onSelect = async () => {
      const cat = await pickCategory(t.category);
      if (cat) {
        t.category = cat;
        overrides[t.merchant.toLowerCase()] = cat; // learn for future imports
        storeFile.saveTransactions(txns);
        storeFile.saveOverrides(overrides);
        render();
        table.reload();
      }
    };
    table.addRow(row);
  }
}

render();
await table.present();
