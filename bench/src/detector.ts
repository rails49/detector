import { CONFIDENCE_THRESHOLD } from '@rails49/detector';
import type * as Ort from 'onnxruntime-web';
import type { DetectorFrame } from './summary.js';
import { rgbaToChw } from './tensor.js';
import type { Tile } from './tiles.js';

export type Runtime = 'wasm' | 'webgpu';

/**
 * Each runtime is its own ORT build: `/wasm` loads `ort-wasm-simd-threaded.wasm`,
 * `/webgpu` the asyncify build. The page loads one per visit, because ORT
 * reads `env` once, when the first session starts.
 *
 * WASM inference runs in ORT's proxy worker. On the main thread it would block
 * the camera callbacks for the whole run. ORT has no proxy for WebGPU.
 */
async function loadOrt(runtime: Runtime): Promise<typeof Ort> {
  const ort = runtime === 'webgpu' ? await import('onnxruntime-web/webgpu') : await import('onnxruntime-web/wasm');
  ort.env.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`;
  ort.env.wasm.proxy = runtime === 'wasm';
  return ort;
}

export class Detector {
  private readonly canvas: OffscreenCanvas;
  private readonly context: OffscreenCanvasRenderingContext2D;

  private constructor(
    private readonly ort: typeof Ort,
    private readonly session: Ort.InferenceSession,
    private readonly side: number,
  ) {
    this.canvas = new OffscreenCanvas(side, side);
    this.context = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  static async create(runtime: Runtime, modelUrl: string, side: number, threads: number): Promise<Detector> {
    const ort = await loadOrt(runtime);
    if (threads) ort.env.wasm.numThreads = threads;
    const session = await ort.InferenceSession.create(modelUrl, { executionProviders: [runtime] });
    return new Detector(ort, session, side);
  }

  /** Runs every tile of `frame` in turn. */
  async run(frame: ImageBitmap, tiles: Tile[]): Promise<DetectorFrame> {
    const side = this.side;
    const result: DetectorFrame = { start: performance.now(), end: 0, prepMs: [], inferMs: [], boxes: 0 };
    for (const tile of tiles) {
      const t0 = performance.now();
      this.context.drawImage(frame, tile.x, tile.y, side, side, 0, 0, side, side);
      // A new array per tile: the WASM proxy transfers the buffer to its worker.
      const input = new Float32Array(3 * side * side);
      rgbaToChw(this.context.getImageData(0, 0, side, side).data, input);
      const tensor = new this.ort.Tensor('float32', input, [1, 3, side, side]);
      const t1 = performance.now();
      const outputs = await this.session.run({ [this.session.inputNames[0]]: tensor });
      const t2 = performance.now();
      const slots = outputs[this.session.outputNames[0]].data as Float32Array;
      for (let i = 4; i < slots.length; i += 7) if (slots[i] > CONFIDENCE_THRESHOLD) result.boxes++;
      result.prepMs.push(t1 - t0);
      result.inferMs.push(t2 - t1);
    }
    result.end = performance.now();
    return result;
  }

  release(): Promise<void> {
    return this.session.release();
  }
}
