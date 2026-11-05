import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

/**
 * Write `conformance/resample.json`: one synthetic frame, and what sharp makes
 * of it at each reduction. `dataset/tests/resample.test.ts` checks the file
 * against the installed sharp.
 *
 *   pnpm --filter dataset run conformance:resample
 */

const SOURCE = { width: 160, height: 96 };
const SIZES = [
  { name: 'about 1.2×', width: 133, height: 80 },
  { name: 'about 2×', width: 79, height: 47 },
  { name: 'above 4×, where libvips box-shrinks first', width: 36, height: 22 },
];

/** A checkerboard with noise in red, a diagonal wave in green, a gradient XOR'd with the row in blue. */
function syntheticFrame({ width, height }: typeof SOURCE): Buffer {
  const data = Buffer.alloc(width * height * 3);
  let seed = 12345;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      data[i] = (((x >> 3) + (y >> 3)) & 1 ? 200 : 40) + Math.floor(noise() * 30) - 15;
      data[i + 1] = Math.round(128 + 100 * Math.sin(x / 7 + y / 13));
      data[i + 2] = Math.floor((x * 255) / width) ^ (y & 255);
    }
  }
  return data;
}

const source = syntheticFrame(SOURCE);
const cases = await Promise.all(
  SIZES.map(async ({ name, width, height }) => {
    const out = await sharp(source, { raw: { ...SOURCE, channels: 3 } }).resize(width, height).raw().toBuffer();
    return { name, size: { width, height }, rgb: out.toString('base64') };
  })
);

const file = new URL('../../conformance/resample.json', import.meta.url);
const json = {
  tolerance: 2,
  source: { ...SOURCE, rgb: source.toString('base64') },
  cases,
};
writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
