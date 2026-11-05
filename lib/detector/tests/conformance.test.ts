import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { decodeDetections } from '../src/decode.ts';
import { carWidthPx } from '../src/geometry.ts';
import { tileInput } from '../src/preprocess.ts';
import { tileToReport } from '../src/report.ts';
import { resample, type Pixels } from '../src/resample.ts';
import { inputLayout, type Tile } from '../src/tiles.ts';
import type { Detection, Frame } from '../src/types.ts';

/**
 * The cases `lib/detector-py/tests/test_conformance.py` reads too. They state
 * their own configuration, `conformance/model.json`, which stands in for the
 * generated constants.
 */

vi.mock('../src/generated.ts', async () => {
  const { readFileSync } = await import('node:fs');
  const config = JSON.parse(readFileSync(new URL('../../../conformance/model.json', import.meta.url), 'utf8'));
  return {
    DETECTOR_CANVAS: config.canvas,
    DETECTOR_DPT: config.dpt,
    DETECTOR_TILE_OVERLAP_MM: config.tile_overlap_mm,
    DETECTOR_CONFIDENCE_THRESHOLD: config.confidence_threshold,
    DETECTOR_NMS_IOU: config.nms_iou,
    DETECTOR_CLASSES: config.classes,
    STANDARD_WIDTH: config.standard_width,
    STANDARD_GAUGE: config.standard_gauge,
    MIN_DPT: 20,
  };
});

function cases<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../../../conformance/${name}.json`, import.meta.url), 'utf8')) as T;
}

interface RgbFrame extends Frame {
  readonly rgb: string;
}

const config = cases<{ canvas: number; confidence_threshold: number }>('model');

function pixels({ rgb, width, height }: RgbFrame): Pixels {
  const packed = Buffer.from(rgb, 'base64');
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set([packed[i * 3], packed[i * 3 + 1], packed[i * 3 + 2], 255], i * 4);
  }
  return { data, width, height };
}

const layoutCases = cases<{
  tolerance: number;
  cases: {
    name: string;
    frame: Frame;
    dpt: number;
    scale: number;
    size: Frame;
    tiles: Tile[];
  }[];
  car_width: { dpt: number; px: number }[];
}>('layout');

describe('the input layout', () => {
  it.each(layoutCases.cases)('$name', c => {
    const actual = inputLayout(c.frame, c.dpt);
    expect(Math.abs(actual.scale - c.scale)).toBeLessThanOrEqual(layoutCases.tolerance);
    expect(actual.size).toEqual(c.size);
    expect(actual.tiles).toEqual(c.tiles);
  });

  it.each(layoutCases.car_width)('car width at DPT $dpt', c => {
    expect(Math.abs(carWidthPx(c.dpt) - c.px)).toBeLessThanOrEqual(layoutCases.tolerance);
  });
});

const tileCases = cases<{
  tolerance: number;
  resampled: RgbFrame;
  cases: { name: string; tile: Tile; planar: string }[];
}>('tile_input');

describe('a tile as the input', () => {
  it.each(tileCases.cases)('$name', c => {
    const planar = new Float32Array(3 * config.canvas * config.canvas);
    tileInput(pixels(tileCases.resampled), c.tile, planar);
    const expected = Buffer.from(c.planar, 'base64');
    expect(expected.length).toBe(planar.length);
    let worst = 0;
    planar.forEach((value, i) => {
      worst = Math.max(worst, Math.abs(value - expected[i] / 255));
    });
    expect(worst).toBeLessThanOrEqual(tileCases.tolerance);
  });
});

interface DecodeCase {
  name: string;
  frame: Frame;
  dpt: number;
  threshold?: number;
  tiles: { index?: number; slots?: number; rows?: number[][]; dims?: number[] }[];
  expected?: Detection[];
  error?: string;
}

const decodeCases = cases<{ tolerance: number; cases: DecodeCase[] }>('decode');

function runDecode(c: DecodeCase): Detection[] {
  const frameLayout = inputLayout(c.frame, c.dpt);
  const outputs = c.tiles.map(t => {
    const rows = t.rows ?? [];
    const dims = t.dims ?? [1, t.slots ?? rows.length, 7];
    const data = new Float32Array(dims.reduce((a, b) => a * b, 1));
    rows.forEach((row, i) => data.set(row, i * 7));
    return { data, dims, map: tileToReport(frameLayout, frameLayout.tiles[t.index ?? 0]!, c.frame) };
  });
  return decodeDetections(outputs, c.threshold ?? config.confidence_threshold);
}

describe('decoding and duplicate removal', () => {
  it.each(decodeCases.cases.filter(c => !c.error))('$name', c => {
    const actual = runDecode(c);
    expect(actual).toHaveLength(c.expected!.length);
    actual.forEach((got, i) => {
      const want = c.expected![i]!;
      expect(got.class).toBe(want.class);
      for (const [a, b] of [
        [got.centre.x, want.centre.x],
        [got.centre.y, want.centre.y],
        [got.length, want.length],
        [got.width, want.width],
        [got.angle, want.angle],
        [got.confidence, want.confidence],
      ]) {
        expect(Math.abs(a! - b!)).toBeLessThanOrEqual(decodeCases.tolerance);
      }
    });
  });

  it.each(decodeCases.cases.filter(c => c.error))('$name', c => {
    expect(() => runDecode(c)).toThrow(new RegExp(c.error!));
  });
});

const resampling = cases<{
  tolerance: number;
  source: RgbFrame;
  cases: { name: string; size: Frame; rgb: string }[];
}>('resample');

describe('the resample against sharp', () => {
  it.each(resampling.cases)('$name', c => {
    const actual = resample(pixels(resampling.source), c.size);
    const expected = Buffer.from(c.rgb, 'base64');
    let worst = 0;
    for (let i = 0; i < c.size.width * c.size.height; i++) {
      for (let channel = 0; channel < 3; channel++) {
        worst = Math.max(worst, Math.abs(actual.data[i * 4 + channel] - expected[i * 3 + channel]));
      }
    }
    expect(worst).toBeLessThanOrEqual(resampling.tolerance);
  });
});
