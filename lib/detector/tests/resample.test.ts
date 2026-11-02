import { describe, expect, it } from 'vitest';
import { resample, type Pixels } from '../src/resample.ts';

/**
 * The resample on known pixels, in bare node. Its agreement with sharp itself,
 * at the export's ratios, is pinned in `dataset/tests/resample.test.ts`, where
 * sharp is a dependency.
 */

function frame(width: number, height: number, pixel: (x: number, y: number) => readonly number[]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(pixel(x, y), (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

function at(p: Pixels, x: number, y: number): number[] {
  const i = (y * p.width + x) * 4;
  return Array.from(p.data.subarray(i, i + 4));
}

describe('resample', () => {
  it('returns the size asked for', () => {
    const out = resample(frame(444, 213, () => [0, 0, 0, 255]), { width: 218, height: 105 });
    expect([out.width, out.height, out.data.length]).toEqual([218, 105, 218 * 105 * 4]);
  });

  it('leaves a flat colour flat, reduced or enlarged, with or without the box pre-shrink', () => {
    const flat = frame(400, 300, () => [10, 128, 250, 255]);
    for (const size of [
      { width: 199, height: 149 },
      { width: 91, height: 68 },
      { width: 523, height: 392 },
    ]) {
      const out = resample(flat, size);
      for (let i = 0; i < out.data.length; i += 4) {
        expect(Array.from(out.data.subarray(i, i + 4))).toEqual([10, 128, 250, 255]);
      }
    }
  });

  it('averages pixel pairs at exactly 2×, pixel centres aligned', () => {
    // A column ramp 0, 4, 8, …: output column x sits halfway between input
    // columns 2x and 2x+1.
    const ramp = frame(64, 4, (x) => [x * 4, x * 4, x * 4, 255]);
    const out = resample(ramp, { width: 32, height: 2 });
    for (const x of [8, 15, 24]) expect(at(out, x, 1)[0]).toBe(8 * x + 2);
  });

  it('keeps a ramp in place when enlarging', () => {
    const ramp = frame(100, 4, (x) => [x, x, x, 255]);
    const out = resample(ramp, { width: 200, height: 8 });
    // Output column x samples input (x + 0.5) / 2 - 0.5.
    for (const x of [41, 90, 151]) expect(at(out, x, 3)[0]).toBe(Math.round((x + 0.5) / 2 - 0.5));
  });

  it('scales both axes by the smaller ratio and crops the overhang from the centre, as sharp’s cover does', () => {
    // 100 × 100 to 100 × 50 is no scale at all: rows 25 to 74, unchanged.
    const rows = frame(100, 100, (_, y) => [y, 0, 0, 255]);
    const out = resample(rows, { width: 100, height: 50 });
    expect(at(out, 50, 0)[0]).toBe(25);
    expect(at(out, 50, 49)[0]).toBe(74);
  });

  it('answers opaque, whatever the alpha was', () => {
    const out = resample(frame(20, 20, () => [1, 2, 3, 0]), { width: 9, height: 9 });
    expect(at(out, 4, 4)).toEqual([1, 2, 3, 255]);
  });

  it('refuses an empty or fractional size, and data that is not the frame', () => {
    const f = frame(10, 10, () => [0, 0, 0, 255]);
    expect(() => resample(f, { width: 0, height: 5 })).toThrow(/whole, non-empty/);
    expect(() => resample(f, { width: 4.5, height: 5 })).toThrow(/whole, non-empty/);
    expect(() => resample({ ...f, width: 11 }, { width: 5, height: 5 })).toThrow(/RGBA/);
  });
});
