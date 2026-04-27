import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dark slate background, organic leafy checkmark in green.
// The check curves from bottom-left through a valley to top-right.
// A teardrop leaf flourish extends from the upstroke tip.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1e293b" rx="80"/>
  <path
    d="M 110 268 C 130 295 180 345 215 358 L 398 152"
    fill="none"
    stroke="#22c55e"
    stroke-width="44"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M 398 152 C 415 128 442 120 430 100 C 414 122 402 140 398 152 Z"
    fill="#22c55e"
  />
</svg>`;

const publicDir = join(__dirname, '..', 'public');
mkdirSync(publicDir, { recursive: true });

const sizes = [
  { size: 512, name: 'icon-512.png' },
  { size: 180, name: 'icon-180.png' },
];

for (const { size, name } of sizes) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(join(publicDir, name));
  console.log(`✓ Generated public/${name}`);
}
