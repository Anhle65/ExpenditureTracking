# Bank Groups + Profile-Driven Parsing — Design Spec

**Date:** 2026-06-18
**Status:** Approved design, ready for implementation planning (staged)

## Overview

Today the OCR parser hardcodes one bank's layout (the "transaction-list" screen
of bank 1). This feature generalises it: a single **parser engine** is driven by
a per-bank **profile** (a config object), and the user manages banks as named
**groups**. Each group holds the bank's parsing template *and* the OCR samples
fed into it, so the template can be refined as more screenshots are added.

This makes the app **multi-bank** and **extensible without code changes** —
adding a bank means adding a group/profile, not editing the parser.

## Goals

- One general parser engine parameterised by a bank profile.
- Groups (= banks) with full CRUD: create, name/rename, edit, delete.
- A group stores its **profile** and its **OCR samples**.
- On import, auto-detect the bank by signature; ask the user when unsure.
- Refine a group's profile from its samples (inference), with manual override.
- Preserve current bank-1 behaviour exactly (no regression).

## Non-Goals (YAGNI)

- No cloud/LLM parsing (kept on-device; LLM remains a possible future fallback).
- No image storage — only the OCR **text** of samples is kept.
- No cross-device sync of banks beyond the existing iCloud file storage.
- No automatic profile creation without user confirmation.

## Constraints

- Runs in Scriptable (no Node-only APIs in shared modules; pure modules are
  Node-tested and Scriptable-run, per existing project rules).
- Storage is JSON files on-device (`banks.json` joins the existing files).

## Data model

New file `banks.json` (array of groups):

```js
Bank {
  id,                       // stable id
  name,                     // "ANZ", "Kiwibank", … (renameable)
  defaultAccount,           // optional, e.g. "Spending" | "Investment"
  signature: [ "string", … ],   // distinctive OCR lines for auto-detect
  profile: {
    noiseWords: [ "accounts", "summary", … ],   // chrome to drop (lowercased)
    dateFormat: "DOW_DD_MON_YYYY",               // named format key
    amountStyle: { signRequired: true, allowSpace: true },
    ignoreUnsigned: true,                        // unsigned $ = balance → drop
    layout: "column-zip" | "row-stacked",
    ignorePatterns: [ "account-number", … ],     // named line patterns to skip
  },
  samples: [ { ocr: "…", addedAt: "ISO" }, … ],
}
```

Storage files now: `transactions.json`, `rules.json`, `overrides.json`,
`banks.json`.

## Components

1. **Parser engine** (`src/engine.js`, pure) — `parseWithProfile(ocr, profile, opts)`
   → `{ transactions, warnings }`. Two layout strategies:
   - `column-zip` — the existing behaviour (all merchants then all amounts per
     date segment, zipped by order). Bank 1.
   - `row-stacked` — walk lines, accumulate description line(s) until an amount
     line, emit one transaction; skip `ignorePatterns` (account numbers). Bank 2.
   Line classification (noise/date/amount) comes from the profile.

2. **Line classification** (`src/lines.js`, extended) — already has `isNoise`,
   `parseAmount`, `parseDate`. Generalise to accept profile-driven config
   (noise words, amount style, date format) rather than hardcoded constants.

3. **Bank detection** (`src/detect.js`, pure) — `detectBank(ocr, banks)` →
   `{ bank, confident }`. Scores each bank's `signature` lines against the OCR;
   returns the best match and whether it's confident. Unsure → caller prompts.

4. **Profile inference** (`src/infer.js`, pure) — `inferProfile(samples)` →
   proposes `noiseWords` (lines recurring across samples that never become
   transactions), `dateFormat`, `amountStyle`, `ignoreUnsigned`, and `layout`
   (column vs row by amount-distribution analysis). Output is a *proposal* the
   user confirms/edits.

5. **Manage Banks UI** (`src/manageBanks.js`, Scriptable) — list groups; create /
   rename / delete; edit → name, template settings, and samples (add/remove).
   Mirrors `manageCategories.js` patterns (UITable + Alerts).

6. **Import integration** (`src/import.js`, extended) — detect bank (or ask) →
   `parseWithProfile` → append OCR to the bank's `samples` → categorize → dedupe
   → confirm → save (tagging the bank's `defaultAccount`).

## Data flow (import)

```
screenshot → OCR (Shortcut) → import.js:
  detectBank (or ask which group)
  → parseWithProfile(ocr, bank.profile)
  → add {ocr} to bank.samples
  → categorize → dedupe → confirm → save (account = bank.defaultAccount)
```

## Error handling

- **No bank matches** and user cancels the picker → abort import with a note.
- **Profile parses nothing** → show raw OCR (existing behaviour) so the user can
  fix the profile or re-crop.
- **Inference uncertain** (e.g. can't decide layout) → propose a default and
  flag it for the user to confirm in the edit screen.
- Deleting a bank does not delete its already-imported transactions.

## Testing strategy

- `engine.parseWithProfile` (both layouts), `detect.detectBank`, and
  `infer.inferProfile` are **pure** → Node tests on Linux, using the real bank-1
  and bank-2 OCR fixtures.
- Bank-1 regression: the `column-zip` profile must reproduce current parser
  output on the existing fixture (guarded by the existing parser tests, ported).
- Manage Banks UI and import integration verified manually on the phone.

## Migration / no-regression

- Bank 1's current logic becomes the built-in `column-zip` profile, seeded as a
  default group on first run so existing imports behave identically.
- The existing `parseOcr` may remain as a thin wrapper over
  `parseWithProfile(ocr, BANK1_PROFILE)` during transition, keeping current
  tests green.

## Staged delivery

**Stage 1 — Profile-driven engine + two hand-written profiles + detect/ask.**
- `engine.parseWithProfile` with `column-zip` and `row-stacked`.
- Profile-driven `lines` classification.
- `detect.detectBank`.
- Seed `banks.json` with bank-1 (`column-zip`) and bank-2 (`row-stacked`)
  profiles, hand-authored.
- `import.js` detects (or asks) and parses with the matched profile.
- Node tests for both layouts + detection; bank-1 regression preserved.
- *Outcome:* working multi-bank parsing today.

**Stage 2 — Manage Banks UI + sample storage.**
- `manageBanks.js`: create/rename/delete/edit-name; add/remove samples.
- Import appends the OCR to the matched bank's `samples`.

**Stage 3 — Inference + template editing.**
- `infer.inferProfile(samples)` proposes a profile.
- Edit screen to review/override template settings; "re-infer from samples".

Each stage produces working, testable software on its own. This plan covers
**Stage 1**; Stages 2–3 get their own plans.

## Tools / files added

`src/engine.js`, `src/detect.js` (Stage 1); `src/manageBanks.js` (Stage 2);
`src/infer.js` (Stage 3); `banks.json` (data). `storeFile.js` gains
`loadBanks`/`saveBanks`. `manifest.json` updated as scripts are added.
