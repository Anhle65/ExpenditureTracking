'use strict';

// overrides: { <merchant lowercased>: category } — learned from manual fixes.
// rules: [{ pattern, category }] — first substring match wins.
function categorize(merchant, rules = [], overrides = {}) {
  const key = String(merchant).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  for (const rule of rules) {
    if (key.includes(String(rule.pattern).toLowerCase())) return rule.category;
  }
  return 'Uncategorized';
}

module.exports = { categorize };
