import { describe, expect, it } from 'vitest';
import { summaryText, windowRates, type DetectorFrame, type DetectorRun } from '../src/summary.js';

/** `count` frames of `periodMs`, back to back from t = 0. */
function frames(count: number, periodMs: number): DetectorFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    start: i * periodMs,
    end: (i + 1) * periodMs,
    prepMs: [10, 10],
    inferMs: [400, 600],
    boxes: 20,
  }));
}

const run: DetectorRun = {
  device: 'iPhone 16 Pro Max',
  userAgent: 'Safari',
  cores: 6,
  isolated: true,
  webgpu: false,
  model: 'n16',
  precision: 'fp32',
  runtime: 'wasm',
  threads: 0,
  side: 2048,
  tiles: 2,
  dpt: 16,
  loadMs: 500,
  warmupMs: 1500,
  frames: frames(4, 1000),
};

describe('windowRates', () => {
  it('gives the rate in each whole 5-minute window', () => {
    // 2 Hz for 11 minutes: two whole windows, the partial third left out.
    expect(windowRates(frames(1320, 500))).toEqual([2, 2]);
  });

  it('is empty for a run shorter than a window', () => {
    expect(windowRates(frames(10, 1000))).toEqual([]);
  });
});

describe('summaryText', () => {
  it('reports latency, rate and ms per tile', () => {
    const text = summaryText(run, undefined, new Date('2026-11-02T00:00:00Z'));
    expect(text).toContain('detector: n16 fp32, wasm, threads default, 2 tiles of 2048 at DPT 16');
    expect(text).toContain('latency ms: median 1000, p95 1000, max 1000');
    expect(text).toContain('rate: 1.000 Hz');
    expect(text).toContain('ms per tile, inference: median 400, p95 600, max 600');
    expect(text).toContain('camera: off');
  });
});
