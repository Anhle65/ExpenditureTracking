'use strict';

const { isNoise, parseAmount, parseDate } = require('./lines');

// Apple Vision (via Shortcuts) returns text by COLUMN, not by row: within a
// date section all merchants appear top-to-bottom, then all amounts in the
// same order. A date header labels the block that FOLLOWS it; rows above the
// first date form a leading block assigned to opts.fallbackDate.
function parseOcr(text, opts = {}) {
  const lines = String(text).split('\n').map(l => l.trim()).filter(Boolean);

  const transactions = [];
  const warnings = [];
  let merchants = [];
  let amounts = [];
  let curDate = { iso: opts.fallbackDate || null, uncertain: true };

  function flush() {
    if (merchants.length === 0 && amounts.length === 0) return;
    if (merchants.length !== amounts.length) {
      warnings.push(
        `Count mismatch on ${curDate.iso || '(no date)'}: ` +
        `${merchants.length} merchants vs ${amounts.length} amounts`);
    }
    const n = Math.min(merchants.length, amounts.length);
    for (let i = 0; i < n; i++) {
      transactions.push({
        date: curDate.iso,
        dateUncertain: curDate.uncertain,
        merchant: merchants[i],
        amount: amounts[i].amount,
        direction: amounts[i].direction,
        // rawText is a reconstruction: merchant and amount come from separate
        // OCR columns, so this pairing never appeared adjacent in the source.
        rawText: `${merchants[i]} ${amounts[i].raw}`,
      });
    }
    merchants = [];
    amounts = [];
  }

  for (const line of lines) {
    const date = parseDate(line);
    if (date) { flush(); curDate = { iso: date.iso, uncertain: date.uncertain }; continue; }
    const amt = parseAmount(line);
    if (amt) { amounts.push({ ...amt, raw: line }); continue; }
    if (isNoise(line)) continue;
    merchants.push(line);
  }
  flush();

  return { transactions, warnings };
}

module.exports = { parseOcr };
