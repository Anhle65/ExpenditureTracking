# Expenditure Tracker — Design Spec

**Date:** 2026-06-08
**Status:** Approved design, ready for implementation planning

## Overview

A personal, iPhone-only expense tracker. The user screenshots their bank's
transaction list, shares it to an iOS Shortcut that runs Apple Vision OCR
on-device, and a Scriptable (JavaScript) app parses the amounts and `+`/`-`
signs into transactions, categorizes them by keyword rules, stores them
locally, and displays a dashboard.

**Design drivers / constraints:**

- iOS cannot read other apps' notifications (no equivalent to Android's
  `NotificationListenerService`). Screenshot + OCR sidesteps this entirely.
- User has an **iPhone + Linux only, no Mac**, so a native Swift app (needs
  Xcode + a paid developer account) is off the table. Everything must run on
  the phone with code authored on Linux.
- Bank: New Zealand (2degrees / standard NZ bank app). Bank "just deducts"
  with no reliable per-transaction notification, reinforcing the
  screenshot-driven approach over notification scraping.
- Privacy: all transaction data and OCR stay **on-device**. No cloud, no bank
  login, no aggregation service.

## Goals

- Capture bank transactions from screenshots with minimal taps.
- Categorize spend by user-defined keyword rules, with manual override.
- Show: monthly total (out vs in), spend by category, trend over time.
- Zero ongoing cost, no Mac, no App Store submission, no developer account.

## Non-Goals (YAGNI)

- No automatic bank sync (Akahu/Plaid) — rejected in favour of on-device OCR.
- No multi-user, no cloud backup beyond iCloud file storage.
- No budgeting/alerts in v1 (possible later).
- No SQL database in v1 (see Storage — JSON is sufficient at this scale).

## Tech Stack & Tools (all free)

| Tool | Role | Notes |
|------|------|-------|
| **Shortcuts** (built-in) | OCR capture | One action: "Extract Text from Image" (Apple Vision, on-device) |
| **Scriptable** (free, App Store) | App logic + storage + UI | Sandboxed JS runtime with iOS APIs |
| **Node.js** (Linux) | Unit tests | Runs the pure-function modules off-device |
| Editor + git | Authoring | Code lives in this repo |

Scriptable is a third-party app installed once. Each "script" is a `.js` file
run by tapping it, a Home Screen icon, a widget, or a Shortcuts "Run Script"
action. It exposes iOS features as JS objects (`FileManager`, `WebView`,
`args`, `Request`, `UITable`, `Alert`).

## Architecture / Components

```
Screenshot → Share Sheet → Shortcut (Vision OCR) → Scriptable:
    parse → categorize → de-dupe → confirm screen → save → Dashboard
```

1. **Capture Shortcut** (Shortcuts app) — receives a screenshot from the share
   sheet, runs "Extract Text from Image", passes the raw text to Scriptable
   via "Run Script".
2. **Parser** (Scriptable JS, pure) — turns OCR text into transactions. See
   "Parsing strategy" — this is the core logic and the main risk area.
3. **Categorizer** (Scriptable JS, pure) — matches merchant text against
   keyword rules (`rules.json`); applies learned manual fixes
   (`overrides.json`).
4. **Store** (Scriptable JS) — reads/writes JSON via `FileManager`; de-dupes
   overlapping screenshots. Small interface: `getAll`, `add`, `update`,
   `remove`. The only module that touches the filesystem.
5. **Confirm UI** (Scriptable `UITable`) — shows parsed transactions for
   review/edit before saving; the safety net for parsing mismatches.
6. **Dashboard** (Scriptable `WebView`) — renders charts + an editable
   transaction list as an offline HTML page.

Two user-facing scripts: **"Import Expenses"** (share-sheet triggered) and
**"Expense Dashboard"** (Home Screen icon).

## Parsing strategy (the core challenge)

Validated against a real NZ bank screenshot. **Apple Vision via Shortcuts
returns text only (no bounding-box coordinates) and groups it by column, not
by row.** A merchant and its amount are therefore *not* on the same line:

```
Sample Store A            ← merchants, top-to-bottom
Sample Eatery B
Sample Butcher C
Sample Butcher C
Sample Mart D
-$10.00                 ← amounts, top-to-bottom, same order
-$2.50
-$99.00
-$40.00
-$15.00
```

The parser exploits the consistent ordering:

1. **Filter noise lines** — status bar / nav junk (`21:33`, `© D 69%`, `Go`,
   `$→`, `Accounts`, `Payments`, `Transfer`, `Cards`, `Apply`, app title).
2. **Segment by date headers** — lines matching a weekday + day + month + year
   pattern (e.g. `FRI 12 JUN 2026`). Rows above the first date form a leading
   group (assigned to the most recent date / screenshot date).
3. **Within each segment**, classify each remaining line as an **amount**
   (regex `-?\$?[\d,]+\.\d{2}`) or a **merchant** (everything else), preserving
   order.
