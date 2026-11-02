import { DETECTOR_CANVAS } from './generated.ts';
import type { Tile } from './tiles.ts';
import type { Frame } from './types.ts';

/**
 * Ultralytics' letterbox fill, which `export:yolo` pads every training tile
 * with. The model was trained on padding this colour.
 */
export const PAD_GRAY = 'rgb(114, 114, 114)';

/**
 * The 2D context, narrowed to what painting the input touches.
 *
 * Structural rather than `CanvasRenderingContext2D` so this is testable: no
 * test environment in this repo can execute `drawImage` and read the pixels
 * back — `lib/*` run in bare node, and `@web/test-runner` was removed
 * deliberately (rails49/occupancy#109). What a fake can still pin is that the
 * context is *configured* as intended and paints in the right place, which is
 * exactly the bug this module exists for (rails49/occupancy#132). It does not
 * pin the resulting pixels; nothing here can.
 */
export interface PaintTarget {
  fillStyle: string | CanvasGradient | CanvasPattern;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  fillRect(x: number, y: number, width: number, height: number): void;
  drawImage(
    source: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
}

/**
 * Resample `source` to the target DPT: the whole frame, drawn at the layout's
 * resampled size, down or up.
 *
 * **The filter is requested here, and that is the point of the function**
 * (rails49/occupancy#132). Left unset, `drawImage` resamples with whatever the
 * user agent picks, so the app disagrees with its own training data *and* two
 * deployed devices disagree with each other. rails49/occupancy#112 measured the
 * size of that: 36% recall against 31%, identical frames, identical weights.
 *
 * `'high'` because training resamples with `sharp`'s default, a Lanczos
 * filter, and `'high'` is the user agent's best filter. It is a hint the user
 * agent may implement however it likes, so it does not *guarantee* any filter;
 * pinning one across user agents means resampling ourselves, which is #7.
 *
 * Set on every call rather than once at construction because **sizing a canvas
 * resets its 2D context state**, and the resampled canvas is resized whenever
 * the frame's size or DPT changes.
 *
 * @param frame The source's own pixel count.
 * @param size  The resampled size, `inputLayout`'s `size`. The context's
 *              canvas must be at least this large.
 */
export function paintResampled(ctx: PaintTarget, source: CanvasImageSource, frame: Frame, size: Frame): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, frame.width, frame.height, 0, 0, size.width, size.height);
}

/**
 * Paint one tile of the resampled frame onto the canvas: the padding fill
 * first, then the tile's pixels copied 1:1 into the top-left corner, so a
 * tile smaller than the canvas is padded on the right and bottom exactly as
 * `export:yolo` pads it (ADR 0014: padded, never resized).
 *
 * @param resampled The canvas `paintResampled` drew into.
 * @param tile      One of `inputLayout`'s tiles.
 */
export function paintTile(ctx: PaintTarget, resampled: CanvasImageSource, tile: Tile): void {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = PAD_GRAY;
  ctx.fillRect(0, 0, DETECTOR_CANVAS, DETECTOR_CANVAS);
  ctx.drawImage(resampled, tile.x, tile.y, tile.width, tile.height, 0, 0, tile.width, tile.height);
}
