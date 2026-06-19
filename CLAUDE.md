# Claude Code Guidelines

## GIT WORKFLOW

**Single-user repo — work directly on `main` and push.** Do NOT create feature
branches. Commit and push as each change completes (the user has given standing
permission to commit and push to `main`).

## HIGH PRIORITY - SIMPLICITY FIRST (YAGNI)

**Always choose the simplest solution that works at this scale.**

- This is a personal, single-user app. Don't over-engineer.
- No SQL database, no cloud backend, no auth, no bank-sync service in v1 — all
  explicitly rejected. See the spec's Non-Goals.
- Prefer a plain JSON file over a database, a keyword rule over AI, a pure
  function over a framework.

## TDD IS REQUIRED for the pure modules

The parser, categorizer, and store logic are **pure JavaScript with no
Scriptable APIs**. Write a failing Node test first, then implement to pass.
These modules run and test on Linux — that's where the real logic risk lives.
Scriptable glue (files, WebView, UITable, Shortcut) is verified manually on the
phone.

---

## Project: Expenditure Tracker

A personal, **iPhone-only** expense tracker. The user screenshots their NZ bank's
transaction list, shares it to an iOS Shortcut that runs Apple Vision OCR
on-device, and a Scriptable (JavaScript) app parses the amounts and `+`/`-`
signs into transactions, categorizes them, stores them locally, and shows a
dashboard. **All data and OCR stay on-device** — no cloud, no bank login.

**Full design:** `docs/superpowers/specs/2026-06-08-expenditure-tracker-design.md`
(read this before implementing).

### Hard constraints

- **iPhone + Linux only, no Mac.** Native Swift/Xcode is off the table. The app
  IS an iOS Shortcut + Scriptable scripts. Code is authored and tested on Linux.
- iOS cannot read other apps' notifications — screenshot + OCR is the only path.
- Free only: no App Store submission, no paid developer account, no paid APIs.

### Tech Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| OCR capture | iOS **Shortcuts** (built-in) | One action: "Extract Text from Image" (Apple Vision) |
| App logic / storage / UI | **Scriptable** (free app) | Sandboxed JS runtime: `FileManager`, `WebView`, `args`, `UITable` |
| Storage | JSON files via `FileManager` | SQLite is the documented escape hatch past ~50k records |
| Tests | **Node.js** on Linux | For the pure parser/categorizer/store modules |
| Charts | Bundled JS chart lib (offline) | Not CDN-loaded |

### Planned structure

```
ExpenditureTracking/
├── docs/superpowers/specs/      # Design spec
├── src/
│   ├── parser.js                # OCR text → transactions (pure)
│   ├── categorizer.js           # merchant → category via rules/overrides (pure)
│   ├── store.js                 # JSON read/write + dedupe (interface: getAll/add/update/remove)
│   ├── dashboard/               # WebView HTML + charts
│   └── scriptable/              # import.js, dashboard.js, loader bootstrap
├── test/                        # Node tests + OCR-text fixtures
└── CLAUDE.md
```

### CRITICAL GOTCHA — OCR is column-grouped, not row-paired

Apple Vision via Shortcuts returns **text only (no coordinates)** and groups it
by **column**: all merchants of a date appear first (top-to-bottom), then all
amounts (same order). A merchant and its amount are **not on the same line**.

The parser must:
1. Filter noise lines (status bar / nav: `21:33`, `© D 69%`, `Accounts`, etc.).
2. Segment by date headers (`FRI 12 JUN 2026`); rows above the first date are a
   leading group.
3. Within each segment, split into amounts (`-?\$?[\d,]+\.\d{2}`) vs merchants,
   then **zip by index**.
4. Direction: leading `-` ⇒ `out`, else `in`.
5. Fuzzy month matching for OCR misreads (e.g. `JUN`→`IN`).
6. If a segment's merchant count ≠ amount count, **flag it on the confirm
   screen — do not guess.**

The confirm-before-save screen is the safety net for mispaired segments. Never
remove it.

### Data model

