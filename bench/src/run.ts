import type { DetectorFrame } from './summary.js';
import type { Tile } from './tiles.js';

export interface FrameDetector<F> {
  run(frame: F, tiles: Tile[]): Promise<DetectorFrame>;
}

/** Runs `detector` over `frames` in turn until `endAt` (a `performance.now()` time) or until `going()` is false. */
export async function runUntil<F>(
  detector: FrameDetector<F>,
  frames: F[],
  tiles: Tile[],
  endAt: number,
  going: () => boolean,
  onFrame: (frame: DetectorFrame, count: number) => void,
): Promise<DetectorFrame[]> {
  const done: DetectorFrame[] = [];
  while (going() && performance.now() < endAt) {
    const frame = await detector.run(frames[done.length % frames.length], tiles);
    done.push(frame);
    onFrame(frame, done.length);
  }
  return done;
}
