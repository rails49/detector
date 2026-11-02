import type { DetectorFrame } from './summary.js';
import type { Tile } from './tiles.js';

export interface FrameDetector<F> {
  run(frame: F, tiles: Tile[]): Promise<DetectorFrame>;
}

/** Runs `detector` on `frame` until `endAt` (a `performance.now()` time) or until `going()` is false. */
export async function runUntil<F>(
  detector: FrameDetector<F>,
  frame: F,
  tiles: Tile[],
  endAt: number,
  going: () => boolean,
  onFrame: (frame: DetectorFrame, count: number) => void,
): Promise<DetectorFrame[]> {
  const done: DetectorFrame[] = [];
  while (going() && performance.now() < endAt) {
    const result = await detector.run(frame, tiles);
    done.push(result);
    onFrame(result, done.length);
  }
  return done;
}
