'use strict';

// Interactive dashboard. Account tabs (Spending / Investment / All) and the
// date-range controls live INSIDE the report. Transactions are embedded and all
// filtering/aggregation runs in-page, so tapping recomputes instantly. Data
// stays on the device — it is only rendered in the local WebView.
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
  var out = 0, inc = 0, cats = {}, months = {};
  for (var i = 0; i < TX.length; i++) {
    var t = TX[i];
    if (curAccount !== 'All' && t.acct !== curAccount) continue;
    if (t.d < curStart || t.d > curEnd) continue;
    if (t.dir === 'out') {
      out += t.a;
      cats[t.c] = (cats[t.c] || 0) + t.a;
      var ym = t.d.slice(0, 7);
      months[ym] = (months[ym] || 0) + t.a;
    } else { inc += t.a; }
  }
  return { out: out, inc: inc, cats: cats, months: months };
}
function rows(map, sortByValue) {
  var keys = Object.keys(map);
  keys.sort(sortByValue ? function (a, b) { return map[b] - map[a]; } : undefined);
  var max = 1, i;
  for (i = 0; i < keys.length; i++) if (map[keys[i]] > max) max = map[keys[i]];
  var h = '';
  for (i = 0; i < keys.length; i++) {
    var k = keys[i], v = map[k];
    h += '<div class="row"><span class="lbl">' + k + '</span>' +
         '<span class="bar" style="width:' + (v / max * 100).toFixed(1) + '%"></span>' +
         '<span class="val">$' + v.toFixed(2) + '</span></div>';
  }
  return h || '<p class="empty">None in range.</p>';
}
function render() {
  var r = compute(), net = r.inc - r.out;
  document.getElementById('out').textContent = '-$' + r.out.toFixed(2);
  document.getElementById('in').textContent = '+$' + r.inc.toFixed(2);
  var n = document.getElementById('net');
  n.textContent = 'Net: ' + (net >= 0 ? '+' : '-') + '$' + Math.abs(net).toFixed(2);
  n.className = net >= 0 ? 'net in' : 'net out';
  document.getElementById('cats').innerHTML = rows(r.cats, true);
  document.getElementById('trend').innerHTML = rows(r.months, false);
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
  body{font:16px -apple-system;margin:0;padding:16px;background:#111;color:#eee}
  h2{font-size:15px;color:#9af;margin:22px 0 6px}
  .tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
  .tab{font:12px -apple-system;padding:6px 11px;border-radius:14px;border:none;background:#222;color:#ccc}
  .tab.active{background:#5a8;color:#031;font-weight:600}
  .accts .tab.active{background:#9af;color:#013}
  .dates{display:flex;gap:8px;align-items:center;margin:6px 0 14px}
  input[type=date]{background:#222;color:#eee;border:1px solid #333;border-radius:6px;padding:5px 7px;font:13px -apple-system}
  .tot{font-size:26px;font-weight:700} .out{color:#f87} .in{color:#7f7}
  .net{font-size:14px;color:#bbb;margin-top:4px}
  .row{display:flex;align-items:center;gap:8px;margin:6px 0}
  .lbl{width:120px;font-size:13px;color:#bbb;overflow:hidden;white-space:nowrap}
  .bar{height:14px;background:#5a8;border-radius:3px;min-width:2px}
  .val{margin-left:auto;font-variant-numeric:tabular-nums}
  .empty{color:#888}
</style></head><body>
  <div class="tabs accts" id="accts"></div>
  <div class="tabs" id="tabs"></div>
  <div class="dates">
    <input type="date" id="start" onchange="onDate()">
    <span>→</span>
    <input type="date" id="end" onchange="onDate()">
  </div>
  <div class="tot"><span class="out" id="out">-$0.00</span>&nbsp;·&nbsp;<span class="in" id="in">+$0.00</span></div>
  <div class="net" id="net">Net: $0.00</div>
  <h2>By category (spending)</h2><div id="cats"></div>
  <h2>Trend (monthly out)</h2><div id="trend"></div>
  <script>${pageJs}</script>
</body></html>`;

const wv = new WebView();
await wv.loadHTML(html);
await wv.present(true);
