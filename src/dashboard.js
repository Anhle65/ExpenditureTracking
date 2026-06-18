'use strict';

// Interactive dashboard. Account tabs (Spending / Investment / All) and the
// date-range controls live INSIDE the report. Transactions are embedded and all
// filtering/aggregation runs in-page, so tapping recomputes instantly. Data
// stays on the device — it is only rendered in the local WebView.
// Shows BOTH flows: Out / In / Net header, spending-by-category, income-by-
// category, and an out-vs-in monthly trend. Layout is responsive (fits iPhone SE
// → Pro Max), amounts never clip, columns align (see CLAUDE.md UI rules).
const storeFile = importModule('storeFile');
const { DEFAULT_ACCOUNTS } = importModule('categories');

const txns = storeFile.loadTransactions();
const slim = txns.map(t => ({
  d: String(t.date),
  a: Number(t.amount) || 0,
  dir: t.direction === 'in' ? 'in' : 'out',
  c: t.category || 'Uncategorized',
  acct: t.account || 'Spending',
}));

const accountSet = new Set(DEFAULT_ACCOUNTS);
slim.forEach(t => accountSet.add(t.acct));
const ACCOUNTS = [...accountSet];

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const now = new Date();
const y = now.getFullYear();
const mo = now.getMonth();
const today = ymd(now);
const dates = slim.map(t => t.d).filter(Boolean).sort();
const minDate = dates.length ? dates[0] : today;

const PRESETS = [
  { label: 'This month',    start: ymd(new Date(y, mo, 1)),                       end: today },
  { label: 'Last month',    start: ymd(new Date(y, mo - 1, 1)),                   end: ymd(new Date(y, mo, 0)) },
  { label: 'Last 30 days',  start: ymd(new Date(now.getTime() - 29 * 86400000)), end: today },
  { label: 'Last 3 months', start: ymd(new Date(y, mo - 2, 1)),                   end: today },
  { label: 'This year',     start: `${y}-01-01`,                                  end: today },
  { label: 'All time',      start: minDate,                                       end: today },
];

// Page script avoids ${} and backticks so it isn't touched by this template
// literal; only the injected data uses ${...} via the replaces below.
const pageJs = `
var TX = __TX__, PRESETS = __PRESETS__, ACCOUNTS = __ACCOUNTS__;
var curStart = PRESETS[0].start, curEnd = PRESETS[0].end;
var curAccount = ACCOUNTS.indexOf('Spending') >= 0 ? 'Spending' : (ACCOUNTS[0] || 'All');

function compute() {
  var out = 0, inc = 0, outCats = {}, inCats = {}, months = {};
  for (var i = 0; i < TX.length; i++) {
    var t = TX[i];
    if (curAccount !== 'All' && t.acct !== curAccount) continue;
    if (t.d < curStart || t.d > curEnd) continue;
    var ym = t.d.slice(0, 7);
    if (!months[ym]) months[ym] = { out: 0, inc: 0 };
    if (t.dir === 'out') { out += t.a; outCats[t.c] = (outCats[t.c] || 0) + t.a; months[ym].out += t.a; }
    else { inc += t.a; inCats[t.c] = (inCats[t.c] || 0) + t.a; months[ym].inc += t.a; }
  }
  return { out: out, inc: inc, outCats: outCats, inCats: inCats, months: months };
}

function catRows(map, cls) {
  var keys = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; });
  var max = 1, i;
  for (i = 0; i < keys.length; i++) if (map[keys[i]] > max) max = map[keys[i]];
  var h = '';
  for (i = 0; i < keys.length; i++) {
    var k = keys[i], v = map[k];
    h += '<div class="row"><span class="lbl">' + k + '</span>' +
         '<span class="track"><span class="bar ' + cls + '" style="width:' + (v / max * 100).toFixed(1) + '%"></span></span>' +
         '<span class="val">$' + v.toFixed(2) + '</span></div>';
  }
  return h || '<p class="empty">None in range.</p>';
}

function trendRows(months) {
  var keys = Object.keys(months).sort();
  if (!keys.length) return '<p class="empty">None in range.</p>';
  var max = 1, i;
  for (i = 0; i < keys.length; i++) {
    if (months[keys[i]].out > max) max = months[keys[i]].out;
    if (months[keys[i]].inc > max) max = months[keys[i]].inc;
  }
  var h = '';
  for (i = 0; i < keys.length; i++) {
    var k = keys[i], o = months[k].out, n = months[k].inc;
    h += '<div class="trow"><div class="tmonth">' + k + '</div><div class="tbars">' +
         '<div class="tline"><span class="ttrack"><span class="tb out" style="width:' + (o / max * 100).toFixed(1) + '%"></span></span><span class="tval out">-$' + o.toFixed(2) + '</span></div>' +
         '<div class="tline"><span class="ttrack"><span class="tb in" style="width:' + (n / max * 100).toFixed(1) + '%"></span></span><span class="tval in">+$' + n.toFixed(2) + '</span></div>' +
         '</div></div>';
  }
  return h;
}

function render() {
  var r = compute(), net = r.inc - r.out;
  document.getElementById('out').textContent = '-$' + r.out.toFixed(2);
  document.getElementById('in').textContent = '+$' + r.inc.toFixed(2);
  var n = document.getElementById('net');
  n.textContent = (net >= 0 ? '+' : '-') + '$' + Math.abs(net).toFixed(2);
  n.className = 'amt ' + (net >= 0 ? 'in' : 'out');
  document.getElementById('outcats').innerHTML = catRows(r.outCats, 'out');
  document.getElementById('incats').innerHTML = catRows(r.inCats, 'in');
  document.getElementById('trend').innerHTML = trendRows(r.months);
  document.getElementById('start').value = curStart;
  document.getElementById('end').value = curEnd;
}
function highlight(containerId, activeIdx) {
  var b = document.getElementById(containerId).querySelectorAll('.tab');
  for (var j = 0; j < b.length; j++) b[j].className = (j === activeIdx ? 'tab active' : 'tab');
}
function onPreset(idx) { curStart = PRESETS[idx].start; curEnd = PRESETS[idx].end; highlight('tabs', idx); render(); }
function onAccount(idx, name) { curAccount = name; highlight('accts', idx); render(); }
function onDate() {
  curStart = document.getElementById('start').value || curStart;
  curEnd = document.getElementById('end').value || curEnd;
  highlight('tabs', -1);
  render();
}
(function () {
  var acctBar = document.getElementById('accts');
  var acctLabels = ACCOUNTS.concat(['All']);
  for (var i = 0; i < acctLabels.length; i++) {
    var b = document.createElement('button');
    b.className = 'tab';
    b.textContent = acctLabels[i];
    (function (idx, name) { b.onclick = function () { onAccount(idx, name); }; })(i, acctLabels[i]);
    acctBar.appendChild(b);
  }
  var defIdx = acctLabels.indexOf(curAccount);
  highlight('accts', defIdx < 0 ? 0 : defIdx);

  var bar = document.getElementById('tabs');
  for (var j = 0; j < PRESETS.length; j++) {
    var p = document.createElement('button');
    p.className = 'tab';
    p.textContent = PRESETS[j].label;
    (function (idx) { p.onclick = function () { onPreset(idx); }; })(j);
    bar.appendChild(p);
  }
  highlight('tabs', 0);
  render();
})();
`.replace('__TX__', JSON.stringify(slim))
 .replace('__PRESETS__', JSON.stringify(PRESETS))
 .replace('__ACCOUNTS__', JSON.stringify(ACCOUNTS));

