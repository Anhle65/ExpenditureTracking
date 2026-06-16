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

// existing: stored transactions (each already has .id).
// incoming: freshly parsed transactions (no id yet).
// Returns { added: [...with id], skipped: <count of duplicates> }.
function dedupe(existing, incoming) {
  const seen = new Set(existing.map(t => t.id));
  const added = [];
  let skipped = 0;
  for (const t of incoming) {
    const id = makeId(t);
    if (seen.has(id)) { skipped++; continue; }
    seen.add(id);
    added.push({ ...t, id });
  }
  return { added, skipped };
}

module.exports = { fnv1a, makeId, dedupe };
