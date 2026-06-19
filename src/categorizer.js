'use strict';

// Strong, low-false-positive transfer signals: a "To:"/"From:" prefix or an
// NZ bank account number (BB-bbbb-AAAAAAA-SS). Bare person-name payees (e.g.
// "Philip Cassidy") can't be told apart from merchants, so those stay
// Uncategorized until the user tags them once (then the override remembers).
const ACCOUNT_RE = /\b\d{2}-\d{3,4}-\d{5,7}-\d{1,3}\b/;

function isTransfer(merchant) {
  const t = String(merchant).trim();
  return /^(to|from):/i.test(t) || ACCOUNT_RE.test(t);
}

// The canonical lookup key for a merchant: trimmed + lowercased. Both the
// category and account override maps are keyed this way, so they share it.
const merchantKey = (merchant) => String(merchant).trim().toLowerCase();

// Priority: learned override → transfer detection → keyword rule → Uncategorized.
// overrides: { <merchant lowercased>: category } — learned from manual fixes.
// rules: [{ pattern, category }] — first substring match wins.
function categorize(merchant, rules = [], overrides = {}) {
  const key = merchantKey(merchant);
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  if (isTransfer(merchant)) return 'Transfer';
  for (const rule of rules) {
    if (key.includes(String(rule.pattern).toLowerCase())) return rule.category;
  }
  return 'Uncategorized';
}

// Which account a merchant belongs to: a learned override (e.g. a Spending-bank
// merchant you've tagged Investment) else the fallback (the bank's default).
// accountOverrides: { <merchant lowercased>: account } — learned from manual moves.
function accountFor(merchant, accountOverrides = {}, fallback = 'Spending') {
  const key = merchantKey(merchant);
  return Object.prototype.hasOwnProperty.call(accountOverrides, key) ? accountOverrides[key] : fallback;
}

module.exports = { categorize, isTransfer, accountFor };
