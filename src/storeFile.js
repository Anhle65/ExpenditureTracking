'use strict';

// Scriptable-only: persistence for the three JSON files. Verified on-device.
const fm = FileManager.iCloud();
const DIR = fm.documentsDirectory();

function path(name) { return fm.joinPath(DIR, name); }

function readJson(name, fallback) {
  const p = path(name);
  if (!fm.fileExists(p)) return fallback;
  fm.downloadFileFromiCloud(p);
  try { return JSON.parse(fm.readString(p)); }
  catch (e) { return fallback; }
}

function writeJson(name, value) {
  fm.writeString(path(name), JSON.stringify(value, null, 2));
}

const loadTransactions = () => readJson('transactions.json', []);
const saveTransactions = (txns) => writeJson('transactions.json', txns);
const loadRules = () => readJson('rules.json', []);
const saveRules = (r) => writeJson('rules.json', r);
const loadOverrides = () => readJson('overrides.json', {});
const saveOverrides = (o) => writeJson('overrides.json', o);
const loadBanks = () => readJson('banks.json', null);
const saveBanks = (b) => writeJson('banks.json', b);

module.exports = {
  loadTransactions, saveTransactions,
  loadRules, saveRules,
  loadOverrides, saveOverrides,
  loadBanks, saveBanks,
};
