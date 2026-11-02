export interface Spread {
  count: number;
  median: number;
  p95: number;
  max: number;
}

/** The nearest-rank `q` quantile of `values`; NaN when empty. */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
}

export function spread(values: number[]): Spread {
  return {
    count: values.length,
    median: quantile(values, 0.5),
    p95: quantile(values, 0.95),
    max: values.length ? Math.max(...values) : NaN,
  };
}
