import { describe, expect, it } from 'vitest';
import { runUntil, type FrameDetector } from '../src/run.js';

/** Records which frame each call got, and returns an empty result. */
function fakeDetector(seen: string[]): FrameDetector<string> {
  return {
    async run(frame) {
      seen.push(frame);
      return { start: 0, end: 1, prepMs: [], inferMs: [], boxes: 0 };
    },
  };
}

describe('runUntil', () => {
  it('cycles through the frames until stopped', async () => {
    const seen: string[] = [];
    let count = 0;
    const frames = await runUntil(fakeDetector(seen), ['a', 'b'], [], Infinity, () => count < 5, () => count++);
    expect(frames).toHaveLength(5);
    expect(seen).toEqual(['a', 'b', 'a', 'b', 'a']);
  });

  it('runs nothing once the end time has passed', async () => {
    const seen: string[] = [];
    const frames = await runUntil(fakeDetector(seen), ['a'], [], performance.now() - 1, () => true, () => {});
    expect(frames).toEqual([]);
  });
});
