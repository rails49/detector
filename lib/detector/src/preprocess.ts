import { DETECTOR_CANVAS } from './generated.ts';
import type { Pixels } from './resample.ts';
import type { Tile } from './tiles.ts';

/**
 * Ultralytics' letterbox fill, which `export:yolo` pads every training tile
 * with, per channel. The model was trained on padding this grey.
 */
export const PAD_LEVEL = 114;

/**
 * The 2D context, narrowed to what copying a frame touches.
 *
 * Structural rather than `CanvasRenderingContext2D` so a fake can pin the one
 * thing that matters here: the frame is copied **unscaled**, at its own pixel
 * count, and no filter is asked for. The resample is `resample`'s, in our own
 * code (#7), because `imageSmoothingQuality` is a hint each user agent
 * implements as it likes, and two devices fed the model different pixels from
 * the same frame (rails49/occupancy#112).
 */
export interface PaintTarget {
  drawImage(source: CanvasImageSource, dx: number, dy: number): void;
}

/**
 * Copy `source` onto the context's canvas at its own size, top-left. The
 * canvas must be the source's size: `drawImage` with no destination size
 * draws at the source's intrinsic size, so nothing is scaled and the smoothing
 * settings are never consulted.
 */
export function paintFrame(ctx: PaintTarget, source: CanvasImageSource): void {
  ctx.drawImage(source, 0, 0);
}

/**
 * One tile of the resampled frame as the network's input: RGB, planar, scaled
 * to `0…1`, the tile's pixels in the top-left corner and the rest of the
 * canvas padding, so a tile smaller than the canvas is padded on the right and
 * bottom exactly as `export:yolo` pads it (ADR 0014: padded, never resized).
 *
 * No mean/std normalization — Ultralytics bakes that into the graph, and
 * `export_onnx.py`'s calibration reader feeds it the same plain division.
 *
 * @param resampled The frame at the target DPT, `resample`'s output.
 * @param tile      One of `inputLayout`'s tiles.
 * @param planar    Where to write, `3 × DETECTOR_CANVAS²` long; reused across
 *                  tiles so a live view does not allocate per frame.
 */
export function tileInput(resampled: Pixels, tile: Tile, planar: Float32Array): void {
  const area = DETECTOR_CANVAS * DETECTOR_CANVAS;
  if (planar.length !== 3 * area) {
    throw new Error(`the input tensor needs 3 × ${DETECTOR_CANVAS}² floats; got ${planar.length}`);
  }
  planar.fill(PAD_LEVEL / 255);

  const { data, width } = resampled;
  for (let y = 0; y < tile.height; y++) {
    let i = ((tile.y + y) * width + tile.x) * 4;
    let o = y * DETECTOR_CANVAS;
    for (let x = 0; x < tile.width; x++, i += 4, o++) {
      planar[o] = data[i] / 255;
      planar[o + area] = data[i + 1] / 255;
      planar[o + 2 * area] = data[i + 2] / 255;
    }
  }
}
