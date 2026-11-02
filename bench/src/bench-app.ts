import { tileOverlapPx } from '@rails49/detector';
import { LitElement, css, html } from 'lit';
import type { CameraPanel } from './camera-panel.js';
import './camera-panel.js';
import { Detector, type Runtime } from './detector.js';
import { saveBlob } from './download.js';
import { runUntil } from './run.js';
import { clearNote, noteStep, takeNote } from './trace.js';
import { summaryText, type CameraRun, type DetectorRun } from './summary.js';
import { tileGrid, type Box } from './tiles.js';

/** `bench/public/data/manifest.json`, written by detector/export_bench.py. */
interface Manifest {
  model: string;
  dpt: number;
  layout: Box;
  frames: { file: string; width: number; height: number }[];
  models: { side: number; precision: string; file: string; bytes: number }[];
}

const DATA = `${import.meta.env.BASE_URL}data/`;
const DURATIONS_MIN = [1, 5, 30];
const THREADS = [0, 1, 2, 4, 6, 8];

/** Settings, the detector run, and its summary. */
export class BenchApp extends LitElement {
  static properties = {
    manifest: { state: true },
    side: { state: true },
    status: { state: true },
    running: { state: true },
    summary: { state: true },
    crash: { state: true },
  };

  static styles = css`
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin: 0.5rem 0;
    }
    textarea {
      width: 100%;
      height: 16rem;
      font-family: ui-monospace, monospace;
      font-size: 0.75rem;
    }
  `;

  declare manifest?: Manifest;
  declare side: number;
  declare status: string;
  declare running: boolean;
  declare summary: string;
  declare crash?: string;

  // ORT reads its runtime and thread count once per page, so both are URL parameters.
  private readonly params = new URLSearchParams(location.search);
  private readonly runtime: Runtime = this.params.get('runtime') === 'webgpu' ? 'webgpu' : 'wasm';
  private readonly threads = Number(this.params.get('threads')) || 0;
  private frames: ImageBitmap[] = [];
  private record?: { run: DetectorRun; camera?: CameraRun };

