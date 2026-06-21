const test = require('node:test');
const assert = require('node:assert/strict');
const { isoLocal } = require('../src/datePicker');

// isoLocal must read LOCAL date components (not toISOString, which is UTC and
// can roll the day backward/forward depending on the timezone). Dates are
// stored as YYYY-MM-DD, so the picker's output must match that exactly.
test('isoLocal formats a local date as zero-padded YYYY-MM-DD', () => {
  assert.equal(isoLocal(new Date(2026, 0, 5)), '2026-01-05');   // Jan, single-digit day
  assert.equal(isoLocal(new Date(2026, 11, 31)), '2026-12-31'); // Dec, two-digit
});

test('isoLocal uses local midnight, not the UTC instant', () => {
  // A Date at local midnight: toISOString() could be the PREVIOUS day in a
  // positive-offset zone. isoLocal must still return the local calendar day.
  const localMidnight = new Date(2026, 5, 9, 0, 0, 0);
  assert.equal(isoLocal(localMidnight), '2026-06-09');
});
