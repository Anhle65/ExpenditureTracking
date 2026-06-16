'use strict';

const round2 = n => Math.round(n * 100) / 100;
const inMonth = (t, ym) => String(t.date).startsWith(ym);
const inRange = (t, start, end) => { const d = String(t.date); return d >= start && d <= end; };

// --- Range-based (inclusive [start, end], ISO YYYY-MM-DD strings) ---

function totalsInRange(txns, start, end) {
  let out = 0, incoming = 0;
  for (const t of txns) {
    if (!inRange(t, start, end)) continue;
    if (t.direction === 'out') out += t.amount; else incoming += t.amount;
  }
  return { out: round2(out), in: round2(incoming) };
}

function categoryBreakdownInRange(txns, start, end) {
  const totals = {};
  for (const t of txns) {
    if (!inRange(t, start, end) || t.direction !== 'out') continue;
    const cat = t.category || 'Uncategorized';
    totals[cat] = round2((totals[cat] || 0) + t.amount);
  }
  return totals;
}

// --- Month-based convenience wrappers (used by older callers/tests) ---

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

// Outgoing spend grouped by month, sorted ascending. Optional [start, end]
// limits which transactions are included (omit both for all-time).
function trend(txns, start, end) {
  const byMonth = {};
  for (const t of txns) {
    if (t.direction !== 'out') continue;
    if (start && end && !inRange(t, start, end)) continue;
    const ym = String(t.date).slice(0, 7);
    byMonth[ym] = round2((byMonth[ym] || 0) + t.amount);
  }
  return Object.keys(byMonth).sort().map(month => ({ month, out: byMonth[month] }));
}

module.exports = {
  monthlyTotals, byCategory, trend,
  totalsInRange, categoryBreakdownInRange,
};
