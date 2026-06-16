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

  const result = await confirm(added, skipped, warnings);
  if (!result) return;                          // cancelled

  const toSave = result.toSave;
  toSave.forEach(t => { t.source = 'ocr'; });
  storeFile.saveTransactions(existing.concat(toSave));

  const kept = toSave.length - added.length;    // flagged dups the user kept
  await note(`Saved ${toSave.length} transaction(s). ` +
             `Kept ${kept} flagged duplicate(s). ` +
             `Skipped ${skipped.length - kept}.`);
}

// Confirm screen. `added` is auto-included; `skipped` rows (flagged duplicates)
// start excluded and can be tapped to keep — the gate for real same-day repeats.
// Resolves { toSave } on Save, or null on Cancel.
function confirm(added, skipped, warnings) {
  const keep = new Set();            // indices into `skipped` the user keeps
  const table = new UITable();
  table.showSeparators = true;
  let decision = null;

  function render() {
    table.removeAllRows();

    const header = new UITableRow();
    header.isHeader = true;
    header.addText(`Import ${added.length}  ·  ${skipped.length} flagged dup`);
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

    const actions = new UITableRow();
    const yes = actions.addButton('✅ Save');
    yes.onTap = () => {
      const kept = skipped.filter((_, i) => keep.has(i));
      decision = { toSave: added.concat(kept) };
      table.dismiss();
    };
    const no = actions.addButton('✖ Cancel');
    no.onTap = () => { decision = null; table.dismiss(); };
    table.addRow(actions);
  }

  function txnRow(t, flag, subtitle, prefix) {
    const r = new UITableRow();
    const sign = t.direction === 'out' ? '-' : '+';
    const title = `${prefix || ''}${t.merchant}${flag || ''}`;
    r.addText(title, subtitle || `${t.date} · ${t.category}`);
    const amt = r.addText(`${sign}$${t.amount.toFixed(2)}`);
    amt.rightAligned();
    return r;
  }

  render();
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
