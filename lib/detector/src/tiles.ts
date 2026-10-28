import { DETECTOR_CANVAS, DETECTOR_TILE_OVERLAP_MM, STANDARD_GAUGE } from './generated.ts';

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
