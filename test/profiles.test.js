const test = require('node:test');
const assert = require('node:assert/strict');
const { BANK1, BANK2 } = require('../src/profiles');

test('BANK1 is the column-zip profile', () => {
  assert.equal(BANK1.layout, 'column-zip');
  assert.ok(Array.isArray(BANK1.signature));
  assert.ok(Array.isArray(BANK1.noiseWords));
});

test('BANK2 is the row-stacked profile with bank-2 signature words', () => {
  assert.equal(BANK2.layout, 'row-stacked');
  assert.ok(BANK2.signature.includes('more options'));
  assert.ok(BANK2.noiseWords.includes('summary'));
});
