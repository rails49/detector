import type { InputLayout, Tile } from './tiles.ts';
import type { Frame } from './types.ts';

/**
 * The coordinate change from one input tile back to the frame `detect`
 * answers in, kept apart from the ORT session so it is testable without a
 * model.
 *
 * Nothing outside this package sees it. That is the point of `detect` taking
 * a report frame: the target DPT, the tiles, the padding and the source's own
 * pixel count all stay inside, so a re-export at another canvas or target DPT
 * changes nothing a caller can observe.
 *
 * Tile px → resampled frame: add the tile's origin. Resampled frame → report
 * frame: scale by however far the report frame is from the resampled size.
 * Two factors rather than one because the report frame need not have the
 * source's aspect — `camera.resolution` is what sensors and calibration are
 * authored in, and the captured video may be a different pixel count and, on
 * a device that ignores the requested aspect, a different shape. When they do
 * share an aspect (the ordinary case) `kx` and `ky` are equal and the map is a
 * similarity, which is what makes an angle and a length meaningful after it.
 *
 * The factors are taken against the *rounded* resampled size, which is what
 * was actually drawn, rather than against `layout.scale`.
 */
export interface TileToReport {
  readonly kx: number;
  readonly ky: number;
  /** The tile's origin in the resampled frame. */
  readonly originX: number;
  readonly originY: number;
}

export function tileToReport(layout: InputLayout, tile: Tile, report: Frame): TileToReport {
  return {
    kx: report.width / layout.size.width,
    ky: report.height / layout.size.height,
    originX: tile.x,
    originY: tile.y,
  };
}

/** A tile-space point, in the report frame. */
export function mapPoint(map: TileToReport, x: number, y: number): { x: number; y: number } {
  return { x: (x + map.originX) * map.kx, y: (y + map.originY) * map.ky };
}

/**
 * A tile-space *vector*, in the report frame — the same map without the
 * translation, since a difference of two points loses the origin.
 */
export function mapVector(map: TileToReport, x: number, y: number): { x: number; y: number } {
  return { x: x * map.kx, y: y * map.ky };
}
