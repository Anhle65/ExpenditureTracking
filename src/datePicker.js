'use strict';

// Shared Scriptable glue: pops the native iOS date wheel (DatePicker) and
// returns a YYYY-MM-DD string — the format transactions are stored in. Reused
// by the delete-by-range flow; any script needing a date can importModule it.
// Only `pickDate` touches the Scriptable-only DatePicker (inside the async fn),
// so the pure `isoLocal` formatter is requireable + unit-tested on Node.

// Local calendar day, zero-padded. NOT toISOString(): that is UTC and would
// roll the day in any non-UTC timezone. Mirrors dashboard.js's ymd().
function isoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Present the native picker. `initial` is an optional YYYY-MM-DD string to
// preselect. Returns a YYYY-MM-DD string, or null if the user cancels.
async function pickDate(initial) {
  const dp = new DatePicker();
  if (typeof initial === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(initial)) {
    const [y, m, d] = initial.split('-').map(Number);
    dp.initialDate = new Date(y, m - 1, d);
  }
  try {
    const chosen = await dp.pickDate();
    return chosen ? isoLocal(chosen) : null;
  } catch (e) {
    return null; // dismissed / cancelled
  }
}

module.exports = { pickDate, isoLocal };
