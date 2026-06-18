'use strict';

const load = (n) => (typeof require !== 'undefined') ? require('./' + n) : importModule(n);
const { parseWithProfile } = load('engine');
const { BANK1 } = load('profiles');

// Back-compat: the original transaction-list parser is now the bank-1 profile.
function parseOcr(text, opts = {}) {
  return parseWithProfile(text, BANK1, opts);
}

module.exports = { parseOcr };
