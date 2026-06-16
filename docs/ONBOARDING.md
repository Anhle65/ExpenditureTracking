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

Then run the FULL test suite one final time to confirm the pure modules still pass:
Run: `node --test`
Expected: 24 tests pass (the Scriptable files add no tests and must not break existing ones).
