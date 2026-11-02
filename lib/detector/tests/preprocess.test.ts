import { describe, expect, it } from 'vitest';
import { DETECTOR_CANVAS } from '../src/generated.ts';
import { PAD_GRAY, paintResampled, paintTile, type PaintTarget } from '../src/preprocess.ts';

/**
 * Painting the input, driven by a fake context.
 *
 * What this can pin is that the context is *configured* as intended — the
 * resampling filter above all (rails49/occupancy#132) — and that the paint
 * happens in the right order at the right place. What it cannot pin is the
 * resulting pixels: no test environment here executes `drawImage` and reads
 * them back (`lib/*` is bare node, `@web/test-runner` went in
 * rails49/occupancy#109). That gap is open on #7 and no fake closes it.
 */

/** One recorded paint operation, with the context state it ran under. */
interface Op {
  readonly name: 'fillRect' | 'drawImage';
  readonly args: readonly unknown[];
  readonly fillStyle: string | CanvasGradient | CanvasPattern;
  readonly smoothingEnabled: boolean;
  readonly smoothingQuality: ImageSmoothingQuality;
}

/**
 * A context that records rather than paints.
 *
 * State is snapshotted *per operation* rather than read at the end, because the
 * bug being guarded is an ordering one: a filter set after the draw is a filter
 * that did nothing.
 */
class Recorder implements PaintTarget {
  fillStyle: string | CanvasGradient | CanvasPattern = '';
  // Deliberately *not* the values under test, so "assigned" is told from
  // "already there".
  imageSmoothingEnabled = false;
  imageSmoothingQuality: ImageSmoothingQuality = 'low';
  readonly ops: Op[] = [];

  fillRect(...args: number[]): void {
    this.#record('fillRect', args);
  }

  drawImage(...args: unknown[]): void {
    this.#record('drawImage', args);
  }

  #record(name: Op['name'], args: readonly unknown[]): void {
    this.ops.push({
      name,
      args,
      fillStyle: this.fillStyle,
      smoothingEnabled: this.imageSmoothingEnabled,
      smoothingQuality: this.imageSmoothingQuality,
    });
  }
}

/** Stand-ins for the pictures: the painters only hand them to `drawImage`. */
const SOURCE = {} as CanvasImageSource;
const RESAMPLED = {} as CanvasImageSource;

describe('the resample', () => {
  it('requests the high-quality filter, whatever the context arrived holding', () => {
    const ctx = new Recorder();
    paintResampled(ctx, SOURCE, { width: 4440, height: 2130 }, { width: 2220, height: 1065 });

    expect(ctx.ops).toHaveLength(1);
    expect(ctx.ops[0].smoothingEnabled).toBe(true);
    expect(ctx.ops[0].smoothingQuality).toBe('high');
  });

  it('re-requests it on every call, because sizing a canvas resets the context', () => {
    const ctx = new Recorder();
    paintResampled(ctx, SOURCE, { width: 1920, height: 1080 }, { width: 1600, height: 900 });
    ctx.imageSmoothingEnabled = false;
    ctx.imageSmoothingQuality = 'low';
    paintResampled(ctx, SOURCE, { width: 1920, height: 1080 }, { width: 1600, height: 900 });

    expect(ctx.ops[1].smoothingEnabled).toBe(true);
    expect(ctx.ops[1].smoothingQuality).toBe('high');
  });

  it('draws the whole source at the resampled size, up or down', () => {
    const ctx = new Recorder();
    paintResampled(ctx, SOURCE, { width: 1000, height: 600 }, { width: 1600, height: 960 });

    expect(ctx.ops[0].args).toEqual([SOURCE, 0, 0, 1000, 600, 0, 0, 1600, 960]);
  });
});

describe('a tile', () => {
  it('lays the trained pad colour over the whole canvas first, then the tile over it', () => {
    const ctx = new Recorder();
    paintTile(ctx, RESAMPLED, { x: 0, y: 0, width: 1500, height: 750 });

    expect(ctx.ops.map((op) => op.name)).toEqual(['fillRect', 'drawImage']);
    expect(ctx.ops[0].fillStyle).toBe(PAD_GRAY);
    expect(ctx.ops[0].args).toEqual([0, 0, DETECTOR_CANVAS, DETECTOR_CANVAS]);
  });

  it('copies its pixels 1:1 into the top-left corner, padded right and bottom, never resized', () => {
    const ctx = new Recorder();
    paintTile(ctx, RESAMPLED, { x: 952, y: 0, width: DETECTOR_CANVAS, height: 500 });

    expect(ctx.ops[1].args).toEqual([RESAMPLED, 952, 0, DETECTOR_CANVAS, 500, 0, 0, DETECTOR_CANVAS, 500]);
    expect(ctx.ops[1].smoothingEnabled).toBe(false);
  });
});
