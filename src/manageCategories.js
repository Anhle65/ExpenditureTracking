'use strict';

// Manage Categories: rename or delete any category. Rename updates every
// transaction, learned override, and rule that uses it. Delete reassigns its
// transactions to a category you choose (it doesn't lose the transactions).
// Note: the built-in defaults in categories.js always stay available in the
// pickers even with 0 transactions — remove those from categories.js (in the
// repo) if you want them gone entirely.
const { DEFAULT_CATEGORIES, renameCategory } = importModule('categories');
const storeFile = importModule('storeFile');

function load() {
  return {
    transactions: storeFile.loadTransactions(),
    overrides: storeFile.loadOverrides(),
    rules: storeFile.loadRules(),
  };
}

function saveAll(data) {
  storeFile.saveTransactions(data.transactions);
  storeFile.saveOverrides(data.overrides);
  storeFile.saveRules(data.rules);
}

function listCategories(data) {
  const counts = {};
  data.transactions.forEach(t => { if (t.category) counts[t.category] = (counts[t.category] || 0) + 1; });
  const set = new Set(DEFAULT_CATEGORIES);
  data.transactions.forEach(t => { if (t.category) set.add(t.category); });
  data.rules.forEach(r => set.add(r.category));
  Object.values(data.overrides).forEach(c => set.add(c));
  return [...set].sort().map(name => ({ name, count: counts[name] || 0 }));
}

async function note(msg) {
  const a = new Alert();
  a.title = 'Categories';
  a.message = msg;
  a.addAction('OK');
  await a.present();
}

async function promptRename(data, oldName) {
  const a = new Alert();
  a.title = `Rename "${oldName}"`;
  a.message = 'Renaming into an existing name merges them.';
  a.addTextField('New name', oldName);
  a.addAction('Rename');
  a.addCancelAction('Cancel');
  if (await a.presentAlert() !== 0) return false;
  const v = String(a.textFieldValue(0)).trim();
  if (!v || v === oldName) return false;
  renameCategory(data, oldName, v);
  saveAll(data);
  await note(`Renamed "${oldName}" → "${v}".`);
  return true;
}

async function promptDelete(data, oldName) {
  const targets = listCategories(data).map(c => c.name).filter(n => n !== oldName);
  if (!targets.includes('Uncategorized')) targets.unshift('Uncategorized');
  const a = new Alert();
  a.title = `Delete "${oldName}"`;
  a.message = 'Move its transactions to which category?';
  targets.forEach(t => a.addAction(t));
  a.addCancelAction('Cancel');
  const idx = await a.presentSheet();
  if (idx === -1) return false;
  renameCategory(data, oldName, targets[idx]);
  saveAll(data);
  await note(`Moved "${oldName}" into "${targets[idx]}".`);
  return true;
}

async function chooseAction(data, cat) {
  const a = new Alert();
  a.title = cat.name;
  a.message = `${cat.count} transaction(s)`;
  a.addAction('Rename');
  a.addDestructiveAction('Delete (reassign)');
  a.addCancelAction('Cancel');
  const idx = await a.presentSheet();
  if (idx === 0) return promptRename(data, cat.name);
  if (idx === 1) return promptDelete(data, cat.name);
  return false;
}

const table = new UITable();
table.showSeparators = true;

async function render() {
  const data = load();
  const cats = listCategories(data);
  table.removeAllRows();

  const header = new UITableRow();
  header.isHeader = true;
  header.addText('Categories', 'Tap to rename or delete');
  table.addRow(header);

  for (const cat of cats) {
    const row = new UITableRow();
    row.addText(cat.name, `${cat.count} transaction(s)`);
    row.onSelect = async () => {
      await chooseAction(data, cat);
      await render();
      table.reload();
    };
    table.addRow(row);
  }
}

await render();
await table.present();
