import { describe, expect, it } from 'vitest';
import { DETECTOR_CANVAS } from '../src/generated.ts';
import { assertCanvasInput } from '../src/inputShape.ts';

describe("the model's input shape", () => {
  it('is accepted when it is the canvas square', () => {
    expect(() => assertCanvasInput([1, 3, DETECTOR_CANVAS, DETECTOR_CANVAS])).not.toThrow();
  });

  it('is refused when it is any other grid', () => {
    expect(() => assertCanvasInput([1, 3, 544, 960])).toThrow(/detector\.canvas/);
    expect(() => assertCanvasInput([1, 3, DETECTOR_CANVAS, 1024])).toThrow(/detector\.canvas/);
  });

  it('is refused when it is dynamic, or not one RGB image', () => {
    expect(() => assertCanvasInput([1, 3, 'height', 'width'])).toThrow();
    expect(() => assertCanvasInput([2, 3, DETECTOR_CANVAS, DETECTOR_CANVAS])).toThrow();
    expect(() => assertCanvasInput([3, DETECTOR_CANVAS, DETECTOR_CANVAS])).toThrow();
  });
});
