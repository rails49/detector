// The WASM-EP-only entry point, not the package root: the root pulls the jsep
// (WebGPU/WebNN) binary, which is over Cloudflare's per-file limit and which
// `executionProviders: ['wasm']` below never uses. See occupancy's `ui/ortAssets.ts`.
import * as ort from 'onnxruntime-web/wasm';
import { DETECTOR_CANVAS } from './generated.ts';
import { decodeDetections, type TileOutput } from './decode.ts';
import { assertCanvasInput } from './inputShape.ts';
import { tileToReport } from './report.ts';
import { paintResampled, paintTile } from './preprocess.ts';
import { CONFIDENCE_THRESHOLD } from './thresholds.ts';
import { inputLayout } from './tiles.ts';
import type { Detection, Frame } from './types.ts';

/**
 * A loaded detector. There is no unloaded one — see `loadDetector`.
 */
export interface Detector {
  /**
   * Every car the model finds in one picture (L0), in the frame named by
   * `report`.
   *
   * The picture is resampled to the target DPT (`DETECTOR_DPT`), down or up —
   * no DPT is refused — and cut into canvas tiles at `inputLayout`'s
   * positions, each padded on the right and bottom as training pads them. The
   * model runs once per tile, and a car that two overlapping tiles both see
   * comes back once.
   *
   * @param source The picture: a video element mid-stream, an image, a canvas,
   *               a bitmap — anything the 2D context can draw.
   * @param report The coordinate system to answer in, normally
   *               `camera.resolution`. The source's own pixel count, the
   *               resample, the tiles and the padding all stay inside.
   * @param dpt    The source's own DPT: dots per track in the source's pixels,
   *               not the report frame's.
   * @param options.minConfidence Overrides `CONFIDENCE_THRESHOLD` for
   *               this call, so diagnostics can see what a lower threshold
   *               would have caught without re-running inference.
   * @throws If the source has no dimensions yet — a video before its metadata
   *         arrives. That is the not-ready case, and it is a caller's timing
   *         bug rather than an empty frame.
   */
  detect(
    source: CanvasImageSource,
    report: Frame,
    dpt: number,
    options?: { readonly minConfidence?: number }
  ): Promise<readonly Detection[]>;

  /** Release the ORT session. The instance is unusable afterwards. */
  dispose(): Promise<void>;
}

/**
 * Where the ORT runtime is served from is the **app's** to say — it depends on
 * the app's base path, which a library cannot know. There is no safe default to
 * fall back to: `ui` deletes the copy ORT would otherwise resolve from
 * `import.meta.url` (see occupancy's `ui/ortAssets.ts`), so an unset `wasmPaths` fetches a
 * URL that isn't there. Say so at the point of failure rather than surfacing it
 * as a 404 on a hashed filename.
 */
function assertWasmPathsConfigured(): void {
  if (!ort.env.wasm.wasmPaths) {
    throw new Error(
      'Set ort.env.wasm.wasmPaths to where the app serves the ONNX Runtime ' +
        'before loading a model — there is no default that works under a base path.'
    );
  }
}

/**
 * Load a detector from model bytes or a URL.
 *
 * A factory rather than a constructor plus an `await load()`, because the
 * half-built state is the whole problem: a session object holding a nullable
 * session has to answer `detect` somehow while unloaded, and every honest
 * answer ("no cars") is indistinguishable from a real empty frame. SPEC has a
 * name for that state — `unknown`, "model not loaded" — and it belongs to the
 * view, not to the session. So it is unrepresentable here: you cannot hold a
 * `Detector` that is not loaded, `detect` has no null branch, and the live view
 * holds `Detector | null` where the distinction is real and drives what the
 * user sees.
 *
 * @throws Unless the model's input is `DETECTOR_CANVAS` × `DETECTOR_CANVAS`
 *         (`assertCanvasInput`).
 */
export async function loadDetector(source: string | Blob | ArrayBuffer): Promise<Detector> {
  assertWasmPathsConfigured();

  // A URL and bytes are separate overloads, so the branch is real rather than a
  // cast: ORT fetches the one and adopts the other.
  const options: ort.InferenceSession.SessionOptions = {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  };

  const session =
    typeof source === 'string'
      ? await ort.InferenceSession.create(source, options)
      : await ort.InferenceSession.create(
          source instanceof Blob ? new Uint8Array(await source.arrayBuffer()) : new Uint8Array(source),
          options
        );

  assertCanvasInput(firstInputShape(session));
  return new BrowserDetector(session);
}

/** The loaded graph's first input shape. */
function firstInputShape(session: ort.InferenceSession): readonly (number | string)[] {
  const input = session.inputMetadata[0];
  if (!input?.isTensor) {
    throw new Error("the model's first input is not a tensor; this is not a detector graph");
  }
  return input.shape;
}