  constructor() {
    super();
    this.side = 2048;
    this.status = 'loading frames';
    this.running = false;
    this.summary = '';
    this.crash = takeNote();
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const manifest: Manifest = await (await fetch(`${DATA}manifest.json`)).json();
      // One frame: a decoded frame at DPT 16 holds about 47 MB, and iOS kills tabs that use too much.
      const blob = await (await fetch(`${DATA}${manifest.frames[0].file}`)).blob();
      this.frames = [await createImageBitmap(blob)];
      this.manifest = manifest;
      this.status = 'ready';
    } catch (error) {
      this.status = `failed to load assets: ${error}`;
    }
  }

  private value(name: string): string {
    return this.renderRoot.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${name}]`)!.value;
  }

  private get tiles() {
    const m = this.manifest!;
    return tileGrid(m.layout, this.side, tileOverlapPx(m.dpt), m.frames[0].width, m.frames[0].height);
  }

  private reloadWith(name: string) {
    return (event: Event) => {
      this.params.set(name, (event.target as HTMLSelectElement).value);
      location.search = this.params.toString();
    };
  }

  private async start(): Promise<void> {
    const m = this.manifest!;
    const precision = this.value('precision');
    const tiles = this.tiles.slice(0, Number(this.value('tiles')));
    const endAt = performance.now() + Number(this.value('duration')) * 60_000;
    const camera = this.renderRoot.querySelector<CameraPanel>('camera-panel')!.camera;
    const model = m.models.find((x) => x.side === this.side && x.precision === precision)!;
    const settings = `${this.runtime} ${precision}, ${tiles.length} tiles of ${this.side}, camera ${camera ? camera.record().load : 'off'}`;
    this.running = true;
    this.summary = '';
    const wakeLock = await navigator.wakeLock?.request('screen').catch(() => undefined);
    let detector: Detector | undefined;
    try {
      this.status = 'loading model';
      noteStep(settings, this.status);
      const t0 = performance.now();
      detector = await Detector.create(this.runtime, `${DATA}${model.file}`, this.side, this.threads);
      const loadMs = performance.now() - t0;
      this.status = 'first frame';
      noteStep(settings, this.status);
      const warmup = await detector.run(this.frames[0], tiles);
      const run: DetectorRun = {
        device: this.value('device'),
        userAgent: navigator.userAgent,
        cores: navigator.hardwareConcurrency,
        isolated: crossOriginIsolated,
        webgpu: 'gpu' in navigator,
        model: m.model,
        precision,
        runtime: this.runtime,
        threads: this.threads,
        side: this.side,
        tiles: tiles.length,
        dpt: m.dpt,
        loadMs,
        warmupMs: warmup.end - warmup.start,
        frames: [],
      };
      camera?.reset();
      run.frames = await runUntil(detector, this.frames, tiles, endAt, () => this.running, (frame, count) => {
        const left = Math.max(0, (endAt - performance.now()) / 1000);
        this.status = `frame ${count}: ${(frame.end - frame.start).toFixed(0)} ms, ${frame.boxes} boxes, ${left.toFixed(0)} s left`;
        noteStep(settings, `frame ${count + 1}`);
      });
      if (run.frames.length === 0) {
        this.status = 'stopped before the first timed frame';
        return;
      }
      this.record = { run, camera: camera?.record() };
      this.summary = summaryText(run, this.record.camera, new Date());
      this.status = 'done';
    } catch (error) {
      this.status = `failed: ${error}`;
    } finally {
      clearNote();
      this.running = false;
      await detector?.release();
      await wakeLock?.release();
    }
  }

  private stop(): void {
    this.running = false;
  }

  private download(): void {
    const blob = new Blob([JSON.stringify(this.record, null, 1)], { type: 'application/json' });
    saveBlob(blob, `bench-${this.record!.run.runtime}-${Date.now()}.json`);
  }

  render() {
    const m = this.manifest;
    const precisions = [...new Set(m?.models.map((x) => x.precision))];
    const sides = [...new Set(m?.models.map((x) => x.side))];
    const counts = m ? [...new Set([this.tiles.length, 8, 4, 2, 1].filter((n) => n <= this.tiles.length))] : [];
    return html`
      <h1>Detector in Safari</h1>
      <p>
        crossOriginIsolated ${crossOriginIsolated ? 'yes' : 'no'} | cores ${navigator.hardwareConcurrency} |
        navigator.gpu ${'gpu' in navigator ? 'yes' : 'no'}
      </p>
      <camera-panel></camera-panel>
      <h2>Detector</h2>
      <div class="row">
        <label>Device <input name="device" placeholder="iPhone 16 Pro Max" ?disabled=${this.running} /></label>
        <label
          >Runtime
          <select @change=${this.reloadWith('runtime')} ?disabled=${this.running}>
            ${(['wasm', 'webgpu'] as const).map((r) => html`<option ?selected=${r === this.runtime}>${r}</option>`)}
          </select></label
        >
        <label
          >Precision
          <select name="precision" ?disabled=${this.running}>
            ${precisions.map((p) => html`<option ?selected=${p === 'fp32'}>${p}</option>`)}
          </select></label
        >
        <label
          >Tile
          <select
            ?disabled=${this.running}
            @change=${(e: Event) => (this.side = Number((e.target as HTMLSelectElement).value))}
          >
            ${sides.map((s) => html`<option ?selected=${s === this.side}>${s}</option>`)}
          </select></label
        >
        <label
          >Tiles
          <select name="tiles" ?disabled=${this.running}>
            ${counts.map((n) => html`<option value=${n}>${n === this.tiles.length ? `${n}, whole layout` : n}</option>`)}
          </select></label
        >
        <label
          >Threads
          <select @change=${this.reloadWith('threads')} ?disabled=${this.running}>
            ${THREADS.map((n) => html`<option value=${n} ?selected=${n === this.threads}>${n || 'default'}</option>`)}
          </select></label
        >
        <label
          >Minutes
          <select name="duration" ?disabled=${this.running}>
            ${DURATIONS_MIN.map((n) => html`<option>${n}</option>`)}
          </select></label
        >
        ${this.running
          ? html`<button @click=${this.stop}>Stop</button>`
          : html`<button ?disabled=${!m} @click=${this.start}>Run</button>`}
      </div>
      ${this.crash ? html`<p>The last run did not finish, so the tab probably crashed. ${this.crash}.</p>` : ''}
      <div>${this.status}</div>
      ${this.summary
        ? html`
            <h2>Summary</h2>
            <textarea readonly .value=${this.summary}></textarea>
            <div class="row">
              <button @click=${() => navigator.clipboard.writeText(this.summary)}>Copy</button>
              <button @click=${this.download}>Download per-frame log</button>
            </div>
          `
        : ''}
    `;
  }
}

customElements.define('bench-app', BenchApp);
