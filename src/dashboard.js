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