4. **Zip by index** within the segment: merchant[i] ↔ amount[i].
5. **Direction** — leading `-` ⇒ `out`, otherwise `in`.
6. **Fuzzy date parsing** — map the month token to the nearest of the 12 known
   month names to survive OCR misreads (e.g. `JUN`→`IN`).
7. **Mismatch handling** — if a segment's merchant count ≠ amount count, flag
   that segment on the confirm screen rather than guessing.

**Accepted limitation:** without positional data, zip-by-order can misalign a
segment that has a missing/extra line (e.g. a pending row). The
confirm-before-save screen exists to catch this. A cloud vision AI would pair
rows directly but was rejected to keep data on-device.

## Data model

```js
Transaction {
  id,          // hash of date + amount + merchant (dedupe key)
  date,        // ISO date string
  amount,      // positive number
  direction,   // "out" | "in"
  merchant,    // string
  category,    // string
  source,      // "ocr" | "manual"
  rawText,     // original OCR line(s); optional, droppable to save space
}
```

Storage files (in Scriptable's iCloud documents folder):

- `transactions.json` — all records
- `rules.json` — `[{ pattern, category }]` keyword rules
- `overrides.json` — `{ merchant: category }` learned from manual fixes

## Storage: why JSON, not a database

At ~100–300 transactions/month, the data file reaches ~1 MB/year and ~10 MB
after a decade — smaller than one photo. Data is append-mostly and read
all-at-once for monthly aggregation, which a flat JSON file does best. A SQL
database would add schema/migration/query complexity to buy power unused at
this scale (YAGNI).

**Escape hatch:** all access goes through the Store module's small interface,
so if the dataset ever exceeds ~50k records or needs complex queries, swapping
JSON for Scriptable's built-in **SQLite** is a change in one module — the
parser, categorizer, and dashboard are unaffected.

## Dashboard views

Built as an offline HTML page in a `WebView` (chart library bundled, not
CDN-loaded, so it works without internet):

- **Monthly total** — this month out vs in.
- **Spend by category** — bar/pie breakdown.
- **Trend over time** — line chart across weeks/months (aggregated per period,
  not per row, to stay fast).
- **Transaction list** — searchable, editable; supports recategorizing (which
  writes to `overrides.json`) and fixing parse errors. Required to support the
  manual-override categorization.

## Categorization

- Keyword rules in `rules.json` (e.g. `sample mart` / `sample grocer` →
  `Groceries`).
- On manual recategorization, the merchant→category mapping is saved to
  `overrides.json` so future imports of that merchant auto-apply the fix.
- Unmatched merchants → `Uncategorized`, surfaced for the user to assign.

## Error handling

- **No amounts found** → show the raw OCR text so the user can re-crop /
  re-screenshot.
- **Segment count mismatch** → flag that segment on the confirm screen, don't
  guess.
- **Ambiguous/odd number formats** → parser handles `$`, thousands separators,
  and leading `-`.
- **Duplicates** → skipped silently on import via the dedupe key, with a
  "skipped N already-seen" note.
- **Date misreads** → fuzzy month matching; if unparseable, fall back to the
  previous date header or screenshot date.

## Testing strategy

- **Parser, categorizer, dedupe** are pure functions with **no Scriptable
  APIs**, so they run under **Node on Linux**. Tested against saved OCR-text
  fixtures captured from real screenshots (including the validated 2degrees
  sample and edge cases: count mismatch, date misread, noise lines, leading
  pre-date group).
- **Store, Confirm UI, Dashboard, Shortcut** glue is verified manually on the
  phone.
- TDD for the pure modules: write the fixture-driven test first, then the
  parser logic.

## Dev workflow (Linux → iPhone)

- Code (modules + tests) lives in this git repo; logic is authored and tested
  on Linux with Node.
- **Bootstrap loader**: a ~10-line Scriptable script fetches the latest code
  from a private repo URL (`Request`) and runs it, so `git push` → tap on phone
  pulls newest code. Only the *code* is fetched over the network; *data* stays
  on-device.
- **Fallback**: manual paste into Scriptable once the code is stable.

## Validated milestone (done)

Stage 1 OCR check passed: a one-action Shortcut + share sheet successfully
extracted amounts (with signs), dates, and merchants from a real NZ bank
screenshot. This confirmed on-device OCR quality and revealed the
column-grouping behaviour that shapes the parser design above.

## Implementation milestones (proposed for the plan)

1. **Parser module** (TDD on Linux) — noise filter → date segmentation →
   amount/merchant classify → zip → date/sign normalization, against fixtures.
2. **Categorizer + Store modules** (TDD on Linux) — rules, overrides, dedupe,
   JSON read/write interface.
3. **Scriptable import flow** — Shortcut → Run Script → parse → confirm
   (`UITable`) → save.
4. **Dashboard** — `WebView` HTML with the three charts + editable list.
5. **Loader + onboarding primer** — bootstrap loader, Home Screen icons,
   first-run setup doc.
