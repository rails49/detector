import { describe, expect, it } from 'vitest';
import { tileGrid } from '../src/tiles.js';

// The layout box and overlap export_bench.py writes for ceiling-2026-10-28 at DPT 16.
const layout = { x0: 55, y0: 782, x1: 3767, y1: 2699 };
const overlap = 334;

describe('tileGrid', () => {
  it('covers the 2×1 m layout with two 2048 tiles', () => {
    expect(tileGrid(layout, 2048, overlap, 3958, 2968)).toEqual([
      { x: 55, y: 717 },
      { x: 1719, y: 717 },
    ]);
  });

  it('covers it with fifteen 1024 tiles, overlapping by at least the overlap', () => {
    const tiles = tileGrid(layout, 1024, overlap, 3958, 2968);
    expect(tiles).toHaveLength(15);
    const xs = [...new Set(tiles.map((t) => t.x))];
    expect(xs[0]).toBe(layout.x0);
    expect(xs[xs.length - 1] + 1024).toBe(layout.x1);
    for (let i = 1; i < xs.length; i++) expect(xs[i - 1] + 1024 - xs[i]).toBeGreaterThanOrEqual(overlap);
  });

  it('keeps a tile larger than the area inside the frame', () => {
    expect(tileGrid({ x0: 0, y0: 0, x1: 100, y1: 100 }, 2048, overlap, 3958, 2968)).toEqual([{ x: 0, y: 0 }]);
  });
});
