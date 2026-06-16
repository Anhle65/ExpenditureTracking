# Expenditure Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal iPhone expense tracker that parses bank-screenshot OCR text into categorized transactions, stores them in JSON on-device, and shows a dashboard — all via iOS Shortcuts + Scriptable, with the core logic authored and tested on Linux.

**Architecture:** Pure JavaScript modules (line classification, parser, categorizer, store, aggregation) written CommonJS-style so the *same files* run under Node's test runner on Linux and under Scriptable's `importModule` on the phone. Thin Scriptable scripts (`import.js`, `dashboard.js`) wire those modules to iOS (share-sheet input, `FileManager`, `UITable`, `WebView`). An iOS Shortcut does the Apple Vision OCR.

**Tech Stack:** iOS Shortcuts (OCR), Scriptable (JS runtime + storage + UI), Node.js + `node:test` (Linux unit tests), no third-party npm dependencies.

**Reference:** `docs/superpowers/specs/2026-06-08-expenditure-tracker-design.md` — read it first. The critical gotcha: Apple Vision via Shortcuts returns text grouped **by column, not by row**, so the parser pairs merchants↔amounts by order within a date segment ("zip").

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | Node test script, no deps |
| `src/lines.js` | Pure: classify a single OCR line — `isNoise`, `parseAmount`, `parseDate`, `levenshtein` |
| `src/parser.js` | Pure: `parseOcr(text, opts)` — noise filter → date segmentation → zip → transactions |
| `src/categorizer.js` | Pure: `categorize(merchant, rules, overrides)` |
| `src/store.js` | Pure: `fnv1a`, `makeId`, `dedupe` (dedupe key + merge logic) |
| `src/aggregate.js` | Pure: `monthlyTotals`, `byCategory`, `trend` for the dashboard |
| `src/storeFile.js` | Scriptable-only: read/write JSON via `FileManager` (manual test) |
| `src/import.js` | Scriptable entry: share-sheet → parse → categorize → dedupe → confirm → save |
| `src/dashboard.js` | Scriptable entry: load data → aggregate → render `WebView` |
| `src/recategorize.js` | Scriptable entry: native `UITable` editable list for manual category override |
| `src/sync.js` | Scriptable bootstrap loader: fetch latest `.js` from repo, write locally |
| `test/*.test.js` | Node tests + the real OCR fixture |

All `src/*.js` are flat so Scriptable's `importModule('parser')` resolves them after they're placed in the Scriptable folder.

---

## Task 0: Project setup

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `test/fixtures/2degrees-sample.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "expenditure-tracker",
  "version": "0.1.0",
  "private": true,
  "description": "Personal iPhone expense tracker (Shortcuts + Scriptable)",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.DS_Store
*.log
```

- [ ] **Step 3: Create the real OCR fixture** `test/fixtures/2degrees-sample.js`

This is the exact text Apple Vision produced from a real NZ bank screenshot — it is the ground truth every parser test runs against.

```js
// Real OCR output from a 2degrees (NZ) bank transaction screenshot.
module.exports = `all 2degrees a
< Accounts
Sample Cafe One
Sample Cafe One
21:33
Go
© D 69%
-$12.00
-$34.00
FRI 12 JUN 2026
Sample Store A
Sample Eatery B
Sample Butcher C
Sample Butcher C
Sample Mart D
-$10.00
-$2.50
-$99.00
-$40.00
-$15.00
THU 11 JUN 2026
Sample Bakery E
-$5.00
WED 10 IN 2026
$→
Accounts
Payments
Transfer
Cards
Apply`;
```

- [ ] **Step 4: Verify Node runs the (empty) test suite**

Run: `node --test`
Expected: exits 0 with "tests 0" (no test files yet) — confirms Node works.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore test/fixtures/2degrees-sample.js
git commit -m "chore: project setup + real OCR fixture"
```

---

## Task 1: Line classification (`src/lines.js`)

**Files:**
- Create: `src/lines.js`
- Test: `test/lines.test.js`

- [ ] **Step 1: Write the failing test** `test/lines.test.js`

```js
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
  for (const m of ['Sample Store A', 'Sample Mart D', 'Sample Bakery E', "Sample Eatery B"]) {
    assert.equal(isNoise(m), false, `expected NOT noise: ${m}`);
  }
});

