const test = require('node:test');
const assert = require('node:assert/strict');
const { isNoise, parseAmount, parseDate, levenshtein } = require('../src/lines');

test('isNoise flags status bar, nav, and chrome', () => {
  for (const n of ['21:33', '© D 69%', 'Go', '< Accounts', 'all 2degrees a',
                   '$→', 'Accounts', 'Payments', 'Transfer', 'Cards', 'Apply', '']) {
    assert.equal(isNoise(n), true, `expected noise: ${n}`);
  }
});

test('isNoise keeps merchant names', () => {
  for (const m of ['Sample Store A', 'Sample Mart D', 'Sample Bakery E', 'Sample Eatery B']) {
    assert.equal(isNoise(m), false, `expected NOT noise: ${m}`);
  }
});

test('parseAmount reads sign and value', () => {
  assert.deepEqual(parseAmount('-$12.00'), { amount: 12, direction: 'out' });
  assert.deepEqual(parseAmount('-$1,200.00'), { amount: 1200, direction: 'out' });
  assert.deepEqual(parseAmount('+$50.00'), { amount: 50, direction: 'in' });
  assert.deepEqual(parseAmount('$9.99'), { amount: 9.99, direction: 'in' });
  assert.equal(parseAmount('Sample Store A'), null);
  assert.equal(parseAmount('21:33'), null);
});

test('parseDate reads a clean date to ISO', () => {
  assert.deepEqual(parseDate('FRI 12 JUN 2026'),
    { iso: '2026-06-12', day: 12, month: 6, year: 2026, uncertain: false });
});

test('parseDate flags an unreadable month', () => {
  const d = parseDate('WED 10 IN 2026');
  assert.equal(d.iso, null);
  assert.equal(d.uncertain, true);
});

test('parseDate returns null for non-dates', () => {
  assert.equal(parseDate('Sample Store A'), null);
  assert.equal(parseDate('-$12.00'), null);
});

test('levenshtein basic distances', () => {
  assert.equal(levenshtein('JUN', 'JUN'), 0);
  assert.equal(levenshtein('JUL', 'JUN'), 1);
});

test('parseDate fuzzy-corrects a unique 1-edit month typo', () => {
  // 'JAM' is edit-distance 1 from JAN only (others >= 2) -> confident correction
  assert.deepEqual(parseDate('FRI 12 JAM 2026'),
    { iso: '2026-01-12', day: 12, month: 1, year: 2026, uncertain: false });
});

test('parseDate flags an ambiguous (tied) fuzzy month as uncertain', () => {
  // 'MAX' is edit-distance 1 from BOTH MAR and MAY -> ambiguous, must not guess
  const d = parseDate('FRI 12 MAX 2026');
  assert.equal(d.iso, null);
  assert.equal(d.uncertain, true);
});

test('parseDate rejects an out-of-range day as uncertain', () => {
  const hi = parseDate('MON 99 JUN 2026');
  assert.equal(hi.iso, null);
  assert.equal(hi.uncertain, true);
  const lo = parseDate('MON 00 JUN 2026');
  assert.equal(lo.iso, null);
  assert.equal(lo.uncertain, true);
});
