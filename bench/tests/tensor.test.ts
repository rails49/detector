import { expect, it } from 'vitest';
import { rgbaToChw } from '../src/tensor.js';

it('writes RGBA pixels as planar RGB in 0..1 and drops alpha', () => {
  const rgba = new Uint8ClampedArray([255, 0, 51, 9, 0, 255, 102, 9]);
  const out = new Float32Array(6);
  rgbaToChw(rgba, out);
  expect(Array.from(out)).toEqual([1, 0, 0, 1, 0.2, 0.4].map(Math.fround));
});