test('parseAmount reads sign and value', () => {
  assert.deepEqual(parseAmount('-$12.00'), { amount: 12.00, direction: 'out' });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lines.test.js`
Expected: FAIL — "Cannot find module '../src/lines'".

- [ ] **Step 3: Write the implementation** `src/lines.js`

```js
'use strict';

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const NOISE_WORDS = new Set(['accounts','payments','transfer','cards','apply','go']);

function isNoise(line) {
  const t = String(line).trim();
  if (t === '') return true;
  if (/^\d{1,2}:\d{2}$/.test(t)) return true;        // time, e.g. 21:33
  if (/%/.test(t)) return true;                       // battery, e.g. © D 69%
  if (/2degrees/i.test(t)) return true;               // app title bar
  if (t.startsWith('<')) return true;                 // back chrome, e.g. < Accounts
  if (NOISE_WORDS.has(t.toLowerCase())) return true;  // bottom nav words
  if (!/[a-z0-9]/i.test(t)) return true;              // symbols only, e.g. $→
  return false;
}

const AMOUNT_RE = /^([-+]?)\$([\d,]+\.\d{2})$/;

function parseAmount(line) {
  const m = String(line).trim().match(AMOUNT_RE);
  if (!m) return null;
  return {
    amount: parseFloat(m[2].replace(/,/g, '')),
    direction: m[1] === '-' ? 'out' : 'in',
  };
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

const DATE_RE = /\b(MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{1,2})\s+([A-Z]{2,5})\s+(\d{4})\b/;

function parseDate(line) {
  const m = String(line).trim().toUpperCase().match(DATE_RE);
  if (!m) return null;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[4], 10);
  const token = m[3].slice(0, 3);
  let idx = MONTHS.indexOf(token);
  if (idx === -1) {
    let best = -1, bestD = 99;
    MONTHS.forEach((mo, i) => { const d = levenshtein(token, mo); if (d < bestD) { bestD = d; best = i; } });
    if (bestD <= 1) idx = best;
  }
  if (idx === -1) return { iso: null, day, month: null, year, uncertain: true };
  const iso = `${year}-${String(idx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { iso, day, month: idx + 1, year, uncertain: false };
}

module.exports = { isNoise, parseAmount, parseDate, levenshtein };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/lines.test.js`
Expected: PASS — all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lines.js test/lines.test.js
git commit -m "feat: OCR line classification (noise, amount, date)"
```

---

## Task 2: OCR parser (`src/parser.js`)

**Files:**
- Create: `src/parser.js`
- Test: `test/parser.test.js`

- [ ] **Step 1: Write the failing test** `test/parser.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseOcr } = require('../src/parser');
const sample = require('./fixtures/2degrees-sample');

test('parses the real fixture into 8 transactions', () => {
  const { transactions, warnings } = parseOcr(sample, { fallbackDate: '2026-06-13' });
  assert.equal(transactions.length, 8);
  assert.deepEqual(warnings, []);
});

test('leading block (above first date) uses fallbackDate, flagged uncertain', () => {
  const { transactions } = parseOcr(sample, { fallbackDate: '2026-06-13' });
  const lead = transactions.slice(0, 2);
  assert.deepEqual(lead.map(t => t.merchant), ['Sample Cafe One', 'Sample Cafe One']);
  assert.deepEqual(lead.map(t => t.amount), [12.00, 34.00]);
  assert.equal(lead[0].date, '2026-06-13');
  assert.equal(lead[0].dateUncertain, true);
  assert.equal(lead[0].direction, 'out');
});

test('a date header labels the block that follows it (zip by order)', () => {
  const { transactions } = parseOcr(sample, { fallbackDate: '2026-06-13' });
  const fri = transactions.filter(t => t.date === '2026-06-12');
  assert.deepEqual(fri.map(t => t.merchant),
    ['Sample Store A', "Sample Eatery B", 'Sample Butcher C', 'Sample Butcher C', 'Sample Mart D']);
  assert.deepEqual(fri.map(t => t.amount), [10.00, 2.50, 99.00, 40.00, 15.00]);
  assert.equal(fri.every(t => t.direction === 'out'), true);
  assert.equal(fri.every(t => t.dateUncertain === false), true);

  const thu = transactions.filter(t => t.date === '2026-06-11');
  assert.deepEqual(thu.map(t => t.merchant), ['Sample Bakery E']);
  assert.deepEqual(thu.map(t => t.amount), [5.00]);
});

test('emits a warning when a segment has mismatched counts', () => {
  const text = 'FRI 12 JUN 2026\nMerchant A\nMerchant B\n-$10.00';
  const { transactions, warnings } = parseOcr(text, {});
  assert.equal(transactions.length, 1);          // zips the min (1 pair)
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /mismatch/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/parser.test.js`
Expected: FAIL — "Cannot find module '../src/parser'".

- [ ] **Step 3: Write the implementation** `src/parser.js`

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/parser.test.js`
Expected: PASS — all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/parser.js test/parser.test.js
git commit -m "feat: column-zip OCR parser with date segmentation"
```

---

## Task 3: Categorizer (`src/categorizer.js`)

**Files:**
- Create: `src/categorizer.js`
- Test: `test/categorizer.test.js`

- [ ] **Step 1: Write the failing test** `test/categorizer.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { categorize } = require('../src/categorizer');

const RULES = [
  { pattern: 'sample mart', category: 'Groceries' },
  { pattern: 'sample butcher', category: 'Groceries' },
  { pattern: 'bakery', category: 'Dining' },
];

test('matches a keyword rule (case-insensitive, substring)', () => {
  assert.equal(categorize('Sample Mart D', RULES, {}), 'Groceries');
  assert.equal(categorize('Sample Bakery E', RULES, {}), 'Dining');
});

test('override beats rules and is exact on the merchant', () => {
  const overrides = { 'sample store a': 'Dining' };
  assert.equal(categorize('Sample Store A', RULES, overrides), 'Dining');
});

test('unmatched merchant is Uncategorized', () => {
  assert.equal(categorize('Sample Cafe One', RULES, {}), 'Uncategorized');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/categorizer.test.js`
Expected: FAIL — "Cannot find module '../src/categorizer'".

- [ ] **Step 3: Write the implementation** `src/categorizer.js`

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/categorizer.test.js`
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/categorizer.js test/categorizer.test.js
git commit -m "feat: keyword + override categorizer"
```

---

## Task 4: Store dedupe (`src/store.js`)

**Files:**
- Create: `src/store.js`
- Test: `test/store.test.js`

- [ ] **Step 1: Write the failing test** `test/store.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeId, dedupe } = require('../src/store');

const txn = (date, amount, merchant) => ({ date, amount, merchant, direction: 'out' });

test('makeId is deterministic and order-stable', () => {
  const a = makeId(txn('2026-06-12', 10.00, 'Sample Store A'));
  const b = makeId(txn('2026-06-12', 10.00, 'Sample Store A'));
  assert.equal(a, b);
});

test('makeId differs when any key field differs', () => {
  const base = makeId(txn('2026-06-12', 10.00, 'Sample Store A'));
  assert.notEqual(base, makeId(txn('2026-06-12', 10.01, 'Sample Store A')));
  assert.notEqual(base, makeId(txn('2026-06-11', 10.00, 'Sample Store A')));
  assert.notEqual(base, makeId(txn('2026-06-12', 10.00, 'Sample Mart D')));
});

test('dedupe skips already-stored transactions and stamps ids', () => {
  const existing = [{ ...txn('2026-06-12', 10.00, 'Sample Store A'), id: makeId(txn('2026-06-12', 10.00, 'Sample Store A')) }];
  const incoming = [
    txn('2026-06-12', 10.00, 'Sample Store A'),   // duplicate
    txn('2026-06-11', 5.00, 'Sample Bakery E'),  // new
  ];
  const { added, skipped } = dedupe(existing, incoming);
  assert.equal(skipped, 1);
  assert.equal(added.length, 1);
  assert.equal(added[0].merchant, 'Sample Bakery E');
  assert.ok(added[0].id, 'added transaction is stamped with an id');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/store.test.js`
Expected: FAIL — "Cannot find module '../src/store'".

- [ ] **Step 3: Write the implementation** `src/store.js`

```js
'use strict';

// FNV-1a 32-bit hash → hex. Pure JS so it runs identically in Node and
// Scriptable (no Node 'crypto' dependency).
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function makeId(t) {
  return fnv1a(`${t.date}|${t.amount}|${t.merchant}`);
}

// existing: stored transactions (each already has .id).
// incoming: freshly parsed transactions (no id yet).
// Returns { added: [...with id], skipped: <count of duplicates> }.
function dedupe(existing, incoming) {
  const seen = new Set(existing.map(t => t.id));
  const added = [];
  let skipped = 0;
  for (const t of incoming) {
    const id = makeId(t);
    if (seen.has(id)) { skipped++; continue; }
    seen.add(id);
    added.push({ ...t, id });
  }
  return { added, skipped };
}

module.exports = { fnv1a, makeId, dedupe };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/store.test.js`
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store.js test/store.test.js
git commit -m "feat: dedupe + stable transaction id"
```

---

## Task 5: Dashboard aggregations (`src/aggregate.js`)

**Files:**
- Create: `src/aggregate.js`
- Test: `test/aggregate.test.js`

- [ ] **Step 1: Write the failing test** `test/aggregate.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { monthlyTotals, byCategory, trend } = require('../src/aggregate');

const DATA = [
  { date: '2026-06-12', amount: 10.00, direction: 'out', category: 'Groceries' },
  { date: '2026-06-12', amount: 2.50,  direction: 'out', category: 'Dining' },
  { date: '2026-06-11', amount: 5.00,  direction: 'out', category: 'Dining' },
  { date: '2026-06-10', amount: 100.0, direction: 'in',  category: 'Income' },
  { date: '2026-05-30', amount: 50.0,  direction: 'out', category: 'Groceries' },
];

test('monthlyTotals sums out vs in for the given month', () => {
  assert.deepEqual(monthlyTotals(DATA, '2026-06'), { out: 17.50, in: 100.0 });
});

test('byCategory sums outgoing spend per category for the month', () => {
  assert.deepEqual(byCategory(DATA, '2026-06'), { Groceries: 10.00, Dining: 7.50 });
});

test('trend groups outgoing spend by month, sorted ascending', () => {
  assert.deepEqual(trend(DATA), [
    { month: '2026-05', out: 50.0 },
    { month: '2026-06', out: 17.50 },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/aggregate.test.js`
Expected: FAIL — "Cannot find module '../src/aggregate'".

- [ ] **Step 3: Write the implementation** `src/aggregate.js`

```js
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
    totals[t.category] = round2((totals[t.category] || 0) + t.amount);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/aggregate.test.js`
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Run the full suite and commit**

Run: `node --test`
Expected: PASS — all tests across all files pass (Tasks 1–5).

```bash
git add src/aggregate.js test/aggregate.test.js
git commit -m "feat: dashboard aggregations (monthly, category, trend)"
```

---

## Task 6: Scriptable storage layer (`src/storeFile.js`)

This module touches `FileManager`, so it is verified **manually on the phone**, not by Node. It reads/writes the three JSON files in Scriptable's iCloud documents folder.

**Files:**
- Create: `src/storeFile.js`

- [ ] **Step 1: Write the implementation** `src/storeFile.js`

```js
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
const loadOverrides = () => readJson('overrides.json', {});
const saveOverrides = (o) => writeJson('overrides.json', o);

module.exports = {
  loadTransactions, saveTransactions, loadRules, loadOverrides, saveOverrides,
};
```

- [ ] **Step 2: Manual verification (on phone, after Task 10 sync)**

In Scriptable, create a scratch script:
```js
const s = importModule('storeFile');
s.saveTransactions([{ id: 't1', date: '2026-06-12', amount: 1, merchant: 'Test', direction: 'out', category: 'X' }]);
console.log(JSON.stringify(s.loadTransactions()));
```
Expected: logs the one transaction back. Confirms read/write round-trips.

- [ ] **Step 3: Commit**

```bash
git add src/storeFile.js
git commit -m "feat: Scriptable JSON storage layer"
```

---

## Task 7: Scriptable import flow (`src/import.js`)

Entry point the Shortcut calls with OCR text. Verified manually on the phone. Shows a `UITable` confirm screen (the safety net for mispaired segments) before saving.

**Files:**
- Create: `src/import.js`

- [ ] **Step 1: Write the implementation** `src/import.js`

```js
'use strict';

// Called by the "Import Expenses" Shortcut. The Shortcut runs Apple Vision OCR
// ("Extract Text from Image") and passes the text as the script parameter.
const { parseOcr } = importModule('parser');
const { categorize } = importModule('categorizer');
const { dedupe } = importModule('store');
const storeFile = importModule('storeFile');

async function main() {
  const ocrText = (args.plainTexts && args.plainTexts[0]) || args.shortcutParameter || '';
  if (!ocrText) { await note('No OCR text received from the Shortcut.'); return; }

  const today = new Date().toISOString().slice(0, 10); // screenshot/today fallback
  const { transactions, warnings } = parseOcr(ocrText, { fallbackDate: today });

  if (transactions.length === 0) {
    await note('No transactions found. Raw OCR text:\n\n' + ocrText);
    return;
  }

  const rules = storeFile.loadRules();
  const overrides = storeFile.loadOverrides();
  for (const t of transactions) t.category = categorize(t.merchant, rules, overrides);

  const existing = storeFile.loadTransactions();
  const { added, skipped } = dedupe(existing, transactions);

  const proceed = await confirm(added, skipped, warnings);
  if (!proceed) return;

  added.forEach(t => { t.source = 'ocr'; });
  storeFile.saveTransactions(existing.concat(added));
  await note(`Saved ${added.length} transaction(s). Skipped ${skipped} duplicate(s).`);
}

function confirm(added, skipped, warnings) {
  const table = new UITable();
  table.showSeparators = true;

  const header = new UITableRow();
  header.isHeader = true;
  header.addText(`Import ${added.length}  ·  Skip ${skipped} dup`);
  table.addRow(header);

  for (const w of warnings) {
    const r = new UITableRow();
    r.addText('⚠️ ' + w);
    table.addRow(r);
  }

  for (const t of added) {
    const r = new UITableRow();
    const sign = t.direction === 'out' ? '-' : '+';
    const flag = t.dateUncertain ? ' ⚠︎' : '';
    r.addText(`${t.merchant}${flag}`, `${t.date} · ${t.category}`);
    const amt = r.addText(`${sign}$${t.amount.toFixed(2)}`);
    amt.rightAligned();
    table.addRow(r);
  }

  const actions = new UITableRow();
  const yes = actions.addButton('✅ Save all');
  yes.onTap = () => { table.dismiss(); decision = true; };
  const no = actions.addButton('✖ Cancel');
  no.onTap = () => { table.dismiss(); decision = false; };
  table.addRow(actions);

  let decision = false;
  return table.present().then(() => decision);
}

async function note(message) {
  const a = new Alert();
  a.title = 'Expense Import';
  a.message = message;
  a.addAction('OK');
  await a.present();
}

await main();
```

- [ ] **Step 2: Manual verification (on phone, after Tasks 8 & 10)**

Run the "Import Expenses" Shortcut on a bank screenshot.
Expected: a confirm table lists parsed transactions with categories; tapping "Save all" writes them and shows a "Saved N" alert; re-running on the same screenshot reports them as skipped duplicates.

- [ ] **Step 3: Commit**

```bash
git add src/import.js
git commit -m "feat: Scriptable import flow with confirm screen"
```

---

## Task 8: Scriptable dashboard (`src/dashboard.js`)

Home-screen entry. Loads transactions, aggregates, renders an offline HTML page in a `WebView`. Verified manually on the phone. Uses inline SVG bars (no chart library / no network) to honor the "offline, no CDN" constraint.

**Files:**
- Create: `src/dashboard.js`

- [ ] **Step 1: Write the implementation** `src/dashboard.js`

```js
'use strict';

const { monthlyTotals, byCategory, trend } = importModule('aggregate');
const storeFile = importModule('storeFile');

const txns = storeFile.loadTransactions();
const ym = new Date().toISOString().slice(0, 7);

const totals = monthlyTotals(txns, ym);
const cats = byCategory(txns, ym);
const months = trend(txns);

function bars(map) {
  const entries = Object.entries(map);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return entries.map(([k, v]) =>
    `<div class="row"><span class="lbl">${k}</span>` +
    `<span class="bar" style="width:${(v / max * 100).toFixed(1)}%"></span>` +
    `<span class="val">$${v.toFixed(2)}</span></div>`).join('');
}

function trendBars(list) {
  const max = Math.max(1, ...list.map(m => m.out));
  return list.map(m =>
    `<div class="row"><span class="lbl">${m.month}</span>` +
    `<span class="bar" style="width:${(m.out / max * 100).toFixed(1)}%"></span>` +
    `<span class="val">$${m.out.toFixed(2)}</span></div>`).join('');
}

const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font:16px -apple-system;margin:0;padding:16px;background:#111;color:#eee}
  h1{font-size:20px} h2{font-size:15px;color:#9af;margin-top:24px}
  .tot{font-size:28px;font-weight:700}
  .out{color:#f87} .in{color:#7f7}
  .row{display:flex;align-items:center;gap:8px;margin:6px 0}
  .lbl{width:110px;font-size:13px;color:#bbb;overflow:hidden;white-space:nowrap}
  .bar{height:14px;background:#5a8;border-radius:3px;min-width:2px}
  .val{margin-left:auto;font-variant-numeric:tabular-nums}
</style></head><body>
  <h1>${ym} Spending</h1>
  <div class="tot"><span class="out">-$${totals.out.toFixed(2)}</span>
    &nbsp;·&nbsp;<span class="in">+$${totals.in.toFixed(2)}</span></div>
  <h2>By category</h2>${bars(cats) || '<p>No spend yet.</p>'}
  <h2>Trend (monthly out)</h2>${trendBars(months) || '<p>No history yet.</p>'}
</body></html>`;

const wv = new WebView();
await wv.loadHTML(html);
await wv.present(true);
```

- [ ] **Step 2: Manual verification (on phone, after Task 10)**

Tap the "Expense Dashboard" script/icon.
Expected: a dark page showing this month's out/in totals, a category bar list, and a monthly-trend bar list, reflecting whatever the import flow saved.

- [ ] **Step 3: Commit**

```bash
git add src/dashboard.js
git commit -m "feat: Scriptable WebView dashboard"
```

---

## Task 9: Manual override / recategorize (`src/recategorize.js`)

Satisfies the "keyword rules + **manual override**" requirement and the editable
transaction list. Native `UITable` (tap a transaction → pick a category) instead
of two-way WebView editing. Each fix is also saved to `overrides.json` so future
imports of that merchant auto-apply it. Verified manually on the phone.

**Files:**
- Create: `src/recategorize.js`

- [ ] **Step 1: Write the implementation** `src/recategorize.js`

```js
'use strict';

// "Recategorize" — native editable list. Tap a row to change its category;
// the choice is remembered in overrides.json for future imports.
const storeFile = importModule('storeFile');

const txns = storeFile.loadTransactions();
const overrides = storeFile.loadOverrides();
const rules = storeFile.loadRules();

function categoryChoices() {
  const set = new Set(['Groceries', 'Dining', 'Transport', 'Bills', 'Shopping', 'Income', 'Uncategorized']);
  rules.forEach(r => set.add(r.category));
  txns.forEach(t => { if (t.category) set.add(t.category); });
  return [...set];
}

async function pickCategory(current) {
  const sheet = new Alert();
  sheet.title = 'Category';
  sheet.message = `Currently: ${current}`;
  const choices = categoryChoices();
  choices.forEach(c => sheet.addAction(c));
  sheet.addCancelAction('Cancel');
  const idx = await sheet.presentSheet();
  return idx === -1 ? null : choices[idx];
}

const table = new UITable();
table.showSeparators = true;

function render() {
  table.removeAllRows();
  for (const t of txns) {
    const row = new UITableRow();
    const sign = t.direction === 'out' ? '-' : '+';
    row.addText(t.merchant, `${t.date} · ${t.category}`);
    const amt = row.addText(`${sign}$${t.amount.toFixed(2)}`);
    amt.rightAligned();
    row.onSelect = async () => {
      const cat = await pickCategory(t.category);
      if (cat) {
        t.category = cat;
        overrides[t.merchant.toLowerCase()] = cat; // learn for future imports
        storeFile.saveTransactions(txns);
        storeFile.saveOverrides(overrides);
        render();
        table.reload();
      }
    };
    table.addRow(row);
  }
}

render();
await table.present();
```

- [ ] **Step 2: Manual verification (on phone, after Task 10 sync)**

Run the **Recategorize** script after importing some transactions.
Expected: a tappable list; tapping a row shows a category action sheet; picking
one updates the row's category, and a re-import of that merchant later
auto-applies the chosen category (override learned).

- [ ] **Step 3: Commit**

```bash
git add src/recategorize.js
git commit -m "feat: native recategorize / manual override flow"
```

---

## Task 10: Bootstrap loader + onboarding (`src/sync.js`, `docs/ONBOARDING.md`)

Gets code from Linux onto the phone: a loader fetches each `.js` from the repo's raw URL and writes it into Scriptable's folder so `importModule` resolves it.

**Files:**
- Create: `src/sync.js`
- Create: `docs/ONBOARDING.md`

- [ ] **Step 1: Write the loader** `src/sync.js`

Replace `RAW_BASE` with your repo's raw base URL once pushed.

```js
'use strict';

// One-time-paste bootstrap. Run it to pull the latest module files from the
// repo into Scriptable's folder. Only CODE is fetched; transaction DATA never
// leaves the phone.
const RAW_BASE = 'https://raw.githubusercontent.com/<you>/ExpenditureTracking/main/src';
const FILES = ['lines.js', 'parser.js', 'categorizer.js', 'store.js',
               'aggregate.js', 'storeFile.js', 'import.js', 'dashboard.js',
               'recategorize.js'];

const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();

for (const name of FILES) {
  const req = new Request(`${RAW_BASE}/${name}`);
  const code = await req.loadString();
  fm.writeString(fm.joinPath(dir, name), code);
  console.log(`synced ${name} (${code.length} bytes)`);
}

const a = new Alert();
a.title = 'Sync complete';
a.message = `Pulled ${FILES.length} files.`;
a.addAction('OK');
await a.present();
```

- [ ] **Step 2: Write onboarding** `docs/ONBOARDING.md`

```markdown
# First-Run Setup

## 1. Install Scriptable
App Store → install **Scriptable** (free).

## 2. Load the code
- In Scriptable, tap **+**, paste the contents of `src/sync.js`, set `RAW_BASE`
  to your repo, name it **Sync**, and run it once. It pulls all module files in.
- Whenever you change code on Linux: `git push`, then run **Sync** again.
- Fallback (no network): paste each `src/*.js` into a same-named Scriptable script.

## 3. Build the capture Shortcut
Shortcuts app → **＋** → add **Extract Text from Image** (input: Shortcut Input)
→ add **Run Script** (Scriptable: run **import**, pass **Extracted Text** as the
parameter). In Details, enable **Show in Share Sheet**, accept **Images**. Name
it **Import Expenses**.

## 4. Add Home Screen icons
Long-press the **dashboard** script in Scriptable → **Add to Home Screen** for a
one-tap dashboard. (Optional: same for **Import Expenses** Shortcut.)

## 5. Seed your category rules
Create `rules.json` in Scriptable's iCloud folder, e.g.:
```json
[
  { "pattern": "sample mart", "category": "Groceries" },
  { "pattern": "sample grocer", "category": "Groceries" },
  { "pattern": "sample butcher", "category": "Groceries" },
  { "pattern": "bakery", "category": "Dining" }
]
```

## 6. Use it
Screenshot your bank's transaction list → Share → **Import Expenses** → review
the confirm screen → Save. Open **Expense Dashboard** to see totals.
```

- [ ] **Step 3: Run the full test suite one final time**

Run: `node --test`
Expected: PASS — every test from Tasks 1–5 passes.

- [ ] **Step 4: Commit**

```bash
git add src/sync.js docs/ONBOARDING.md
git commit -m "feat: bootstrap loader + onboarding guide"
```

---

## Done — Definition of Success

- `node --test` is green (parser, categorizer, store, aggregations all covered, including the real 2degrees fixture).
- On the phone: sharing a bank screenshot to **Import Expenses** parses, categorizes, de-dupes, shows a confirm screen, and saves; **Expense Dashboard** shows monthly out/in, by-category, and trend.
- No Mac, no App Store, no paid services used.
```
