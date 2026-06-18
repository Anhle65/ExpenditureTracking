'use strict';

// Score each bank by how many of its signature lines appear (case-insensitive,
// substring) in the OCR text. Highest score wins; a tie or zero score is not
// confident.
function detectBank(ocr, banks) {
  const hay = String(ocr).toLowerCase();
  let best = null, bestScore = 0, tie = false;
  for (const bank of banks) {
    let score = 0;
    for (const sig of (bank.signature || [])) {
      if (hay.indexOf(String(sig).toLowerCase()) !== -1) score++;
    }
    if (score > bestScore) { bestScore = score; best = bank; tie = false; }
    else if (score === bestScore && score > 0) { tie = true; }
  }
  const confident = bestScore > 0 && !tie;
  return { bank: confident ? best : null, confident };
}

module.exports = { detectBank };
