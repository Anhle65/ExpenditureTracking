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
// High-contrast qualitative palette, ordered so consecutive slices differ strongly.
var PALETTE = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#a855f7','#ec4899','#06b6d4','#84cc16','#f97316','#14b8a6','#eab308','#94a3b8'];

function compute() {
  // Short ranges (<= ~2 months) bucket the trend by DAY so a single month shows a
  // daily trend; longer ranges bucket by month.
  var byDay = (Date.parse(curEnd) - Date.parse(curStart)) <= 62 * 86400000;
  var out = 0, inc = 0, outCats = {}, inCats = {}, buckets = {};
  for (var i = 0; i < TX.length; i++) {
    var t = TX[i];
    if (curAccount !== 'All' && t.acct !== curAccount) continue;
    if (t.d < curStart || t.d > curEnd) continue;
    var key = byDay ? t.d : t.d.slice(0, 7);
    if (!buckets[key]) buckets[key] = { out: 0, inc: 0 };
    if (t.dir === 'out') { out += t.a; outCats[t.c] = (outCats[t.c] || 0) + t.a; buckets[key].out += t.a; }
    else { inc += t.a; inCats[t.c] = (inCats[t.c] || 0) + t.a; buckets[key].inc += t.a; }
  }
  return { out: out, inc: inc, outCats: outCats, inCats: inCats, buckets: buckets, byDay: byDay };
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

// Spending donut (inline SVG) + legend. Donut shows proportions at a glance;
// the legend gives category, amount, and % for readable detail.
function spendingPie(map) {
  var keys = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; });
  if (!keys.length) return '<p class="empty">No spending in range.</p>';
  var total = 0, i;
  for (i = 0; i < keys.length; i++) total += map[keys[i]];
  // Amounts are private (not shown on screen); tapping a slice or its legend
  // colour pops a tooltip with that category's amount. Slices are individual
  // SVG paths so each is tappable.
  var cx = 60, cy = 60, ro = 46, ri = 30, a0 = -Math.PI / 2, slices = '';
  for (i = 0; i < keys.length; i++) {
    var v = map[keys[i]], color = PALETTE[i % PALETTE.length], amt = '$' + v.toFixed(2);
    if (keys.length === 1) {
      slices += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ro + '" fill="' + color +
                '" data-cat="' + keys[i] + '" data-amt="' + amt + '" onclick="setCenter(this)"></circle>';
    } else {
      var a1 = a0 + (v / total) * 2 * Math.PI;
      slices += '<path d="' + arc(cx, cy, ro, ri, a0, a1) + '" fill="' + color +
                '" data-cat="' + keys[i] + '" data-amt="' + amt + '" onclick="setCenter(this)"></path>';
      a0 = a1;
    }
  }
  // The donut centre is the display: TOTAL by default; tap the hole to reset.
  var hole = '<circle cx="' + cx + '" cy="' + cy + '" r="' + ri + '" fill="#111" data-cat="TOTAL" data-amt="$' +
             total.toFixed(2) + '" onclick="setCenter(this)"></circle>';
  var svg = '<svg viewBox="0 0 120 120" class="pie">' + slices + hole +
            '<text id="pc-label" x="60" y="56" class="pc-t" text-anchor="middle" pointer-events="none">TOTAL</text>' +
            '<text id="pc-amount" x="60" y="70" class="pc-v" text-anchor="middle" pointer-events="none">$' + total.toFixed(2) + '</text></svg>';

  var legend = '<div class="legend">';
  for (i = 0; i < keys.length; i++) {
    var v2 = map[keys[i]];
    legend += '<div class="lrow" data-cat="' + keys[i] + '" data-amt="$' + v2.toFixed(2) + '" onclick="setCenter(this)">' +
              '<span class="sw" style="background:' + PALETTE[i % PALETTE.length] + '"></span>' +
              '<span class="lname">' + keys[i] + '</span>' +
              '<span class="lpct">' + (v2 / total * 100).toFixed(0) + '%</span></div>';
  }
  legend += '</div>';
  return '<div class="pie-wrap"><div class="pie-box">' + svg + '</div>' + legend + '</div>' +
         '<p class="hint">Tap a colour to show that category in the centre · tap the centre for the total</p>';
}

function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// Donut-segment path from angle a0 to a1 (radians), outer ro, inner ri.
function arc(cx, cy, ro, ri, a0, a1) {
  function p(r, a) { return [(cx + r * Math.cos(a)).toFixed(2), (cy + r * Math.sin(a)).toFixed(2)]; }
  var so = p(ro, a0), eo = p(ro, a1), ei = p(ri, a1), si = p(ri, a0);
  var large = (a1 - a0) > Math.PI ? 1 : 0;
  return 'M' + so[0] + ',' + so[1] + ' A' + ro + ',' + ro + ' 0 ' + large + ' 1 ' + eo[0] + ',' + eo[1] +
         ' L' + ei[0] + ',' + ei[1] + ' A' + ri + ',' + ri + ' 0 ' + large + ' 0 ' + si[0] + ',' + si[1] + ' Z';
}

