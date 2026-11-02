import type { Frame } from './types.ts';

/** An RGBA picture as the 2D context's `getImageData` hands it over. */
export interface Pixels {
  /** Row-major RGBA, 4 bytes per pixel, `width × height × 4` long. */
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/**
 * Resample `src` to `size` in our own code, so every user agent feeds the
 * model the same pixels from the same frame (#7). `drawImage`'s
 * `imageSmoothingQuality` is a hint each user agent implements as it likes.
 *
 * **Reducing, it matches `export:yolo`**: sharp's `resize(size.width,
 * size.height)` from raw pixels with sharp's defaults, which is libvips'
 * resize pipeline rather than a textbook filter:
 *
 * 1. **One scale for both axes.** sharp's default fit is `cover`: the frame is
 *    scaled by the smaller of the two axis ratios and the overhang is cropped
 *    from the centre. `inputLayout` rounds each axis on its own, so the two
 *    ratios differ by a rounding, and which one wins decides a pixel row.
 * 2. **A box pre-shrink on large reductions.** At a reduction of `2k` or more
 *    libvips first averages `k × k` blocks (`vips_shrink` with `ceil`: each
 *    axis rounded, a partial edge block filled by repeating the last row or
 *    column), leaving at least 2× for the filter.
 * 3. **Lanczos3, vertical then horizontal,** each rounded to 8 bits: pixel
 *    centres aligned, the output sized and centred on the frame's unrounded
 *    extent, the kernel stretched by the reduction, sample phases snapped to
 *    1/64 pixel and the weights in 12-bit fixed point, as libvips' 8-bit
 *    `reducev`/`reduceh` do. The edges extend by copying.
 *
 * libvips' SIMD paths round a little differently, so this is within 2 per
 * channel of sharp rather than exact (`dataset/tests/resample.test.ts` pins
 * the tolerance).
 *
 * **Enlarging, it has no training counterpart**, since training never
 * upsamples: the same Lanczos3 at unit support, deterministic but not
 * libvips' (which enlarges through `vips_affine`).
 *
 * Pure and DOM-free, so it is testable in node. The alpha channel is not
 * resampled: the output is opaque, as camera frames are.
 *
 * @param src  The frame, RGBA.
 * @param size The target size, `inputLayout`'s `size`.
 * @throws If `size` is not a whole, non-empty size, or `src.data` is not
 *         `src`'s RGBA.
 */
export function resample(src: Pixels, size: Frame): Pixels {
  const { width, height } = size;
  if (!(width >= 1 && height >= 1 && Number.isInteger(width) && Number.isInteger(height))) {
    throw new Error(`resample needs a whole, non-empty target size; got ${width}×${height}`);
  }
  if (src.data.length !== src.width * src.height * 4) {
    throw new Error(`resample needs ${src.width}×${src.height} RGBA, ${src.width * src.height * 4} bytes; got ${src.data.length}`);
  }

  // sharp's ResolveShrink for `cover`: the smaller ratio, so the result covers
  // the target on both axes.
  const shrink = Math.min(src.width / width, src.height / height);
  let image: Rgb = toRgb(src);

  if (shrink !== 1) {
    // vips_resize: the integer part goes to a box shrink while at least the
    // gap (2) is left for the filter.
    const box = Math.max(1, Math.floor(shrink / RESIZE_GAP));
    if (box > 1) image = boxShrink(image, box);

    // The filter sizes and centres its output on the frame as the box shrink
    // left it before rounding up: a partial block at the edge does not count
    // as a whole pixel.
    const residual = shrink / box;
    image = reduceV(image, residual, src.height / box);
    image = reduceH(image, residual, src.width / box);
  }

  // sharp's centre crop of the `cover` overhang.
  const left = Math.floor((image.width - width + 1) / 2);
  const top = Math.floor((image.height - height + 1) / 2);
  return crop(image, left, top, width, height);
}

/** The shrink libvips' resize leaves to the filter, at least (`vips_resize`'s `gap`). */
const RESIZE_GAP = 2;
/** Sample positions snap to this many phases per pixel (`VIPS_TRANSFORM_SCALE`). */
const PHASES = 64;
/** Fixed-point bits of an 8-bit reduce's weights (`VIPS_INTERPOLATE_SHIFT`). */
const WEIGHT_SHIFT = 12;
const WEIGHT_ONE = 1 << WEIGHT_SHIFT;
const LANCZOS_A = 3;

/** Packed RGB, 3 bytes per pixel: the working form, without alpha. */
interface Rgb {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

function toRgb(src: Pixels): Rgb {
  const n = src.width * src.height;
  const out = new Uint8Array(n * 3);
  const s = src.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[i * 3] = s[j];
    out[i * 3 + 1] = s[j + 1];
    out[i * 3 + 2] = s[j + 2];
  }
  return { data: out, width: src.width, height: src.height };
}

function crop(image: Rgb, left: number, top: number, width: number, height: number): Pixels {
  const out = new Uint8ClampedArray(width * height * 4);
  const s = image.data;
  for (let y = 0; y < height; y++) {
    let i = ((y + top) * image.width + left) * 3;
    let j = y * width * 4;
    for (let x = 0; x < width; x++, i += 3, j += 4) {
      out[j] = s[i];
      out[j + 1] = s[i + 1];
      out[j + 2] = s[i + 2];
      out[j + 3] = 255;
    }
  }
  return { data: out, width, height };
}

/**
 * `vips_shrink` with `ceil`: the mean of each `k × k` block, vertical first,
 * each pass rounded. A partial block at the right or bottom is filled by
 * repeating the last column or row.
 */
function boxShrink(image: Rgb, k: number): Rgb {
  const { width, height, data } = image;
  const h = Math.ceil(height / k);
  const half = k >> 1;

  const vert = new Uint8Array(width * h * 3);
  const rowBytes = width * 3;
  for (let y = 0; y < h; y++) {
    const out = y * rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      let sum = 0;
      for (let t = 0; t < k; t++) sum += data[Math.min(y * k + t, height - 1) * rowBytes + i];
      vert[out + i] = Math.floor((sum + half) / k);
    }
  }

