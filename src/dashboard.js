'use strict';

// Dashboard: pick a date range, then see out vs in, net, spend-by-category, and
// a monthly trend for that range. Closing the report returns to the range menu
// so you can switch periods; "Done" exits.
const { totalsInRange, categoryBreakdownInRange, trend } = importModule('aggregate');
const storeFile = importModule('storeFile');

const txns = storeFile.loadTransactions();

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function presets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();                       // 0-based
  const today = ymd(now);
  return [
    { label: 'This month',    start: ymd(new Date(y, m, 1)),                       end: today },
    { label: 'Last month',    start: ymd(new Date(y, m - 1, 1)),                   end: ymd(new Date(y, m, 0)) },
    { label: 'Last 30 days',  start: ymd(new Date(now.getTime() - 29 * 86400000)), end: today },
    { label: 'Last 3 months', start: ymd(new Date(y, m - 2, 1)),                   end: today },
    { label: 'This year',     start: `${y}-01-01`,                                 end: today },
    { label: 'All time',      start: '0000-01-01',                                 end: '9999-12-31' },
  ];
}

async function pickCustom() {
  try {
    const sp = new DatePicker(); sp.initialDate = new Date();
    const start = await sp.pickDate();
    const ep = new DatePicker(); ep.initialDate = new Date();
    const end = await ep.pickDate();
    let s = ymd(start), e = ymd(end);
    if (s > e) { const tmp = s; s = e; e = tmp; }
    return { label: `${s} → ${e}`, start: s, end: e };
  } catch (err) {
    return null;
  }
}

async function pickRange() {
  const opts = presets();
  const a = new Alert();
  a.title = 'Report range';
  opts.forEach(o => a.addAction(o.label));
  a.addAction('Custom range…');
  a.addCancelAction('Done');
  const idx = await a.presentSheet();
  if (idx === -1) return null;
  if (idx === opts.length) return pickCustom();
  return opts[idx];
}

function bars(map) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
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

async function showReport(range) {
  const totals = totalsInRange(txns, range.start, range.end);
  const cats = categoryBreakdownInRange(txns, range.start, range.end);
  const months = trend(txns, range.start, range.end);
  const net = Math.round((totals.in - totals.out) * 100) / 100;
  const netClass = net >= 0 ? 'in' : 'out';

  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font:16px -apple-system;margin:0;padding:16px;background:#111;color:#eee}
  h1{font-size:20px;margin:0} .sub{color:#888;font-size:13px;margin:2px 0 16px}
  h2{font-size:15px;color:#9af;margin-top:24px}
  .tot{font-size:26px;font-weight:700}
  .out{color:#f87} .in{color:#7f7}
  .net{font-size:14px;color:#bbb;margin-top:4px}
  .row{display:flex;align-items:center;gap:8px;margin:6px 0}
  .lbl{width:110px;font-size:13px;color:#bbb;overflow:hidden;white-space:nowrap}
  .bar{height:14px;background:#5a8;border-radius:3px;min-width:2px}
  .val{margin-left:auto;font-variant-numeric:tabular-nums}
</style></head><body>
  <h1>${range.label}</h1>
  <div class="sub">${range.start} → ${range.end}</div>
  <div class="tot"><span class="out">-$${totals.out.toFixed(2)}</span>
    &nbsp;·&nbsp;<span class="in">+$${totals.in.toFixed(2)}</span></div>
  <div class="net">Net: <span class="${netClass}">${net >= 0 ? '+' : '-'}$${Math.abs(net).toFixed(2)}</span></div>
  <h2>By category (spending)</h2>${bars(cats) || '<p>No spend in range.</p>'}
  <h2>Trend (monthly out)</h2>${trendBars(months) || '<p>No history in range.</p>'}
</body></html>`;

  const wv = new WebView();
  await wv.loadHTML(html);
  await wv.present(true);
}

async function main() {
  while (true) {
    const range = await pickRange();
    if (!range) break;
    await showReport(range);
  }
}

await main();
