'use strict';

// FNV-1a 32-bit hash → hex. Pure JS so it runs identically in Node and
// Scriptable (no Node 'crypto' dependency).
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function makeId(t) {
  return fnv1a(`${t.date}|${t.amount}|${t.merchant}`);
}

// Whole-day distance between two ISO dates; Infinity if either is unparseable
// (e.g. a null date), so such rows never fuzzy-match.
function dayDiff(a, b) {
  const da = Date.parse(a), db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return Infinity;
  return Math.abs(da - db) / 86400000;
}

// Dedupe freshly parsed `incoming` against already-stored `existing`.
// - Exact match (same date|amount|merchant) is always a duplicate.
// - Overlap-across-days gate: when a date is uncertain (the parser's fallback
//   for the dateless leading block, on EITHER side), a row with the same
//   merchant+amount+direction within `windowDays` (default 2) is also a
//   duplicate. This catches a transaction re-scanned on a later day whose
//   fallback date drifted.
// Returns { added: [...with id], skipped: [{...t, id, reason, matchedId?}] }
// so the caller can show what was skipped and let the user keep real repeats.
function dedupe(existing, incoming, opts = {}) {
  const windowDays = opts.windowDays == null ? 2 : opts.windowDays;
  const seenIds = new Set(existing.map(t => t.id));
  const known = existing.slice();           // existing + rows added this run
  const added = [];
  const skipped = [];

  for (const t of incoming) {
    const id = makeId(t);
    if (seenIds.has(id)) {
      skipped.push({ ...t, id, reason: 'exact-duplicate' });
      continue;
    }
    const near = known.find(k =>
      k.merchant === t.merchant &&
      k.amount === t.amount &&
      k.direction === t.direction &&
      (t.dateUncertain || k.dateUncertain) &&
      dayDiff(k.date, t.date) <= windowDays);
    if (near) {
      skipped.push({ ...t, id, reason: 'near-duplicate', matchedId: near.id });
      continue;
    }
    const rec = { ...t, id };
    seenIds.add(id);
    known.push(rec);
    added.push(rec);
  }
  return { added, skipped };
}

module.exports = { fnv1a, makeId, dedupe };
