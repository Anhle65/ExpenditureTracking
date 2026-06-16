'use strict';

const round2 = n => Math.round(n * 100) / 100;
const inMonth = (t, ym) => String(t.date).startsWith(ym);

function monthlyTotals(txns, ym) {
  let out = 0, incoming = 0;
  for (const t of txns) {
    if (!inMonth(t, ym)) continue;
    if (t.direction === 'out') out += t.amount; else incoming += t.amount;
  }
  return { out: round2(out), in: round2(incoming) };
}

function byCategory(txns, ym) {
  const totals = {};
  for (const t of txns) {
    if (!inMonth(t, ym) || t.direction !== 'out') continue;
    const cat = t.category || 'Uncategorized';
    totals[cat] = round2((totals[cat] || 0) + t.amount);
  }
  return totals;
}

function trend(txns) {
  const byMonth = {};
  for (const t of txns) {
    if (t.direction !== 'out') continue;
    const ym = String(t.date).slice(0, 7);
    byMonth[ym] = round2((byMonth[ym] || 0) + t.amount);
  }
  return Object.keys(byMonth).sort().map(month => ({ month, out: byMonth[month] }));
}

module.exports = { monthlyTotals, byCategory, trend };
