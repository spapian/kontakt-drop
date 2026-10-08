const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { composeKontaktArtwork } = require('../src/artwork.cjs');

test('creates current Kontakt artwork at the required size', async () => {
  const source = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#d42218' } }).png().toBuffer();
  const output = await composeKontaktArtwork(source, 536, 264);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 536);
  assert.equal(metadata.height, 264);
});

test('creates a legacy wallpaper without changing its required dimensions', async () => {
  const source = await sharp({ create: { width: 300, height: 600, channels: 3, background: '#101010' } }).png().toBuffer();
  const output = await composeKontaktArtwork(source, 598, 98);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 598);
  assert.equal(metadata.height, 98);
});

test('applies manual zoom and position inside the output frame', async () => {
  const source = await sharp({
    create: { width: 800, height: 500, channels: 3, background: '#002fa7' }
  }).png().toBuffer();
  const centered = await composeKontaktArtwork(source, 536, 264);
  const positioned = await composeKontaktArtwork(source, 536, 264, { zoom: 2.4, x: -.45, y: .25 });
  assert.notDeepEqual(positioned, centered);
  const metadata = await sharp(positioned).metadata();
  assert.deepEqual([metadata.width, metadata.height], [536, 264]);
});
