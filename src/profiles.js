'use strict';

// Built-in bank profiles. Each drives the general engine. signature/noiseWords
// are matched case-insensitively (store them lowercased).
const BANK1 = {
  id: 'bank1',
  name: 'Bank 1',
  defaultAccount: 'Spending',
  signature: ['apply', 'cards', 'payments'],
  noiseWords: [],                 // bank 1 chrome already covered by built-in isNoise rules
  layout: 'column-zip',
};

const BANK2 = {
  id: 'bank2',
  name: 'Bank 2',
  defaultAccount: 'Investment',
  signature: ['summary', 'more options'],
  noiseWords: ['summary', 'more options'],
  layout: 'row-stacked',
};

module.exports = { BANK1, BANK2 };
