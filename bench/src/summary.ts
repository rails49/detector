import { spread, type Spread } from './stats.js';

/** One pass of the detector over every tile of a frame, times from `performance.now()`. */
export interface DetectorFrame {
  start: number;
  end: number;
  prepMs: number[];
  inferMs: number[];
  boxes: number;
}

export interface DetectorRun {
  device: string;
  userAgent: string;
  cores: number;
  isolated: boolean;
  webgpu: boolean;
  model: string;
  precision: string;
  runtime: string;
  threads: number;
  side: number;
  tiles: number;
  dpt: number;
  loadMs: number;
  warmupMs: number;
  frames: DetectorFrame[];
}

export interface CameraRun {
  requested: string;
  settings: MediaTrackSettings;
  capabilities: MediaTrackCapabilities;
  load: string;
  intervalsMs: number[];
  dropped: number;
  drawMs: number[];
  readMs: number[];
}

const WINDOW_S = 300;

/** Frames started in each 5-minute window, as a rate in Hz; the last, partial window is left out. */
export function windowRates(frames: DetectorFrame[]): number[] {
  if (frames.length === 0) return [];
  const t0 = frames[0].start;
  const windows = Math.floor((frames[frames.length - 1].end - t0) / 1000 / WINDOW_S);
  const counts = new Array<number>(windows).fill(0);
  for (const frame of frames) {
    const w = Math.floor((frame.start - t0) / 1000 / WINDOW_S);
    if (w < windows) counts[w]++;
  }
  return counts.map((n) => n / WINDOW_S);
}

const ms = (s: Spread) => `median ${s.median.toFixed(0)}, p95 ${s.p95.toFixed(0)}, max ${s.max.toFixed(0)}`;

export function summaryText(run: DetectorRun, camera: CameraRun | undefined, now: Date): string {
  const frames = run.frames;
  const seconds = frames.length ? (frames[frames.length - 1].end - frames[0].start) / 1000 : 0;
  const lines = [
    `rails49/detector#42 Safari test, ${now.toISOString()}`,
    `device: ${run.device || 'unnamed'} | ${run.userAgent}`,
    `cores ${run.cores} | crossOriginIsolated ${run.isolated ? 'yes' : 'no'} | navigator.gpu ${run.webgpu ? 'yes' : 'no'}`,
    `detector: ${run.model} ${run.precision}, ${run.runtime}, threads ${run.threads || 'default'}, ${run.tiles} tiles of ${run.side} at DPT ${run.dpt}`,
    `run: ${seconds.toFixed(0)} s, ${frames.length} frames, model load ${run.loadMs.toFixed(0)} ms, first frame ${run.warmupMs.toFixed(0)} ms`,
    `latency ms: ${ms(spread(frames.map((f) => f.end - f.start)))}`,
    `rate: ${seconds ? (frames.length / seconds).toFixed(3) : '-'} Hz; per 5 min: ${windowRates(frames).map((r) => r.toFixed(3)).join(' ') || '-'}`,
    `ms per tile, inference: ${ms(spread(frames.flatMap((f) => f.inferMs)))}`,
    `ms per tile, preparation: ${ms(spread(frames.flatMap((f) => f.prepMs)))}`,
    `boxes per frame: median ${spread(frames.map((f) => f.boxes)).median}`,
  ];
  if (camera) {
    const s = camera.settings;
    const c = camera.capabilities;
    const interval = spread(camera.intervalsMs);
    lines.push(
      `camera: asked ${camera.requested}, got ${s.width}×${s.height} at ${s.frameRate} fps; capabilities width ≤ ${c.width?.max}, height ≤ ${c.height?.max}, fps ≤ ${c.frameRate?.max}`,
      `camera frames: ${(1000 / interval.median).toFixed(1)} Hz, interval ms ${ms(interval)}, ${camera.dropped} dropped`,
      `camera load ${camera.load}: draw ms ${ms(spread(camera.drawMs))}; read ms ${ms(spread(camera.readMs))}`,
    );
  } else {
    lines.push('camera: off');
  }
  return lines.join('\n');
}
