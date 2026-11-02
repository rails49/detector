import { describe, expect, it } from 'vitest';
import { carWidthPx } from '../src/geometry.ts';
import { DETECTOR_CANVAS, DETECTOR_DPT } from '../src/generated.ts';
import { inputLayout, tileOrigins, tileOverlapPx } from '../src/tiles.ts';

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

describe('the input layout', () => {
  it('keeps a frame already at the target DPT at its own size', () => {
    const layout = inputLayout({ width: 1920, height: 1080 }, DETECTOR_DPT);
    expect(layout.scale).toBe(1);
    expect(layout.size).toEqual({ width: 1920, height: 1080 });
  });

  it('scales a frame above the target DPT down', () => {
    const layout = inputLayout({ width: 1920, height: 1080 }, 2 * DETECTOR_DPT);
    expect(layout.scale).toBe(0.5);
    expect(layout.size).toEqual({ width: 960, height: 540 });
  });

  it('scales a frame below the target DPT up, never refusing it', () => {
    const layout = inputLayout({ width: 1000, height: 600 }, 10, 16);
    expect(layout.scale).toBeCloseTo(1.6, 12);
    expect(layout.size).toEqual({ width: 1600, height: 960 });
  });

  it('rounds the resampled size to whole pixels', () => {
    const layout = inputLayout({ width: 1920, height: 1080 }, 18.5, 16);
    expect(layout.size).toEqual({ width: Math.round((1920 * 16) / 18.5), height: Math.round((1080 * 16) / 18.5) });
  });

  it('is one tile at 0 when the resampled frame fits the canvas', () => {
    const layout = inputLayout({ width: 3000, height: 1500 }, 32, 16);
    expect(layout.size).toEqual({ width: 1500, height: 750 });
    expect(layout.tiles).toEqual([{ x: 0, y: 0, width: 1500, height: 750 }]);
  });

  it('cuts a larger frame at the origins tileOrigins gives, row by row', () => {
    const frame = { width: 4440, height: 2130 };
    const layout = inputLayout(frame, 20, 20);
    const overlap = tileOverlapPx(20);
    const xs = tileOrigins(4440, overlap);
    const ys = tileOrigins(2130, overlap);
    expect(xs.length).toBeGreaterThan(1);
    expect(ys.length).toBeGreaterThan(1);

    expect(layout.tiles.map(({ x, y }) => [x, y])).toEqual(ys.flatMap(y => xs.map(x => [x, y])));
    for (const tile of layout.tiles) {
      expect(tile.width).toBe(Math.min(DETECTOR_CANVAS, frame.width - tile.x));
      expect(tile.height).toBe(Math.min(DETECTOR_CANVAS, frame.height - tile.y));
    }
  });

  it('overlaps tiles by the overlap at the target DPT, not the frame\'s', () => {
    // 8128 px at DPT 32 is 4064 at 16: the overlap that decides the count is
    // tileOverlapPx(16), measured in the resampled frame.
    const layout = inputLayout({ width: 8128, height: 100 }, 32, 16);
    expect(layout.tiles.map(t => t.x)).toEqual(tileOrigins(4064, tileOverlapPx(16)));
  });
});
