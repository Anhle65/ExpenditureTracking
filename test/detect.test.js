const test = require('node:test');
const assert = require('node:assert/strict');
const { detectBank } = require('../src/detect');
const { BANK1, BANK2 } = require('../src/profiles');
const bank1 = require('./fixtures/2degrees-sample');
const bank2 = require('./fixtures/bank2-sample');

const BANKS = [BANK1, BANK2];

test('detects bank 2 from its signature lines', () => {
  const r = detectBank(bank2, BANKS);
  assert.equal(r.bank.id, 'bank2');
  assert.equal(r.confident, true);
});

test('detects bank 1 from its signature lines', () => {
  const r = detectBank(bank1, BANKS);
  assert.equal(r.bank.id, 'bank1');
  assert.equal(r.confident, true);
});

test('no signature match → not confident, bank null', () => {
  const r = detectBank('random text with no signatures', BANKS);
  assert.equal(r.bank, null);
  assert.equal(r.confident, false);
});
