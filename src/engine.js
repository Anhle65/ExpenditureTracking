'use strict';

const { isNoise, parseAmount, parseDate } =
  (typeof require !== 'undefined') ? require('./lines') : importModule('lines');

const UNSIGNED_AMOUNT_RE = /^\$[\d,]+\.\d{2}$/;          // a balance (no sign)
const ACCOUNT_LINE_RE = /^\d{2}-\d{3,4}-\d{5,7}-\d{1,3}$/; // bare account number

// Classify a line into granular types. The order matters: balances and account
// numbers are split out from generic noise so the row-stacked layout can tell a
// balance row (ends an entry) from an account-number line (sits mid-row and must
// NOT drop the description buffer).
function classify(line, profile) {
  const t = String(line).trim();
  const date = parseDate(t);
  if (date) return { type: 'date', date };
  const amt = parseAmount(t);
  if (amt) return { type: 'amount', amt, raw: t };
  if (UNSIGNED_AMOUNT_RE.test(t)) return { type: 'balance' };
  if (ACCOUNT_LINE_RE.test(t)) return { type: 'account' };
  if (isNoise(t, profile.noiseWords)) return { type: 'noise' };
  return { type: 'desc', text: t };
}

// Bank 1: within a date segment all descriptions come first, then all amounts,
// in the same order. A date header labels the block that follows it; the leading
// block uses opts.fallbackDate.
function columnZip(tokens, opts) {
  const transactions = [];
  const warnings = [];
  let merchants = [];
  let amounts = [];
  let curDate = { iso: opts.fallbackDate || null, uncertain: true };

  function flush() {
    if (merchants.length === 0 && amounts.length === 0) return;
    if (merchants.length !== amounts.length) {
      warnings.push(`Count mismatch on ${curDate.iso || '(no date)'}: ` +
        `${merchants.length} merchants vs ${amounts.length} amounts`);
    }
    const n = Math.min(merchants.length, amounts.length);
    for (let i = 0; i < n; i++) {
      transactions.push({
        date: curDate.iso, dateUncertain: curDate.uncertain,
        merchant: merchants[i], amount: amounts[i].amt.amount,
        direction: amounts[i].amt.direction,
        rawText: `${merchants[i]} ${amounts[i].raw}`,
      });
    }
    merchants = []; amounts = [];
  }

  for (const tok of tokens) {
    if (tok.type === 'date') { flush(); curDate = { iso: tok.date.iso, uncertain: tok.date.uncertain }; continue; }
    if (tok.type === 'amount') { amounts.push(tok); continue; }
    if (tok.type === 'desc') { merchants.push(tok.text); continue; }
    // balance / account / noise ignored
  }
  flush();
  return { transactions, warnings };
}

function parseWithProfile(text, profile, opts = {}) {
  const lines = String(text).split('\n').map(l => l.trim()).filter(Boolean);
  const tokens = lines.map(l => classify(l, profile));
  if (profile.layout === 'row-stacked') return rowStacked(tokens, opts);
  return columnZip(tokens, opts);
}

// Bank 2: each row is description line(s) → (account number) → a signed amount
// (transaction) or an unsigned balance (not a transaction). The description
// buffer accumulates desc lines. An `account` line is skipped WITHOUT clearing
// the buffer (it sits between description and amount). A `balance`, `noise`, or
// `date` ends a row, so the buffer is reset (a balance row's description must not
// attach to the next transaction). A signed `amount` emits a transaction.
function rowStacked(tokens, opts) {
  const transactions = [];
  const warnings = [];
  let curDate = { iso: opts.fallbackDate || null, uncertain: true };
  let buffer = [];

  for (const tok of tokens) {
    if (tok.type === 'date') { curDate = { iso: tok.date.iso, uncertain: tok.date.uncertain }; buffer = []; continue; }
    if (tok.type === 'account') continue;                 // mid-row reference: keep the buffer
    if (tok.type === 'balance' || tok.type === 'noise') { buffer = []; continue; } // ends a non-transaction row
    if (tok.type === 'desc') { buffer.push(tok.text); continue; }
    if (tok.type === 'amount') {
      const merchant = buffer.join(' ').trim() || '(unknown)';
      transactions.push({
        date: curDate.iso, dateUncertain: curDate.uncertain,
        merchant, amount: tok.amt.amount, direction: tok.amt.direction,
        rawText: `${merchant} ${tok.raw}`,
      });
      buffer = [];
    }
  }
  return { transactions, warnings };
}

module.exports = { parseWithProfile };
