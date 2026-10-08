const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'assets', 'icon-source.png');
const runtimePng = path.join(root, 'src', 'assets', 'icon.png');
const buildPng = path.join(root, 'build', 'icon.png');
const buildIco = path.join(root, 'build', 'icon.ico');

async function run() {
  await fs.promises.mkdir(path.dirname(runtimePng), { recursive: true });
  await fs.promises.mkdir(path.dirname(buildPng), { recursive: true });
  const png512 = await sharp(source)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const png256 = await sharp(source)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await fs.promises.writeFile(runtimePng, png512);
  await fs.promises.writeFile(buildPng, png512);

  // Windows ICO files may contain PNG-compressed 256px images.
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(0, 6);
  header.writeUInt8(0, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png256.length, 14);
  header.writeUInt32LE(22, 18);
  await fs.promises.writeFile(buildIco, Buffer.concat([header, png256]));
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
