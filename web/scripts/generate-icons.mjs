// One-off: derives PWA icons from the committed logo. Outputs are committed,
// so this only reruns when the logo changes.
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const BG = { r: 11, g: 17, b: 32, alpha: 1 }; // matches the app's #0b1120
const SRC = 'public/LUWAS_logo.png';

await mkdir('public/icons', { recursive: true });

await sharp(SRC).resize(192, 192, { fit: 'contain', background: BG }).png().toFile('public/icons/icon-192.png');
await sharp(SRC).resize(512, 512, { fit: 'contain', background: BG }).png().toFile('public/icons/icon-512.png');

// Maskable: logo inside the 80% safe zone on a full-bleed background.
const inner = await sharp(SRC).resize(410, 410, { fit: 'contain', background: BG }).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: BG } })
  .composite([{ input: inner }])
  .png()
  .toFile('public/icons/maskable-512.png');

console.log('wrote public/icons/{icon-192,icon-512,maskable-512}.png');