  const w = Math.ceil(width / k);
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const row = y * rowBytes;
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let t = 0; t < k; t++) sum += vert[row + Math.min(x * k + t, width - 1) * 3 + c];
        out[(y * w + x) * 3 + c] = Math.floor((sum + half) / k);
      }
    }
  }
  return { data: out, width: w, height: h };
}

function lanczos(x: number): number {
  if (x === 0) return 1;
  if (x <= -LANCZOS_A || x >= LANCZOS_A) return 0;
  const px = Math.PI * x;
  return (LANCZOS_A * Math.sin(px) * Math.sin(px / LANCZOS_A)) / (px * px);
}

/**
 * One axis' filter: for each output position, its first input index and its
 * fixed-point weights. Indices past either end clamp to the edge, which is
 * libvips' extend-by-copy.
 */
interface Taps {
  readonly count: number;
  /** Per output, the input index of its first tap (may be negative). */
  readonly first: Int32Array;
  /** Per output, `count` weights summing to `WEIGHT_ONE`. */
  readonly weights: Int32Array;
}

function taps(extent: number, outLength: number, shrink: number): Taps {
  // An enlargement keeps the kernel at its own width; a reduction stretches it.
  const support = Math.max(shrink, 1);
  const count = 2 * Math.round(LANCZOS_A * support) + 1;
  // The window sits one tap right of centred, as libvips' masks do
  // (`n_point / 2 - 1` taps before the sample): the kernel's farthest tap on
  // the left, where it is nearly zero, is dropped.
  const half = (count >> 1) - 1;

  // One mask per phase, as libvips precomputes them.
  const masks: Int32Array[] = [];
  for (let p = 0; p <= PHASES; p++) {
    const frac = p / PHASES;
    const f = new Float64Array(count);
    let sum = 0;
    for (let i = 0; i < count; i++) {
      f[i] = lanczos((i - half - frac) / support);
      sum += f[i];
    }
    masks.push(fixedPoint(f, sum));
  }

  // Pixel centres aligned, and the output centred on the input's extent: the
  // rounding of the output length is split between the two ends.
  const offset = (extent - outLength * shrink) / 2;
  const first = new Int32Array(outLength);
  const weights = new Int32Array(outLength * count);
  for (let x = 0; x < outLength; x++) {
    const centre = (x + 0.5) * shrink - 0.5 + offset;
    let base = Math.floor(centre);
    let phase = Math.round((centre - base) * PHASES);
    if (phase === PHASES) {
      base += 1;
      phase = 0;
    }
    first[x] = base - half;
    weights.set(masks[phase], x * count);
  }
  return { count, first, weights };
}