const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *{box-sizing:border-box}
  html,body{overflow-x:hidden}
  body{font:16px -apple-system;margin:0;padding:14px;background:#111;color:#eee}
  h2{font-size:14px;color:#9af;margin:20px 0 8px}
  .tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
  .tab{font:12px -apple-system;padding:6px 11px;border-radius:14px;border:none;background:#222;color:#ccc}
  .tab.active{background:#5a8;color:#031;font-weight:600}
  .accts .tab.active{background:#9af;color:#013}
  .dates{display:flex;gap:8px;align-items:center;margin:6px 0 12px}
  .dates .arrow{color:#888;flex:0 0 auto}
  input[type=date]{flex:1;min-width:0;background:#222;color:#eee;border:1px solid #333;border-radius:6px;padding:6px 7px;font:13px -apple-system}
  /* Out / In / Net header — three equal, aligned cells, font scales to width */
  .summary{display:flex;gap:8px;margin:4px 0 6px}
  .cell{flex:1;min-width:0;background:#1a1a1a;border-radius:10px;padding:10px 6px;text-align:center}
  .cap{font-size:11px;color:#9a9a9a;text-transform:uppercase;letter-spacing:.04em}
  .amt{font-weight:700;font-variant-numeric:tabular-nums;margin-top:4px;white-space:nowrap;font-size:clamp(14px,4.4vw,20px)}
  .out{color:#f87} .in{color:#7f7}
  /* category bars: fixed-share label (ellipsis) + flexible track + right amount */
  .row{display:flex;align-items:center;gap:8px;margin:6px 0}
  .lbl{flex:0 0 34%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:#ccc}
  .track{flex:1;min-width:0;height:14px;background:#1d1d1d;border-radius:3px;overflow:hidden}
  .bar{display:block;height:100%;border-radius:3px}
  .bar.out{background:#f87} .bar.in{background:#7f7}
  .val{flex:0 0 auto;font-size:13px;font-variant-numeric:tabular-nums;color:#ddd}
  .empty{color:#888;font-size:13px;margin:4px 0}
  /* trend: month label + stacked out/in bars */
  .trow{display:flex;align-items:center;gap:8px;margin:9px 0}
  .tmonth{flex:0 0 58px;font-size:12px;color:#bbb}
  .tbars{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
  .tline{display:flex;align-items:center;gap:6px}
  .ttrack{flex:1;min-width:0;height:10px;background:#1d1d1d;border-radius:2px;overflow:hidden}
  .tb{display:block;height:100%}
  .tb.out{background:#f87} .tb.in{background:#7f7}
  .tval{flex:0 0 auto;font-size:11px;font-variant-numeric:tabular-nums}
  .tval.out{color:#f87} .tval.in{color:#7f7}
</style></head><body>
  <div class="tabs accts" id="accts"></div>
  <div class="tabs" id="tabs"></div>
  <div class="dates">
    <input type="date" id="start" onchange="onDate()">
    <span class="arrow">→</span>
    <input type="date" id="end" onchange="onDate()">
  </div>
  <div class="summary">
    <div class="cell"><div class="cap">Out</div><div class="amt out" id="out">-$0.00</div></div>
    <div class="cell"><div class="cap">In</div><div class="amt in" id="in">+$0.00</div></div>
    <div class="cell"><div class="cap">Net</div><div class="amt" id="net">$0.00</div></div>
  </div>
  <h2>Spending by category</h2><div id="outcats"></div>
  <h2>Income by category</h2><div id="incats"></div>
  <h2>Trend (out vs in)</h2><div id="trend"></div>
  <script>${pageJs}</script>
</body></html>`;

const wv = new WebView();
await wv.loadHTML(html);
await wv.present(true);
