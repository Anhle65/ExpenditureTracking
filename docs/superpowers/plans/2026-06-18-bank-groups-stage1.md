# Bank Groups Stage 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalise the OCR parser into a profile-driven engine that supports multiple banks (bank 1 = `column-zip` layout, bank 2 = `row-stacked` layout), auto-detecting which bank a screenshot is from, with zero regression to current bank-1 behaviour.

**Architecture:** A pure `engine.parseWithProfile(ocr, profile, opts)` classifies each OCR line (noise/date/amount/description) using profile config, then assembles transactions with one of two layout strategies. Built-in profiles for bank 1 and bank 2 live in `profiles.js`. `detect.detectBank(ocr, banks)` picks a profile by signature. The existing `parseOcr` becomes a thin wrapper over the engine with the bank-1 profile so all current tests stay green.

**Tech Stack:** Pure CommonJS modules (Node `node:test` on Linux, Scriptable `importModule` on device); no third-party deps. Scriptable for the import UI.

**Reference:** `docs/superpowers/specs/2026-06-18-bank-groups-design.md`. This plan is **Stage 1 only**; Manage Banks UI (Stage 2) and inference (Stage 3) are separate plans.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lines.js` (modify) | `isNoise` gains an optional extra-noise-words arg; `parseAmount`/`parseDate` unchanged (already shared) |
| `src/profiles.js` (create) | Built-in `BANK1` (column-zip) and `BANK2` (row-stacked) profile objects + `ACCOUNT_RE`/ignore helpers |
| `src/engine.js` (create) | `parseWithProfile(ocr, profile, opts)` — classify + assemble (`column-zip`, `row-stacked`) |
| `src/parser.js` (modify) | `parseOcr` becomes `parseWithProfile(ocr, BANK1, opts)` wrapper (keeps existing API/tests) |
| `src/detect.js` (create) | `detectBank(ocr, banks)` → `{ bank, confident }` by signature scoring |
| `src/storeFile.js` (modify) | add `loadBanks`/`saveBanks` (banks.json) |
| `src/import.js` (modify) | detect bank (or ask) → parse with its profile → tag account |
| `test/engine.test.js` (create) | column-zip + row-stacked against bank-1 and bank-2 fixtures |
| `test/detect.test.js` (create) | signature matching |
| `test/fixtures/bank2-sample.js` (create) | real bank-2 OCR fixture |

---

## Task 1: Bank-2 OCR fixture

**Files:**
- Create: `test/fixtures/bank2-sample.js`

- [ ] **Step 1: Create the fixture**

Real OCR from the bank-2 statement screen (balances, spaced signs, multi-line rows). This is the ground truth for the `row-stacked` layout tests.

```js
// Real OCR from a bank-2 account screen (balances interleaved with signed
// transactions; multi-line rows: description + account-number + amount).
module.exports = `•ll 2degrees §
14:52
Summary
86%
MISS A LE
12-3602-0581571-00
Transfer
More options
>
SUN 10 MAY 2026
$234.69
FC01-0274-0435781-00
10ofmay
- $5,000.00
WED 18 MAR 2026
$5,234.69
INVESTMENT BALANCE EX AC
12-3602-0581571-72
$5,042.40
IRD: TAX ON TD INT EX AC
12-3602-0581571-72
- $4.96
TD INTEREST EX AC
12-3602-0581571-72
+ $47.25`;
```

- [ ] **Step 2: Verify it loads**

Run: `node -e "console.log(require('./test/fixtures/bank2-sample').split('\n').length)"`
Expected: prints `27`.

- [ ] **Step 3: Commit**

```bash
git add test/fixtures/bank2-sample.js
git commit -m "test: real bank-2 OCR fixture"
```

---

## Task 2: Profile-aware `isNoise` (extra noise words)

`isNoise` must drop bank-specific chrome (bank 2: `summary`, `more options`)
while keeping current bank-1 behaviour when no extra words are passed. (Balance
and account-number detection are NOT added here — they're handled with finer
granularity in the engine's `classify` in Task 4, because the engine needs to
tell a balance row from an account-number row.)

**Files:**
- Modify: `src/lines.js`
- Test: `test/lines.test.js`

- [ ] **Step 1: Add the failing test** — append to `test/lines.test.js`

```js
test('isNoise accepts extra bank-specific noise words', () => {
  assert.equal(isNoise('Summary'), false);                        // default: kept
  assert.equal(isNoise('Summary', ['summary', 'more options']), true);
  assert.equal(isNoise('More options', ['summary', 'more options']), true);
  assert.equal(isNoise('TD INTEREST EX AC', ['summary', 'more options']), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/lines.test.js`
Expected: FAIL — `isNoise('Summary', ['summary', …])` returns false (extra words ignored).

- [ ] **Step 3: Implement** — in `src/lines.js`, replace the `isNoise` function with (this is the current `isNoise` plus the `extraNoiseWords` check):

```js
function isNoise(line, extraNoiseWords) {
  const t = String(line).trim();
  if (t === '') return true;
  if (/^\d{1,2}:\d{2}$/.test(t)) return true;        // time, e.g. 21:33
  if (/%/.test(t)) return true;                       // battery, e.g. © D 69%
  if (/degrees/i.test(t)) return true;                // carrier in status bar
  if (t.includes('<')) return true;                   // nav chrome, e.g. < Accounts
  if (NOISE_WORDS.has(t.toLowerCase())) return true;  // bottom nav words
  if (Array.isArray(extraNoiseWords) && extraNoiseWords.indexOf(t.toLowerCase()) !== -1) return true;
  if (/^\$[\d,]+\.\d{2}$/.test(t)) return true;       // unsigned amount = balance, ignore
  if (!/[a-z0-9]/i.test(t)) return true;              // symbols only, e.g. $→
  return false;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/lines.test.js`
Expected: PASS (all existing line tests + the new one).

- [ ] **Step 5: Run the full suite**

Run: `node --test`
Expected: PASS — no regressions (parser/import still use `isNoise(line)` with one arg).

- [ ] **Step 6: Commit**

```bash
git add src/lines.js test/lines.test.js
git commit -m "feat: profile-aware isNoise (extra noise words + account-number rows)"
```

---

## Task 3: Built-in profiles

**Files:**
- Create: `src/profiles.js`
- Test: `test/profiles.test.js`

- [ ] **Step 1: Write the failing test** — `test/profiles.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { BANK1, BANK2 } = require('../src/profiles');

test('BANK1 is the column-zip profile', () => {
  assert.equal(BANK1.layout, 'column-zip');
  assert.ok(Array.isArray(BANK1.signature));
  assert.ok(Array.isArray(BANK1.noiseWords));
});

test('BANK2 is the row-stacked profile with bank-2 signature words', () => {
  assert.equal(BANK2.layout, 'row-stacked');
  assert.ok(BANK2.signature.includes('more options'));
  assert.ok(BANK2.noiseWords.includes('summary'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/profiles.test.js`
Expected: FAIL — "Cannot find module '../src/profiles'".

- [ ] **Step 3: Implement** — `src/profiles.js`

```js
'use strict';

// Built-in bank profiles. Each drives the general engine. signature/noiseWords
// are matched case-insensitively (store them lowercased).
const BANK1 = {
  id: 'bank1',
  name: 'Bank 1',
  defaultAccount: 'Spending',
  signature: ['apply', 'cards', 'payments'],
  noiseWords: [],                 // bank 1 chrome already covered by built-in isNoise rules
  layout: 'column-zip',
};

const BANK2 = {
  id: 'bank2',
  name: 'Bank 2',
  defaultAccount: 'Investment',
  signature: ['summary', 'more options'],
  noiseWords: ['summary', 'more options'],
  layout: 'row-stacked',
};

module.exports = { BANK1, BANK2 };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/profiles.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/profiles.js test/profiles.test.js
git commit -m "feat: built-in bank1 (column-zip) and bank2 (row-stacked) profiles"
```

---

## Task 4: Engine — `column-zip` layout (bank-1 parity)

The engine must reproduce the current `parseOcr` output for bank 1 using the `column-zip` strategy.

**Files:**
- Create: `src/engine.js`
- Test: `test/engine.test.js`

- [ ] **Step 1: Write the failing test** — `test/engine.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWithProfile } = require('../src/engine');
const { BANK1 } = require('../src/profiles');
const bank1Sample = require('./fixtures/2degrees-sample');

test('column-zip reproduces the bank-1 fixture (8 transactions, no warnings)', () => {
  const { transactions, warnings } = parseWithProfile(bank1Sample, BANK1, { fallbackDate: '2026-06-13' });
  assert.equal(transactions.length, 8);
  assert.deepEqual(warnings, []);
  const fri = transactions.filter(t => t.date === '2026-06-12');
  assert.deepEqual(fri.map(t => t.merchant),
    ['Sample Store A', 'Sample Eatery B', 'Sample Butcher C', 'Sample Butcher C', 'Sample Mart D']);
  assert.deepEqual(fri.map(t => t.amount), [10, 2.5, 99, 40, 15]);
  assert.equal(fri.every(t => t.direction === 'out'), true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/engine.test.js`
Expected: FAIL — "Cannot find module '../src/engine'".

- [ ] **Step 3: Implement** — `src/engine.js` (column-zip first; row-stacked added in Task 5)

```js
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
    // noise ignored
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

// Placeholder until Task 5 implements it.
function rowStacked(tokens, opts) {
  return { transactions: [], warnings: ['row-stacked not implemented'] };
}

module.exports = { parseWithProfile };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/engine.test.js`
Expected: PASS — column-zip matches the bank-1 fixture.

- [ ] **Step 5: Commit**

```bash
git add src/engine.js test/engine.test.js
git commit -m "feat: parser engine with column-zip layout (bank-1 parity)"
```

---

## Task 5: Engine — `row-stacked` layout (bank 2)

Bank 2 stacks each transaction vertically: description line(s), then (ignored) account-number/balance lines, then a **signed** amount. Unsigned amounts (balances) and account-number lines are dropped by `isNoise`, and a balance/amount **resets** the description buffer so one entry's text can't bleed into the next.

**Files:**
- Modify: `src/engine.js`
- Test: `test/engine.test.js`

- [ ] **Step 1: Add the failing test** — append to `test/engine.test.js`

```js
const { BANK2 } = require('../src/profiles');
const bank2Sample = require('./fixtures/bank2-sample');

test('row-stacked pairs each signed amount with its preceding description, skipping balances', () => {
  const { transactions } = parseWithProfile(bank2Sample, BANK2, { fallbackDate: '2026-05-20' });
  // 3 signed transactions; the 3 unsigned balances are ignored
  assert.equal(transactions.length, 3);

  const tax = transactions.find(t => t.amount === 4.96);
  assert.equal(tax.merchant, 'IRD: TAX ON TD INT EX AC');
  assert.equal(tax.direction, 'out');
  assert.equal(tax.date, '2026-03-18');

  const interest = transactions.find(t => t.amount === 47.25);
  assert.equal(interest.merchant, 'TD INTEREST EX AC');
  assert.equal(interest.direction, 'in');

  const transfer = transactions.find(t => t.amount === 5000);
  assert.equal(transfer.direction, 'out');
  assert.equal(transfer.date, '2026-05-10');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/engine.test.js`
Expected: FAIL — `transactions.length` is 0 (placeholder returns nothing).

- [ ] **Step 3: Implement** — in `src/engine.js`, replace the placeholder `rowStacked` with:

```js
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/engine.test.js`
Expected: PASS — row-stacked produces the 3 signed bank-2 transactions.

- [ ] **Step 5: Run the full suite**

Run: `node --test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine.js test/engine.test.js
git commit -m "feat: row-stacked layout for bank 2 (description+signed-amount rows)"
```

---

## Task 6: `parseOcr` becomes an engine wrapper

Keep the public `parseOcr` API (used by `import.js` and existing tests) by delegating to the engine with the bank-1 profile.

**Files:**
- Modify: `src/parser.js`
- Test: `test/parser.test.js` (unchanged — must still pass)

- [ ] **Step 1: Replace `src/parser.js` entirely with the wrapper**

```js
'use strict';

const load = (n) => (typeof require !== 'undefined') ? require('./' + n) : importModule(n);
const { parseWithProfile } = load('engine');
const { BANK1 } = load('profiles');

// Back-compat: the original transaction-list parser is now the bank-1 profile.
function parseOcr(text, opts = {}) {
  return parseWithProfile(text, BANK1, opts);
}

module.exports = { parseOcr };
```

- [ ] **Step 2: Run the existing parser tests**

Run: `node --test test/parser.test.js`
Expected: PASS — all 4 original parser tests still pass (same output via the engine).

- [ ] **Step 3: Run the full suite**

Run: `node --test`
Expected: PASS — nothing regressed.

- [ ] **Step 4: Commit**

```bash
git add src/parser.js
git commit -m "refactor: parseOcr delegates to engine with bank-1 profile"
```

---

## Task 7: Bank detection by signature

**Files:**
- Create: `src/detect.js`
- Test: `test/detect.test.js`

- [ ] **Step 1: Write the failing test** — `test/detect.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectBank } = require('../src/detect');
const { BANK1, BANK2 } = require('../src/profiles');
const bank1 = require('./fixtures/2degrees-sample');
const bank2 = require('./fixtures/bank2-sample');

const BANKS = [BANK1, BANK2];

test('detects bank 2 from its signature lines', () => {
  const r = detectBank(bank2, BANKS);
  assert.equal(r.bank.id, 'bank2');
  assert.equal(r.confident, true);
});

test('detects bank 1 from its signature lines', () => {
  const r = detectBank(bank1, BANKS);
  assert.equal(r.bank.id, 'bank1');
  assert.equal(r.confident, true);
});

test('no signature match → not confident, bank null', () => {
  const r = detectBank('random text with no signatures', BANKS);
  assert.equal(r.bank, null);
  assert.equal(r.confident, false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/detect.test.js`
Expected: FAIL — "Cannot find module '../src/detect'".

- [ ] **Step 3: Implement** — `src/detect.js`

```js
'use strict';

// Score each bank by how many of its signature lines appear (case-insensitive,
// substring) in the OCR text. Highest score wins; a tie or zero score is not
// confident.
function detectBank(ocr, banks) {
  const hay = String(ocr).toLowerCase();
  let best = null, bestScore = 0, tie = false;
  for (const bank of banks) {
    let score = 0;
    for (const sig of (bank.signature || [])) {
      if (hay.indexOf(String(sig).toLowerCase()) !== -1) score++;
    }
    if (score > bestScore) { bestScore = score; best = bank; tie = false; }
    else if (score === bestScore && score > 0) { tie = true; }
  }
  const confident = bestScore > 0 && !tie;
  return { bank: confident ? best : null, confident };
}

module.exports = { detectBank };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/detect.test.js`
Expected: PASS — bank 1 and bank 2 detected; unknown text not confident.

- [ ] **Step 5: Commit**

```bash
git add src/detect.js test/detect.test.js
git commit -m "feat: detectBank by signature scoring"
```

---

## Task 8: `banks.json` storage

**Files:**
- Modify: `src/storeFile.js`

- [ ] **Step 1: Add load/save for banks** — in `src/storeFile.js`, add inside the
exports block (after `saveOverrides`):

```js
const loadBanks = () => readJson('banks.json', null);
const saveBanks = (b) => writeJson('banks.json', b);
```

and add `loadBanks, saveBanks` to `module.exports`. The final exports block must read:

```js
module.exports = {
  loadTransactions, saveTransactions,
  loadRules, saveRules,
  loadOverrides, saveOverrides,
  loadBanks, saveBanks,
};
```

- [ ] **Step 2: Syntax-check**

Run: `node --check src/storeFile.js`
Expected: no output (valid).

- [ ] **Step 3: Commit**

```bash
git add src/storeFile.js
git commit -m "feat: banks.json load/save in storeFile"
```

---

## Task 9: Import integration (detect / ask, parse with profile)

`import.js` selects the bank (auto-detect, ask if unsure), parses with that bank's profile, and tags the bank's default account. Verified manually on device.

**Files:**
- Modify: `src/import.js`

- [ ] **Step 1: Replace the top imports + the parse section of `main()`**

Replace these lines at the top of `src/import.js`:

```js
const { parseOcr } = importModule('parser');
const { categorize } = importModule('categorizer');
const { dedupe } = importModule('store');
const storeFile = importModule('storeFile');
```

with:

```js
const { parseWithProfile } = importModule('engine');
const { detectBank } = importModule('detect');
const { BANK1, BANK2 } = importModule('profiles');
const { categorize } = importModule('categorizer');
const { dedupe } = importModule('store');
const storeFile = importModule('storeFile');

const BUILTIN_BANKS = [BANK1, BANK2];

function allBanks() {
  const saved = storeFile.loadBanks();
  return (Array.isArray(saved) && saved.length) ? saved : BUILTIN_BANKS;
}

async function chooseBank(banks) {
  const a = new Alert();
  a.title = 'Which bank?';
  a.message = 'Could not auto-detect the bank for this screenshot.';
  banks.forEach(b => a.addAction(b.name));
  a.addCancelAction('Cancel');
  const idx = await a.presentSheet();
  return idx === -1 ? null : banks[idx];
}
```

- [ ] **Step 2: Replace the parse block inside `main()`**

Replace these lines:

```js
  const today = new Date().toISOString().slice(0, 10); // screenshot/today fallback
  const { transactions, warnings } = parseOcr(ocrText, { fallbackDate: today });
```

with:

```js
  const today = new Date().toISOString().slice(0, 10); // screenshot/today fallback
  const banks = allBanks();
  const det = detectBank(ocrText, banks);
  const bank = det.confident ? det.bank : await chooseBank(banks);
  if (!bank) return;                                   // user cancelled the picker
  const { transactions, warnings } = parseWithProfile(ocrText, bank, { fallbackDate: today });
```

- [ ] **Step 3: Tag the bank's default account on save**

Replace this line in `main()`:

```js
  toSave.forEach(t => { t.source = 'ocr'; t.account = t.account || 'Spending'; });
```

with:

```js
  toSave.forEach(t => { t.source = 'ocr'; t.account = t.account || bank.defaultAccount || 'Spending'; });
```

- [ ] **Step 4: Syntax sanity (top-level await prevents `node --check`)**

Run: `grep -n "parseWithProfile\|detectBank\|chooseBank" src/import.js`
Expected: shows the new references wired in (imports + usage in `main`).

- [ ] **Step 5: Manual verification (on phone, after Sync)**

Import a **bank-1** screenshot → parses as before, saved to Spending.
Import a **bank-2** screenshot → detected as bank 2 (or you pick it), parsed with row-stacked, saved to Investment.
Expected: each parses with the right layout; the "Which bank?" prompt only appears when detection is unsure.

- [ ] **Step 6: Commit**

```bash
git add src/import.js
git commit -m "feat: import auto-detects bank and parses with its profile"
```

---

## Task 10: Manifest update

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add the new modules** — insert `src/engine.js`, `src/profiles.js`,
`src/detect.js` into `manifest.json` (so Sync pulls them). After the change the
array must contain, in order:

```json
[
  "src/lines.js",
  "src/parser.js",
  "src/engine.js",
  "src/profiles.js",
  "src/detect.js",
  "src/categorizer.js",
  "src/categories.js",
  "src/store.js",
  "src/aggregate.js",
  "src/storeFile.js",
  "src/import.js",
  "src/dashboard.js",
  "src/recategorize.js",
  "src/addExpense.js",
  "src/manageCategories.js",
  "seedRules.js"
]
```

- [ ] **Step 2: Validate JSON + full suite**

Run: `node -e "console.log(require('./manifest.json').length)" && node --test`
Expected: prints `16`; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "chore: add engine/profiles/detect to sync manifest"
```

---

## Done — Definition of Success (Stage 1)

- `node --test` green: engine `column-zip` reproduces the bank-1 fixture; `row-stacked` extracts the 3 signed bank-2 transactions (balances ignored); `detectBank` identifies both banks; existing parser/import behaviour preserved.
- On the phone: importing a bank-1 screenshot behaves exactly as before (Spending); importing a bank-2 screenshot is detected (or picked) and parsed with the row-stacked layout (Investment); the "Which bank?" prompt appears only when detection is unsure.
- No Stage-2/3 scope (no Manage Banks UI, no inference) — those are separate plans.
