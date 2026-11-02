import { DETECTOR_CANVAS, DETECTOR_DPT, DETECTOR_TILE_OVERLAP_MM, STANDARD_GAUGE } from './generated.ts';
import type { Frame } from './types.ts';

/** The overlap between neighbouring tiles, in pixels at `dpt`. */
export function tileOverlapPx(dpt: number): number {
  return (dpt * DETECTOR_TILE_OVERLAP_MM) / STANDARD_GAUGE;
}

/**
 * The start of each tile along one axis of a frame `length` pixels long.
 *
 * The first tile starts at 0 and the last ends at `length`, so every tile is
 * whole; the rest are spaced evenly between them, as few as keep each overlap
 * at least `overlapPx`. A frame no longer than the canvas is one tile at 0,
 * padded to the canvas.
 */
export function tileOrigins(length: number, overlapPx: number, canvas: number = DETECTOR_CANVAS): number[] {
  if (length <= canvas) return [0];
  const count = Math.ceil((length - overlapPx) / (canvas - overlapPx));
  return Array.from({ length: count }, (_, i) => Math.round((i * (length - canvas)) / (count - 1)));
}

/** One canvas-sized piece of a resampled frame, in that frame's pixels. */
export interface Tile {
  /** The tile's top-left corner. */
  readonly x: number;
  readonly y: number;
  /**
   * The frame pixels the tile holds: the canvas, or less where the frame ends
   * first and the rest of the canvas is padding on the right or bottom.
   */
  readonly width: number;
  readonly height: number;
}

/** How a frame becomes detector input: resampled to the target DPT, then cut into tiles. */
export interface InputLayout {
  /** Frame → resampled frame, `targetDpt / dpt`. Above 1 is an upsample. */
  readonly scale: number;
  /** The resampled frame, the frame's size times `scale`, rounded to whole pixels. */
  readonly size: Frame;
  /** Row by row, top to bottom, and left to right within a row. */
  readonly tiles: readonly Tile[];
}

/**
 * The input layout of a frame at `dpt`: the scale to the target DPT, the
 * resampled size, and where its tiles are cut.
 *
 * Pure, and the one place this is computed, so the export's training tiles and
 * `detect`'s input tiles cannot disagree (ADR 0014). It scales in both
 * directions; refusing to upsample is the export's rule, not the layout's.
 *
 * @param frame     The frame's own pixel count.
 * @param dpt       The frame's DPT.
 * @param targetDpt The DPT to resample to. Defaults to `DETECTOR_DPT`.
 */
export function inputLayout(frame: Frame, dpt: number, targetDpt: number = DETECTOR_DPT): InputLayout {
  const scale = targetDpt / dpt;
  const size = { width: Math.round(frame.width * scale), height: Math.round(frame.height * scale) };
  const overlapPx = tileOverlapPx(targetDpt);

  const tiles: Tile[] = [];
  for (const y of tileOrigins(size.height, overlapPx)) {
    for (const x of tileOrigins(size.width, overlapPx)) {
      tiles.push({
        x,
        y,
        width: Math.min(DETECTOR_CANVAS, size.width - x),
        height: Math.min(DETECTOR_CANVAS, size.height - y),
      });
    }
  }

  return { scale, size, tiles };
}
