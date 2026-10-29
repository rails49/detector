import { describe, expect, it } from 'vitest';
import { carWidthPx } from '../src/geometry.ts';
import { tileOrigins, tileOverlapPx } from '../src/tiles.ts';

describe('tile overlap', () => {
  it('scales with DPT like car width does', () => {
    expect(tileOverlapPx(20) / tileOverlapPx(10)).toBeCloseTo(2, 10);
    expect(tileOverlapPx(32.6) / carWidthPx(32.6)).toBeCloseTo(30000 / 3000, 10);
  });
});

describe('tile origins', () => {
  it('is one tile at 0 when the frame fits the canvas', () => {
    expect(tileOrigins(2048, 600, 2048)).toEqual([0]);
    expect(tileOrigins(1000, 600, 2048)).toEqual([0]);
  });

  it('starts at 0, ends at the frame edge, and overlaps by at least the overlap', () => {
    const origins = tileOrigins(8064, 682, 2048);
    expect(origins).toEqual([0, 1203, 2406, 3610, 4813, 6016]);
    for (let i = 1; i < origins.length; i++) {
      expect(origins[i - 1]! + 2048 - origins[i]!).toBeGreaterThanOrEqual(682);
    }
  });

  it('uses as few tiles as the overlap allows', () => {
    // Two tiles of 2048 overlapping by 682 cover 3414; one pixel more needs a third.
    expect(tileOrigins(3414, 682, 2048)).toHaveLength(2);
    expect(tileOrigins(3415, 682, 2048)).toHaveLength(3);
  });
});