// Swap the donut centre to the tapped category's name + amount (tap the centre
// hole, whose data-cat is "TOTAL", to reset to the total).
function setCenter(el) {
  document.getElementById('pc-label').textContent = trunc(el.getAttribute('data-cat'), 10);
  document.getElementById('pc-amount').textContent = el.getAttribute('data-amt');
}

// Trend as an SVG line chart: an out line (red) and an in line (green). When
// byDay is true the x-axis is by date (day of month); otherwise by month.
function trendLines(buckets, byDay) {
  var keys = Object.keys(buckets).sort();
  if (!keys.length) return '<p class="empty">None in range.</p>';
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var max = 1, i;
  for (i = 0; i < keys.length; i++) {
    if (buckets[keys[i]].out > max) max = buckets[keys[i]].out;
    if (buckets[keys[i]].inc > max) max = buckets[keys[i]].inc;
  }
  var W = 320, H = 168, padL = 8, padR = 8, padT = 12, padB = 22;
  var plotW = W - padL - padR, plotH = H - padT - padB, n = keys.length;
  function x(i) { return n === 1 ? padL + plotW / 2 : padL + i * (plotW / (n - 1)); }
  function y(v) { return padT + plotH * (1 - v / max); }
  function label(k) { return byDay ? String(parseInt(k.slice(8, 10), 10)) : MON[parseInt(k.slice(5, 7), 10) - 1]; }
  var step = Math.ceil(n / 8);   // at most ~8 x-axis labels so they don't crowd

  var outPts = '', inPts = '', dots = '', labels = '';
  for (i = 0; i < keys.length; i++) {
    var o = buckets[keys[i]].out, m = buckets[keys[i]].inc, px = x(i).toFixed(1);
    outPts += px + ',' + y(o).toFixed(1) + ' ';
    inPts += px + ',' + y(m).toFixed(1) + ' ';
    dots += '<circle cx="' + px + '" cy="' + y(o).toFixed(1) + '" r="2.6" fill="#ef4444"></circle>' +
            '<circle cx="' + px + '" cy="' + y(m).toFixed(1) + '" r="2.6" fill="#22c55e"></circle>';
    if (i % step === 0 || i === n - 1) {
      labels += '<text x="' + px + '" y="' + (H - 7) + '" text-anchor="middle" class="ax">' + label(keys[i]) + '</text>';
    }
  }
  var lines = '';
  if (n >= 2) {
    lines = '<polyline points="' + outPts.trim() + '" fill="none" stroke="#ef4444" stroke-width="2"></polyline>' +
            '<polyline points="' + inPts.trim() + '" fill="none" stroke="#22c55e" stroke-width="2"></polyline>';
  }
  var legend = '<div class="tlegend"><span class="tk"><span class="dot out"></span>Out</span>' +
               '<span class="tk"><span class="dot in"></span>In</span></div>';
  return legend + '<svg viewBox="0 0 ' + W + ' ' + H + '" class="linechart">' + lines + dots + labels + '</svg>';
}

function render() {
  var r = compute(), net = r.inc - r.out;
  document.getElementById('out').textContent = '-$' + r.out.toFixed(2);
  document.getElementById('in').textContent = '+$' + r.inc.toFixed(2);
  var n = document.getElementById('net');
  n.textContent = (net >= 0 ? '+' : '-') + '$' + Math.abs(net).toFixed(2);
  n.className = 'amt ' + (net >= 0 ? 'in' : 'out');
  document.getElementById('outcats').innerHTML = spendingPie(r.outCats);
  document.getElementById('incats').innerHTML = catRows(r.inCats, 'in');
  document.getElementById('trend').innerHTML = trendLines(r.buckets, r.byDay);
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
  /* spending donut + legend: pie beside legend on wide, stacks on narrow */
  /* pie stretches to fill the left; legend (name + %) sits on the right */
  .pie-wrap{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;margin-top:4px}
  .pie-box{flex:1 1 160px;min-width:150px;max-width:260px}
  .pie{width:100%;height:auto;display:block}
  .pie path,.pie circle{cursor:pointer}
  .hint{color:#777;font-size:11px;margin:8px 0 0}
  .pc-t{fill:#9a9a9a;font-size:9px;text-transform:uppercase}
  .pc-v{fill:#eee;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}
  .legend{flex:0 0 auto}
  .lrow{display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer}
  .sw{flex:0 0 auto;width:11px;height:11px;border-radius:2px}
  .lname{flex:0 0 88px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:#ccc}
  .lpct{flex:0 0 auto;width:34px;text-align:right;font-size:12px;color:#9a9a9a;font-variant-numeric:tabular-nums}
  /* trend: SVG line chart (out red, in green) + small legend */
  .tlegend{display:flex;gap:14px;font-size:12px;color:#bbb;margin:2px 0 2px}
  .tk{display:flex;align-items:center;gap:5px}
  .dot{width:9px;height:9px;border-radius:50%;display:inline-block}
  .dot.out{background:#ef4444} .dot.in{background:#22c55e}
  .linechart{width:100%;height:auto;display:block;margin-top:2px}
  .ax{fill:#888;font-size:8px}
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
