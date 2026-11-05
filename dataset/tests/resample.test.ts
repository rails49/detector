import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { resample, type Frame, type Pixels } from '@rails49/detector';
import { decodeResampled } from '../src/yolo_pixels.ts';

/**
 * `resample` against the export's own resize, at the export's ratios (#7).
 *
 * The frames are synthetic, at the ceiling captures' size: a checkerboard with
 * noise in red, a diagonal wave in green and a gradient XOR'd with the row in
 * blue, so edges, smooth areas and fine detail are all present. Each test
 * states its tolerance, per channel: the smallest the implementation reaches,
 * since libvips' SIMD reduce rounds a little differently from its C path.
 */

const CAPTURE = { width: 4440, height: 2130 };

function syntheticFrame({ width, height }: Frame): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 12345;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (((x >> 5) + (y >> 6)) & 1 ? 200 : 40) + Math.floor(noise() * 30) - 15;
      data[i + 1] = 128 + 100 * Math.sin(x / 7 + y / 13);
      data[i + 2] = Math.floor((x * 255) / width) ^ (y & 255);
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

function rgb(p: Pixels): Buffer {
  const out = Buffer.alloc(p.width * p.height * 3);
  for (let i = 0, j = 0; i < p.width * p.height; i++, j += 4) {
    out[i * 3] = p.data[j];
    out[i * 3 + 1] = p.data[j + 1];
    out[i * 3 + 2] = p.data[j + 2];
  }
  return out;
}

/** Max and mean absolute difference per channel, RGBA against packed RGB. */
function difference(actual: Pixels, expected: Buffer): { max: number; mean: number } {
  let max = 0;
  let sum = 0;
  const n = actual.width * actual.height;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(actual.data[i * 4 + c] - expected[i * 3 + c]);
      if (d > max) max = d;
      sum += d;
    }
  }
  return { max, mean: sum / (n * 3) };
}

async function sharpResize(src: Pixels, size: Frame): Promise<Buffer> {
  return sharp(rgb(src), { raw: { width: src.width, height: src.height, channels: 3 } })
    .resize(size.width, size.height)
    .raw()
    .toBuffer();
}

describe('resample against sharp’s resize from raw pixels', () => {
  const src = syntheticFrame(CAPTURE);

  it('agrees within 2, mean 0.10, at about 2× (today’s DPT 32.6 → 16)', async () => {
    const size = { width: 2179, height: 1045 };
    const d = difference(resample(src, size), await sharpResize(src, size));
    expect(d.max).toBeLessThanOrEqual(2);
    expect(d.mean).toBeLessThanOrEqual(0.1);
  });

  it('agrees within 2, mean 0.18, at about 4.4×, where libvips box-shrinks first', async () => {
    const size = { width: 1015, height: 487 };
    const d = difference(resample(src, size), await sharpResize(src, size));
    expect(d.max).toBeLessThanOrEqual(2);
    expect(d.mean).toBeLessThanOrEqual(0.18);
  });
});

describe('the shared resample fixtures', () => {
  const fixtures = JSON.parse(readFileSync(new URL('../../conformance/resample.json', import.meta.url), 'utf8')) as {
    tolerance: number;
    source: Frame & { rgb: string };
    cases: { name: string; size: Frame; rgb: string }[];
  };

  it.each(fixtures.cases)('still match sharp at $name', async ({ size, rgb: expected }) => {
    const { rgb: source, width, height } = fixtures.source;
    const actual = await sharp(Buffer.from(source, 'base64'), { raw: { width, height, channels: 3 } })
      .resize(size.width, size.height)
      .raw()
      .toBuffer();
    const want = Buffer.from(expected, 'base64');
    expect(actual.length).toBe(want.length);
    let worst = 0;
    actual.forEach((value, i) => {
      worst = Math.max(worst, Math.abs(value - want[i]!));
    });
    expect(worst).toBeLessThanOrEqual(fixtures.tolerance);
  });
});

describe('the export’s decode, then resample', () => {
  it('writes the same pixels at today’s ratio as resizing the JPEG directly did', async () => {
    const jpeg = await sharp(rgb(syntheticFrame(CAPTURE)), { raw: { ...CAPTURE, channels: 3 } })
      .jpeg({ quality: 90 })
      .toBuffer();
    const size = { width: 2179, height: 1045 };

    // The export's call before #7.
    const before = await sharp(jpeg).resize(size.width, size.height).removeAlpha().raw().toBuffer();
    const after = await decodeResampled(jpeg, size);

    expect([after.width, after.height, after.channels]).toEqual([size.width, size.height, 3]);
    expect(after.data.equals(before)).toBe(true);
  });

  it('resamples what resample resamples, within 2, mean 0.75, at any ratio', async () => {
    const src = syntheticFrame({ width: 1600, height: 900 });
    const png = await sharp(rgb(src), { raw: { width: 1600, height: 900, channels: 3 } })
      .png()
      .toBuffer();
    const size = { width: 361, height: 203 };

    const d = difference(resample(src, size), (await decodeResampled(png, size)).data);
    expect(d.max).toBeLessThanOrEqual(2);
    expect(d.mean).toBeLessThanOrEqual(0.75);
  });
});
