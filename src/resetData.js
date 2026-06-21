'use strict';

// Wipe stored data and start clean. Scriptable glue — verified on-device.
// Lets you choose the scope each run:
//   • Transactions only  — clears transactions.json, KEEPS the learned
//     categorization brain (rules, overrides, accountOverrides), bank profiles
//     and settings, so the next import still categorizes correctly.
//   • Everything (factory reset) — clears all six data files; the app returns
//     to a brand-new state and must re-learn from scratch.
// Reuses the storeFile interface (writes each file's empty default) rather than
// touching FileManager directly. Destructive, so it double-confirms first.
const storeFile = importModule('storeFile');

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
  a.addAction(`Transactions only (${s.txns})`);    // 0
  a.addDestructiveAction('Everything (factory reset)'); // 1
  a.addCancelAction('Cancel');                      // -1
  return a.presentSheet();
}

async function confirm(scope, s) {
  const a = new Alert();
  a.title = 'Are you sure?';
  a.message = scope === 'all'
    ? `This permanently deletes EVERYTHING — ${s.txns} transactions, all rules, ` +
      `overrides and bank profiles. The app returns to a brand-new state. ` +
      `This cannot be undone.`
    : `This permanently deletes all ${s.txns} transactions. Your rules, ` +
      `overrides and bank profiles are kept. This cannot be undone.`;
  a.addDestructiveAction(scope === 'all' ? 'Delete everything' : 'Delete transactions');
  a.addCancelAction('Cancel');
  return (await a.presentAlert()) === 0;
}

async function main() {
  const s = summary();
  const choice = await pickScope(s);
  if (choice !== 0 && choice !== 1) return; // cancelled
  const scope = choice === 1 ? 'all' : 'txns';

  if (!(await confirm(scope, s))) return;

  if (scope === 'all') {
    Object.values(clearAll).forEach(fn => fn());
    await note(`Factory reset complete. All data cleared — the app is brand new.`);
  } else {
    clearAll.transactions();
    await note(`Cleared ${s.txns} transactions. Rules, overrides and bank profiles kept.`);
  }
}

await main();