```js
Transaction { id, date, amount, direction "out"|"in", merchant, category,
              account, source "ocr"|"manual", rawText }
// account (default "Spending"): separates day-to-day spending from
// "Investment"/savings. Dashboard has account tabs (default Spending) so a big
// transfer in the Investment account never distorts spending. On import the
// account is `categorizer.accountFor(merchant, accountOverrides, bank.defaultAccount)`
// — a learned merchant→account override wins, else the bank's default. Add
// Expense picks the account; Recategorize's "Move to account…" changes a row's
// account AND learns the override. Account picker is shared in accountPicker.js;
// pure choice list + accountFor are Node-tested. DEFAULT_ACCOUNTS in categories.js.
// id = hash(date + amount + merchant)  → dedupe key
```

**Dedup across overlapping screenshots:** `store.dedupe` skips exact id matches,
and — to gate the dateless leading block whose fallback date can drift between
screenshots — also treats a row as a duplicate when an existing row has the same
merchant+amount+direction within ±2 days AND either side's date is `dateUncertain`.
Confident-date rows are never fuzzy-merged (real separate-day spends are kept).
The import confirm screen lists skipped rows so a genuine same-day repeat can be
kept.

**Transfer detection:** `categorizer.isTransfer` tags rows with a `To:`/`From:`
prefix or an NZ account number (`BB-bbbb-AAAAAAA-SS`) as category `Transfer`
(priority: override → transfer → rules → Uncategorized). Bare person-name
payees can't be distinguished from merchants, so they stay Uncategorized until
tagged once. The `isNoise` filter drops this bank's chrome (`2degrees`/mangled
`degrees`, `< Accounts`, Pay/Details/More/Go nav).

Files: `transactions.json`, `rules.json` (keyword→category),
`overrides.json` (merchant→category, learned from manual fixes),
`accountOverrides.json` (merchant→account, learned from "Move to account…").

### Dev workflow (Linux → iPhone)

- Author and unit-test modules on Linux with Node.
- A ~10-line Scriptable **bootstrap loader** fetches latest code from the repo
  URL and runs it (`git push` → tap on phone). Manual paste is the fallback.
- Only code is fetched over the network; data never leaves the phone.

### Scriptable portability gotcha (cross-module imports)

`module.exports` works in both Node and Scriptable, but **`require` does NOT
exist in Scriptable** (it uses `importModule`). Any pure module that imports
another must load it environment-agnostically, or it throws `ReferenceError`
on the phone:

```js
const { x } = (typeof require !== 'undefined') ? require('./other') : importModule('other');
```

Only `parser.js` (imports `lines`) needs this today. `importModule('name')`
resolves a sibling script by filename from the Scriptable folder.

## UI / visual design (REQUIRED for any screen — WebView & native)

This app runs only on iPhone, across a wide range of sizes — from **iPhone SE
(small, ~320–375pt wide)** to **iPhone 15/Pro Max (~430pt wide)**. Every screen,
chart, and result MUST be designed to fit all of them. **Visibility and a clear
hierarchy are the top priority** — more important than density or decoration.

**Hard rules:**
- **No clipped, truncated, or overlapping text** ("overridden text"). Numbers
  (amounts, totals) must never be cut off. If space is tight, let text **wrap**
  or shrink — never hide meaning. Test mentally at the SE width first; if it fits
  there, it fits everywhere.
- **Responsive, not fixed.** In WebView/HTML: always include
  `<meta name="viewport" content="width=device-width, initial-scale=1">`, use
  fluid layouts (`flex`, `flex-wrap`, `%`/`fr`, `min-width:0`), and avoid fixed
  pixel widths that overflow a narrow screen. Long labels get `overflow:hidden`
  + `text-overflow:ellipsis` ONLY for secondary labels, never for amounts.
- **Readable type & contrast.** Body text ≥ ~13–14px; primary figures larger.
  Keep strong contrast on the dark theme (light text on `#111`).
- **Clear hierarchy.** One obvious primary number per view (e.g. the period
  total), section headings, then details. Group related rows; align amounts
  right with `tabular-nums` so columns line up.
- **Native UITable/Alert:** keep row titles/subtitles short so iOS doesn't
  truncate them; put the amount in its own right-aligned cell; don't pack more
  than title + subtitle + amount into a row.

When adding or changing any UI, verify it reads cleanly at **both** the smallest
(SE) and largest (Pro Max) widths before considering it done.
