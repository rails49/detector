/** Writes RGBA bytes into `out` as planar RGB floats in 0..1, the model's NCHW input. */
export function rgbaToChw(rgba: Uint8ClampedArray, out: Float32Array): void {
  const pixels = rgba.length / 4;
  for (let i = 0; i < pixels; i++) {
    out[i] = rgba[4 * i] / 255;
    out[pixels + i] = rgba[4 * i + 1] / 255;
    out[2 * pixels + i] = rgba[4 * i + 2] / 255;
  }
}
