import { LitElement, css, html } from 'lit';
import type { CameraPanel } from './camera-panel.js';
import './camera-panel.js';
import { Detector, type Runtime } from './detector.js';
import { summaryText, type CameraRun, type DetectorRun } from './summary.js';
import { tileGrid, type Box } from './tiles.js';

/** `bench/public/data/manifest.json`, written by detector/export_bench.py. */
interface Manifest {
  model: string;
  dpt: number;
  overlap: number;
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

  private readonly runtime: Runtime = new URLSearchParams(location.search).get('runtime') === 'webgpu' ? 'webgpu' : 'wasm';
  private frames: ImageBitmap[] = [];
  private record?: { run: DetectorRun; camera?: CameraRun };

  constructor() {
    super();
    this.side = 2048;
    this.status = 'loading frames';
    this.running = false;
    this.summary = '';
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const manifest: Manifest = await (await fetch(`${DATA}manifest.json`)).json();
      this.frames = await Promise.all(
        manifest.frames.map(async (f) => createImageBitmap(await (await fetch(`${DATA}${f.file}`)).blob())),
      );
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
    return tileGrid(m.layout, this.side, m.overlap, m.frames[0].width, m.frames[0].height);
  }

  private setRuntime(event: Event): void {
    const params = new URLSearchParams(location.search);
    params.set('runtime', (event.target as HTMLSelectElement).value);
    location.search = params.toString();
  }

  private async start(): Promise<void> {
    const m = this.manifest!;
    const precision = this.value('precision');
    const threads = Number(this.value('threads'));
    const tiles = this.tiles.slice(0, Number(this.value('tiles')));
    const endAt = performance.now() + Number(this.value('duration')) * 60_000;
    const camera = this.renderRoot.querySelector<CameraPanel>('camera-panel')!.camera;
    const model = m.models.find((x) => x.side === this.side && x.precision === precision)!;
    this.running = true;
    this.summary = '';
    const wakeLock = await navigator.wakeLock?.request('screen').catch(() => undefined);
    try {
      this.status = 'loading model';
      const t0 = performance.now();
      const detector = await Detector.create(this.runtime, `${DATA}${model.file}`, this.side, threads);
      const loadMs = performance.now() - t0;
      this.status = 'first frame';
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
        threads,
        side: this.side,
        tiles: tiles.length,
        dpt: m.dpt,
        loadMs,
        warmupMs: warmup.end - warmup.start,
        frames: [],
      };
      this.record = { run };
      camera?.reset();
      while (this.running && performance.now() < endAt) {
        const frame = await detector.run(this.frames[run.frames.length % this.frames.length], tiles);
        run.frames.push(frame);
        const left = Math.max(0, (endAt - performance.now()) / 1000);
        this.status = `frame ${run.frames.length}: ${(frame.end - frame.start).toFixed(0)} ms, ${frame.boxes} boxes, ${left.toFixed(0)} s left`;
      }
      this.record.camera = camera?.record();
      this.summary = summaryText(run, this.record.camera, new Date());
      this.status = 'done';
    } catch (error) {
      this.status = `failed: ${error}`;
    } finally {
      this.running = false;
      await wakeLock?.release();
    }
  }

  private stop(): void {
    this.running = false;
  }

  private download(): void {
    const blob = new Blob([JSON.stringify(this.record, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bench-${this.record!.run.runtime}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
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
          <select @change=${this.setRuntime} ?disabled=${this.running}>
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
          <select name="threads" ?disabled=${this.running}>
            ${THREADS.map((n) => html`<option value=${n}>${n || 'default'}</option>`)}
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
