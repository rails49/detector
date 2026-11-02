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

/** Start positions of tiles of `side` covering [`start`, `end`), overlapping by at least `overlap`. */
function positions(start: number, end: number, side: number, overlap: number, limit: number): number[] {
  const length = end - start;
  if (length <= side) {
    const centred = Math.round(start + (length - side) / 2);
    return [Math.max(0, Math.min(limit - side, centred))];
  }
  const count = Math.ceil((length - overlap) / (side - overlap));
  return Array.from({ length: count }, (_, i) => start + Math.round((i * (length - side)) / (count - 1)));
}

/** Square tiles of `side` over `area`, row by row, each inside a frame `width` × `height`. */
export function tileGrid(area: Box, side: number, overlap: number, width: number, height: number): Tile[] {
  const xs = positions(area.x0, area.x1, side, overlap, width);
  const ys = positions(area.y0, area.y1, side, overlap, height);
  return ys.flatMap((y) => xs.map((x) => ({ x, y })));
}
