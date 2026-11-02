import { tileOrigins } from '@rails49/detector';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Tile {
  x: number;
  y: number;
}

/** Tile starts along one axis of [`start`, `end`); a span shorter than a tile gets one centred tile inside [0, `limit`). */
function positions(start: number, end: number, side: number, overlap: number, limit: number): number[] {
  if (end - start <= side) {
    const centred = Math.round((start + end - side) / 2);
    return [Math.max(0, Math.min(limit - side, centred))];
  }
  return tileOrigins(end - start, overlap, side).map((x) => start + x);
}

/** Square tiles of `side` over `area`, row by row, each inside a frame `width` × `height`. */
export function tileGrid(area: Box, side: number, overlap: number, width: number, height: number): Tile[] {
  const xs = positions(area.x0, area.x1, side, overlap, width);
  const ys = positions(area.y0, area.y1, side, overlap, height);
  return ys.flatMap((y) => xs.map((x) => ({ x, y })));
}
