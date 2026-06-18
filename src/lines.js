'use strict';

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const NOISE_WORDS = new Set(['accounts','payments','transfer','cards','apply','go',
                             'pay','details','more']);

function isNoise(line, extraNoiseWords) {
  const t = String(line).trim();
  if (t === '') return true;
  if (/^\d{1,2}:\d{2}$/.test(t)) return true;        // time, e.g. 21:33
  if (/%/.test(t)) return true;                       // battery, e.g. © D 69%
  if (/degrees/i.test(t)) return true;                // app title bar (2degrees; OCR may mangle to "Il degrees")
  if (t.includes('<')) return true;                   // nav chrome, e.g. < Accounts
  if (NOISE_WORDS.has(t.toLowerCase())) return true;  // bottom nav words
  if (Array.isArray(extraNoiseWords) && extraNoiseWords.indexOf(t.toLowerCase()) !== -1) return true;
  if (/^\$[\d,]+\.\d{2}$/.test(t)) return true;       // unsigned amount = balance, ignore
  if (!/[a-z0-9]/i.test(t)) return true;              // symbols only, e.g. $→
  return false;
}

// A real transaction amount MUST carry a sign (+/-). Unsigned amounts are
// account balances and are ignored. Allows an optional space after the sign
// (bank 2 writes "- $5,000.00"; bank 1 writes "-$22.40").
const AMOUNT_RE = /^([-+])\s?\$([\d,]+\.\d{2})$/;

function parseAmount(line) {
  const m = String(line).trim().match(AMOUNT_RE);
  if (!m) return null;
  return {
    amount: parseFloat(m[2].replace(/,/g, '')),
    direction: m[1] === '-' ? 'out' : 'in',
  };
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

const DATE_RE = /\b(MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{1,2})\s+([A-Z]{2,5})\s+(\d{4})\b/;

function parseDate(line) {
  const m = String(line).trim().toUpperCase().match(DATE_RE);
  if (!m) return null;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[4], 10);
  const token = m[3].slice(0, 3);

  let idx = MONTHS.indexOf(token);
  if (idx === -1) {
    // Nearest month by edit distance, but only accept a UNIQUE best match
    // within 1 edit. A tie (e.g. 'MAX' -> MAR/MAY) is genuinely ambiguous.
    let best = -1, bestD = 99, tie = false;
    MONTHS.forEach((mo, i) => {
      const d = levenshtein(token, mo);
      if (d < bestD) { bestD = d; best = i; tie = false; }
      else if (d === bestD) { tie = true; }
    });
    if (bestD <= 1 && !tie) idx = best;
  }

  // Reject OCR digit-misreads: a structurally-valid match with an impossible
  // day must be flagged, not emitted as a confident ISO date.
  const validDay = day >= 1 && day <= 31;
  if (idx === -1 || !validDay) {
    return { iso: null, day, month: idx === -1 ? null : idx + 1, year, uncertain: true };
  }

  const iso = `${year}-${String(idx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { iso, day, month: idx + 1, year, uncertain: false };
}

module.exports = { isNoise, parseAmount, parseDate, levenshtein };
