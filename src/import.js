'use strict';

// Called by the "Import Expenses" Shortcut. The Shortcut runs Apple Vision OCR
// ("Extract Text from Image") and passes the text as the script parameter.
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

async function main() {
  const ocrText = (args.plainTexts && args.plainTexts[0]) || args.shortcutParameter || '';
  if (!ocrText) { await note('No OCR text received from the Shortcut.'); return; }

  const today = new Date().toISOString().slice(0, 10); // screenshot/today fallback
  const banks = allBanks();
  const det = detectBank(ocrText, banks);
  const bank = det.confident ? det.bank : await chooseBank(banks);
  if (!bank) return;                                   // user cancelled the picker
  const { transactions, warnings } = parseWithProfile(ocrText, bank, { fallbackDate: today });

  if (transactions.length === 0) {
    await note('No transactions found. Raw OCR text:\n\n' + ocrText);
    return;
  }

  const rules = storeFile.loadRules();
  const overrides = storeFile.loadOverrides();
  for (const t of transactions) t.category = categorize(t.merchant, rules, overrides);

  const existing = storeFile.loadTransactions();
  const { added, skipped } = dedupe(existing, transactions);

  const result = await confirm(added, skipped, warnings);
  if (!result) return;                          // cancelled

  const toSave = result.toSave;
  toSave.forEach(t => { t.source = 'ocr'; t.account = t.account || bank.defaultAccount || 'Spending'; });
  storeFile.saveTransactions(existing.concat(toSave));

  const kept = toSave.length - added.length;    // flagged dups the user kept
  await note(`Saved ${toSave.length} transaction(s). ` +
             `Kept ${kept} flagged duplicate(s). ` +
             `Skipped ${skipped.length - kept}.`);
}

// Review screen: present a UITable for review (tap a flagged duplicate to keep
// it), then — after the user taps the system "Close" — ask Save/Cancel via an
// Alert. UITable has no dismiss(), so buttons can't close it; this is the
// supported flow. Resolves { toSave } on Save, or null on Cancel.
function confirm(added, skipped, warnings) {
  const keep = new Set();             // indices into `skipped` the user keeps
  const table = new UITable();
  table.showSeparators = true;

  function txnRow(t, flag, subtitle, prefix) {
    const r = new UITableRow();
    const sign = t.direction === 'out' ? '-' : '+';
    r.addText(`${prefix || ''}${t.merchant}${flag || ''}`,
              subtitle || `${t.date} · ${t.category}`);
    const amt = r.addText(`${sign}$${t.amount.toFixed(2)}`);
    amt.rightAligned();
    return r;
  }

  function render() {
    table.removeAllRows();

    const header = new UITableRow();
    header.isHeader = true;
    header.addText(`Import ${added.length} · ${skipped.length} flagged dup`,
                   'Review, then tap Close (top-left)');
    table.addRow(header);

    for (const w of warnings) {
      const r = new UITableRow();
      r.addText('⚠️ ' + w);
      table.addRow(r);
    }

    for (const t of added) {
      table.addRow(txnRow(t, t.dateUncertain ? ' ⚠︎' : ''));
    }

    if (skipped.length) {
      const sh = new UITableRow();
      sh.isHeader = true;
      sh.addText('Skipped as duplicate — tap to keep anyway');
      table.addRow(sh);
      skipped.forEach((t, i) => {
        const row = txnRow(t, '', `${t.date} · ${t.reason}`, keep.has(i) ? '✅ ' : '↩︎ ');
        row.onSelect = () => {
          if (keep.has(i)) keep.delete(i); else keep.add(i);
          render();
          table.reload();
        };
        table.addRow(row);
      });
    }
  }

  render();
  return table.present(false).then(async () => {
    const kept = skipped.filter((_, i) => keep.has(i));
    const a = new Alert();
    a.title = 'Save these transactions?';
    a.message = `Import ${added.length} new` +
                (kept.length ? `, keep ${kept.length} flagged duplicate(s)` : '') + '.';
    a.addAction('Save');
    a.addCancelAction('Cancel');
    const idx = await a.presentAlert();
    if (idx !== 0) return null;
    return { toSave: added.concat(kept) };
  });
}

async function note(message) {
  const a = new Alert();
  a.title = 'Expense Import';
  a.message = message;
  a.addAction('OK');
  await a.present();
}

await main();