class BrowserDetector implements Detector {
  readonly #session: ort.InferenceSession;
  // The frame resampled to the target DPT. Resized only when the resampled
  // size changes, since sizing a canvas reallocates it.
  readonly #resampled: HTMLCanvasElement;
  readonly #resampledCtx: CanvasRenderingContext2D;
  // The one tile the model reads, canvas-square. One for the life of the
  // session: `detect` runs per video frame, and allocating a backing store
  // each time is the kind of garbage a live view notices.
  readonly #input: CanvasRenderingContext2D;
  // The input tensor's storage, reused across tiles: each run is awaited
  // before the next tile overwrites it.
  readonly #planar = new Float32Array(3 * DETECTOR_CANVAS * DETECTOR_CANVAS);

  constructor(session: ort.InferenceSession) {
    this.#session = session;

    this.#resampled = document.createElement('canvas');
    const resampledCtx = this.#resampled.getContext('2d');
    if (!resampledCtx) throw new Error('failed to create the detector 2D context');
    this.#resampledCtx = resampledCtx;

    const input = document.createElement('canvas');
    input.width = DETECTOR_CANVAS;
    input.height = DETECTOR_CANVAS;
    const inputCtx = input.getContext('2d', { willReadFrequently: true });
    if (!inputCtx) throw new Error('failed to create the detector 2D context');
    this.#input = inputCtx;
  }

  async detect(
    source: CanvasImageSource,
    report: Frame,
    dpt: number,
    options?: { readonly minConfidence?: number }
  ): Promise<readonly Detection[]> {
    if (!(dpt > 0)) throw new Error(`detect needs the source's DPT, a positive number; got ${dpt}`);

    const frame = sourceFrame(source);
    const layout = inputLayout(frame, dpt);

    if (this.#resampled.width !== layout.size.width || this.#resampled.height !== layout.size.height) {
      this.#resampled.width = layout.size.width;
      this.#resampled.height = layout.size.height;
    }
    paintResampled(this.#resampledCtx, source, frame, layout.size);

    const outputs: TileOutput[] = [];
    for (const tile of layout.tiles) {
      paintTile(this.#input, this.#resampled, tile);
      const feeds = { [this.#session.inputNames[0]]: this.#toTensor() };
      const results = await this.#session.run(feeds);
      const output = results[this.#session.outputNames[0]];
      outputs.push({
        data: output.data as Float32Array,
        dims: output.dims,
        map: tileToReport(layout, tile, report),
      });
    }

    return decodeDetections(outputs, options?.minConfidence ?? CONFIDENCE_THRESHOLD);
  }

  /**
   * The input canvas as the network's input: RGB, planar, scaled to `0…1`.
   *
   * No mean/std normalization — Ultralytics bakes that into the graph, and
   * `export_onnx.py`'s calibration reader feeds it the same plain division.
   */
  #toTensor(): ort.Tensor {
    const { data } = this.#input.getImageData(0, 0, DETECTOR_CANVAS, DETECTOR_CANVAS);
    const area = DETECTOR_CANVAS * DETECTOR_CANVAS;
    const planar = this.#planar;

    for (let i = 0; i < area; i++) {
      planar[i] = data[i * 4] / 255;
      planar[i + area] = data[i * 4 + 1] / 255;
      planar[i + 2 * area] = data[i * 4 + 2] / 255;
    }

    return new ort.Tensor('float32', planar, [1, 3, DETECTOR_CANVAS, DETECTOR_CANVAS]);
  }

  async dispose(): Promise<void> {
    await this.#session.release();
  }
}

/**
 * The source's own pixel count.
 *
 * Each source type states its intrinsic size under a different name, and the
 * *attribute* `width` on a video or an image is the CSS box rather than the
 * media — so the branch is on which property exists, not on which is non-zero.
 * A zero after that is the not-ready case, which is worth a sentence rather
 * than a division by zero three frames later.
 */
function sourceFrame(source: CanvasImageSource): Frame {
  const candidate = source as Partial<
    Record<'videoWidth' | 'videoHeight' | 'naturalWidth' | 'naturalHeight' | 'width' | 'height', number>
  >;

  let width: number | undefined;
  let height: number | undefined;

  if (typeof candidate.videoWidth === 'number') {
    width = candidate.videoWidth;
    height = candidate.videoHeight;
  } else if (typeof candidate.naturalWidth === 'number') {
    width = candidate.naturalWidth;
    height = candidate.naturalHeight;
  } else if (typeof candidate.width === 'number') {
    width = candidate.width;
    height = candidate.height;
  }

  if (!width || !height) {
    throw new Error(
      'the source has no dimensions yet — a video before its metadata arrives, ' +
        'or an image before it decodes. Wait for it rather than detecting on nothing.'
    );
  }

  return { width, height };
}
