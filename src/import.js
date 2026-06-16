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
