'use strict';

// Wipe stored data and start clean. Scriptable glue — verified on-device.
// Lets you choose the scope each run:
//   • Transactions only  — clears transactions.json, KEEPS the learned
//     categorization brain (rules, overrides, accountOverrides), bank profiles
//     and settings, so the next import still categorizes correctly.
//   • Date range… — deletes only transactions dated within an inclusive
//     [start, end] window (the range split is the Node-tested
//     store.partitionByDateRange); everything else is kept.
//   • Everything (factory reset) — clears all six data files; the app returns
//     to a brand-new state and must re-learn from scratch.
// Reuses the storeFile interface (writes each file's empty default) rather than
// touching FileManager directly. Destructive, so it double-confirms first.
const storeFile = importModule('storeFile');
const { partitionByDateRange } = importModule('store');

// What "clean" means per file — mirrors storeFile's read fallbacks.
const clearAll = {
  transactions: () => storeFile.saveTransactions([]),
  rules: () => storeFile.saveRules([]),
  overrides: () => storeFile.saveOverrides({}),
  accountOverrides: () => storeFile.saveAccountOverrides({}),
  banks: () => storeFile.saveBanks(null),
  settings: () => storeFile.saveSettings({}),
};

async function note(message) {
  const a = new Alert();
  a.title = 'Reset Data';
  a.message = message;
  a.addAction('OK');
  await a.present();
}

// Shared destructive confirm — every delete path routes through here.
async function confirmDestructive(actionLabel, message) {
  const a = new Alert();
  a.title = 'Are you sure?';
  a.message = message;
  a.addDestructiveAction(actionLabel);
  a.addCancelAction('Cancel');
  return (await a.presentAlert()) === 0;
}

// Counts shown so you know exactly what you're about to destroy.
function summary() {
  const txns = storeFile.loadTransactions() || [];
  const rules = storeFile.loadRules() || [];
  const overrides = storeFile.loadOverrides() || {};
  const acctOverrides = storeFile.loadAccountOverrides() || {};
  const banks = storeFile.loadBanks();
  return {
    txns: txns.length,
    rules: rules.length,
    overrides: Object.keys(overrides).length,
    acctOverrides: Object.keys(acctOverrides).length,
    banks: Array.isArray(banks) ? banks.length : (banks ? 1 : 0),
  };
}

async function pickScope(s) {
  const a = new Alert();
  a.title = 'Start clean — what to delete?';
  a.message =
    `Currently stored:\n` +
    `• ${s.txns} transactions\n` +
    `• ${s.rules} rules · ${s.overrides} category + ${s.acctOverrides} account overrides\n` +
    `• ${s.banks} bank profile(s)`;
  a.addAction(`All transactions (${s.txns})`);          // 0
  a.addAction('Transactions in a date range…');         // 1
  a.addDestructiveAction('Everything (factory reset)'); // 2
  a.addCancelAction('Cancel');                          // -1
  return a.presentSheet();
}

// Ask for an inclusive YYYY-MM-DD window (same format the rest of the app
// stores/enters dates in). Reversed entries are tolerated by swapping.
async function askDateRange() {
  const a = new Alert();
  a.title = 'Delete a date range';
  a.message = 'Deletes transactions dated within this range (inclusive). Format YYYY-MM-DD.';
  a.addTextField('Start, e.g. 2026-06-01');
  a.addTextField('End, e.g. 2026-06-30');
  a.addAction('Next');
  a.addCancelAction('Cancel');
  if (await a.presentAlert() !== 0) return null;
  const start = String(a.textFieldValue(0)).trim();
  const end = String(a.textFieldValue(1)).trim();
  const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!ok(start) || !ok(end)) {
    await note('Please enter both dates as YYYY-MM-DD.');
    return null;
  }
  return start <= end ? { start, end } : { start: end, end: start };
}

async function deleteRange() {
  const range = await askDateRange();
  if (!range) return;
  const all = storeFile.loadTransactions() || [];
  const { kept, removed } = partitionByDateRange(all, range.start, range.end);
  if (removed.length === 0) {
    await note(`No transactions dated ${range.start} → ${range.end}. Nothing deleted.`);
    return;
  }
  const ok = await confirmDestructive(
    `Delete ${removed.length}`,
    `This permanently deletes ${removed.length} transaction(s) dated ` +
      `${range.start} → ${range.end} (inclusive). ${kept.length} will remain. ` +
      `This cannot be undone.`);
  if (!ok) return;
  storeFile.saveTransactions(kept);
  await note(`Deleted ${removed.length} transaction(s) dated ${range.start} → ${range.end}. ${kept.length} kept.`);
}

async function deleteAllTransactions(s) {
  const ok = await confirmDestructive('Delete transactions',
    `This permanently deletes all ${s.txns} transactions. Your rules, ` +
    `overrides and bank profiles are kept. This cannot be undone.`);
  if (!ok) return;
  clearAll.transactions();
  await note(`Cleared ${s.txns} transactions. Rules, overrides and bank profiles kept.`);
}

async function factoryReset(s) {
  const ok = await confirmDestructive('Delete everything',
    `This permanently deletes EVERYTHING — ${s.txns} transactions, all rules, ` +
    `overrides and bank profiles. The app returns to a brand-new state. ` +
    `This cannot be undone.`);
  if (!ok) return;
  Object.values(clearAll).forEach(fn => fn());
  await note('Factory reset complete. All data cleared — the app is brand new.');
}

async function main() {
  const s = summary();
  const choice = await pickScope(s);
  if (choice === 0) await deleteAllTransactions(s);
  else if (choice === 1) await deleteRange();
  else if (choice === 2) await factoryReset(s);
  // anything else (Cancel) → no-op
}

await main();