/** Normalised float weights as fixed point, the rounding error folded into the largest. */
function fixedPoint(f: Float64Array, sum: number): Int32Array {
  const out = new Int32Array(f.length);
  let total = 0;
  let largest = 0;
  for (let i = 0; i < f.length; i++) {
    out[i] = Math.round((f[i] / sum) * WEIGHT_ONE);
    total += out[i];
    if (out[i] > out[largest]) largest = i;
  }
  out[largest] += WEIGHT_ONE - total;
  return out;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * `reducev`: Lanczos3 down the columns, to `rint(extent / shrink)` rows.
 *
 * @param extent The input's height before a box shrink rounded it up.
 */
function reduceV(image: Rgb, shrink: number, extent: number): Rgb {
  const { width, height, data } = image;
  const h = Math.round(extent / shrink);
  const { count, first, weights } = taps(extent, h, shrink);
  const rowBytes = width * 3;
  const out = new Uint8Array(h * rowBytes);
  const rows = new Int32Array(count);
  const acc = new Int32Array(rowBytes);
  const round = WEIGHT_ONE >> 1;

  for (let y = 0; y < h; y++) {
    for (let t = 0; t < count; t++) {
      const r = first[y] + t;
      rows[t] = (r < 0 ? 0 : r >= height ? height - 1 : r) * rowBytes;
    }
    acc.fill(round);
    for (let t = 0; t < count; t++) {
      const w = weights[y * count + t];
      if (w === 0) continue;
      const r = rows[t];
      for (let i = 0; i < rowBytes; i++) acc[i] += w * data[r + i];
    }
    const o = y * rowBytes;
    for (let i = 0; i < rowBytes; i++) out[o + i] = clampByte(acc[i] >> WEIGHT_SHIFT);
  }
  return { data: out, width, height: h };
}

/**
 * `reduceh`: Lanczos3 along the rows, to `rint(extent / shrink)` columns.
 *
 * @param extent The input's width before a box shrink rounded it up.
 */
function reduceH(image: Rgb, shrink: number, extent: number): Rgb {
  const { width, height, data } = image;
  const w = Math.round(extent / shrink);
  const { count, first, weights } = taps(extent, w, shrink);
  const out = new Uint8Array(w * height * 3);
  const round = WEIGHT_ONE >> 1;

  // Column offsets per output and tap, clamped once rather than per row.
  const cols = new Int32Array(w * count);
  for (let x = 0; x < w; x++) {
    for (let t = 0; t < count; t++) {
      const c = first[x] + t;
      cols[x * count + t] = (c < 0 ? 0 : c >= width ? width - 1 : c) * 3;
    }
  }

  for (let y = 0; y < height; y++) {
    const row = y * width * 3;
    const o = y * w * 3;
    for (let x = 0; x < w; x++) {
      let r = round;
      let g = round;
      let b = round;
      const k = x * count;
      for (let t = 0; t < count; t++) {
        const wt = weights[k + t];
        const i = row + cols[k + t];
        r += wt * data[i];
        g += wt * data[i + 1];
        b += wt * data[i + 2];
      }
      out[o + x * 3] = clampByte(r >> WEIGHT_SHIFT);
      out[o + x * 3 + 1] = clampByte(g >> WEIGHT_SHIFT);
      out[o + x * 3 + 2] = clampByte(b >> WEIGHT_SHIFT);
    }
  }
  return { data: out, width: w, height };
}
