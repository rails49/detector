import { DETECTOR_CANVAS } from './generated.ts';

/**
 * Check a loaded graph's input shape against the canvas.
 *
 * The shape is read off the graph rather than trusted from config — a
 * constant can disagree with the shipped model, a graph cannot disagree with
 * itself — and drift between the two puts every box in the wrong place. Kept
 * apart from the ORT session so a node test can drive it.
 *
 * @param shape The graph's first input, NCHW, as ORT reports it.
 * @throws Unless the input is `[1, 3, DETECTOR_CANVAS, DETECTOR_CANVAS]`.
 */
export function assertCanvasInput(shape: readonly (number | string)[]): void {
  const expected = [1, 3, DETECTOR_CANVAS, DETECTOR_CANVAS];
  if (shape.length !== expected.length || shape.some((dim, i) => dim !== expected[i])) {
    throw new Error(
      `the model takes [${shape.join(', ')}], but detector.canvas says ` +
        `[${expected.join(', ')}]. Re-export the model or fix config.yaml — ` +
        `tiling to the wrong canvas puts every box in the wrong place.`
    );
  }
}
