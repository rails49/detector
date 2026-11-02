import { describe, expect, it } from 'vitest';
import { quantile, spread } from '../src/stats.js';

describe('quantile', () => {
  it('takes the nearest rank', () => {
    const values = Array.from({ length: 100 }, (_, i) => 100 - i);
    expect(quantile(values, 0.5)).toBe(50);
    expect(quantile(values, 0.95)).toBe(95);
    expect(quantile(values, 1)).toBe(100);
  });

  it('is NaN with no values', () => {
    expect(quantile([], 0.5)).toBeNaN();
  });
});

describe('spread', () => {
  it('reports count, median, p95 and max', () => {
    expect(spread([3, 1, 2])).toEqual({ count: 3, median: 2, p95: 3, max: 3 });
  });
});
