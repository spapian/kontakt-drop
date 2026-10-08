const test = require('node:test');
const assert = require('node:assert/strict');
const { bestCanonicalName, cleanName, safeFileName, overlapScore, parseSnpid, scoreArtworkCandidate } = require('../src/core.cjs');

test('cleans common folder noise', () => assert.equal(cleanName('Damage_Guitars-Kontakt-Library'), 'Damage Guitars'));
test('sanitizes a Windows folder name', () => assert.equal(safeFileName('A: Bad / Name. '), 'A Bad  Name'));
test('scores matching names above unrelated ones', () => assert.ok(overlapScore('Damage Guitars', 'Damage Guitars by Heavyocity') > overlapScore('Damage Guitars', 'Noire Piano')));
test('selects a strong online name and rejects weak matches', () => {
  assert.equal(bestCanonicalName('damage guitars', ['Damage Guitars — Heavyocity Kontakt']).candidate, 'Damage Guitars');
  assert.equal(bestCanonicalName('mystery folder', ['Noire Piano | Native Instruments']).candidate, 'mystery folder');
});
test('reads SNPID from generated XML', () => assert.equal(parseSnpid('<ProductHints><SNPID>z7F</SNPID></ProductHints>'), 'z7F'));
test('prefers a high-resolution image near the requested banner ratio', () => {
  const correctBanner = scoreArtworkCandidate(2392, 392, 598 / 98);
  const hugeSquare = scoreArtworkCandidate(5000, 5000, 598 / 98);
  const tinyBanner = scoreArtworkCandidate(598, 98, 598 / 98);
  assert.ok(correctBanner > hugeSquare);
  assert.ok(correctBanner > tinyBanner);
});
