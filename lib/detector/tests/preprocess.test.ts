import { describe, expect, it } from 'vitest';
import { DETECTOR_CANVAS } from '../src/generated.ts';
import { PAD_LEVEL, paintFrame, tileInput, type PaintTarget } from '../src/preprocess.ts';
import type { Pixels } from '../src/resample.ts';

/**
 * The detector's input, before the model. The resample itself is `resample`'s
 * and has its own tests; what is pinned here is that the frame reaches it
 * unscaled, and how a tile becomes the tensor.
 */

describe('the frame copy', () => {
  it('draws the source at its own size, and asks for no filter', () => {
    // A context with only `drawImage`'s three-argument form: no destination
    // size to scale to, and no smoothing settings to touch. Assigning one
    // would throw on the frozen object.
    const calls: unknown[][] = [];
    const ctx: PaintTarget = Object.freeze({
      drawImage: (...args: unknown[]) => {
        calls.push(args);
      },
    });
    const source = {} as CanvasImageSource;

    paintFrame(ctx, source);

    expect(calls).toEqual([[source, 0, 0]]);
  });
});

/** A resampled frame whose every pixel names its position: R = x, G = y. */
function positions(width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set([x % 256, y % 256, 7, 255], (y * width + x) * 4);
  }
  return { data, width, height };
}

const AREA = DETECTOR_CANVAS * DETECTOR_CANVAS;

/** The tensor's three channels at canvas pixel (x, y), back in bytes. */
function rgbAt(planar: Float32Array, x: number, y: number): number[] {
  const o = y * DETECTOR_CANVAS + x;
  return [planar[o], planar[o + AREA], planar[o + 2 * AREA]].map((v) => Math.round(v * 255));
}

describe('a tile', () => {
  it('holds its pixels 1:1 in the top-left corner, planar and scaled to 0…1', () => {
    const planar = new Float32Array(3 * AREA);
    tileInput(positions(300, 200), { x: 40, y: 30, width: 100, height: 50 }, planar);

    expect(rgbAt(planar, 0, 0)).toEqual([40, 30, 7]);
    expect(rgbAt(planar, 99, 49)).toEqual([139, 79, 7]);
    expect(planar[0]).toBeCloseTo(40 / 255, 6);
  });

  it('is padded right and bottom with the trained grey, never resized', () => {
    const planar = new Float32Array(3 * AREA);
    tileInput(positions(300, 200), { x: 40, y: 30, width: 100, height: 50 }, planar);

    expect(rgbAt(planar, 100, 0)).toEqual([PAD_LEVEL, PAD_LEVEL, PAD_LEVEL]);
    expect(rgbAt(planar, 0, 50)).toEqual([PAD_LEVEL, PAD_LEVEL, PAD_LEVEL]);
    expect(rgbAt(planar, DETECTOR_CANVAS - 1, DETECTOR_CANVAS - 1)).toEqual([PAD_LEVEL, PAD_LEVEL, PAD_LEVEL]);
  });

  it('leaves nothing of the previous tile behind in the reused storage', () => {
    const planar = new Float32Array(3 * AREA);
    tileInput(positions(300, 200), { x: 0, y: 0, width: 300, height: 200 }, planar);
    tileInput(positions(300, 200), { x: 0, y: 0, width: 10, height: 10 }, planar);

    expect(rgbAt(planar, 150, 150)).toEqual([PAD_LEVEL, PAD_LEVEL, PAD_LEVEL]);
  });

  it('refuses storage that is not the canvas tensor', () => {
    expect(() => tileInput(positions(10, 10), { x: 0, y: 0, width: 10, height: 10 }, new Float32Array(3))).toThrow(
      /3 ×/
    );
  });
});
