// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/bench-app.js';
import type { BenchApp } from '../src/bench-app.js';
import type { CameraPanel } from '../src/camera-panel.js';

const manifest = {
  model: 'n16',
  dpt: 16,
  layout: { x0: 55, y0: 782, x1: 3767, y1: 2699 },
  frames: [{ file: 'frames/a.jpg', width: 3958, height: 2968 }],
  models: [
    { side: 2048, precision: 'fp32', file: 'models/a.onnx', bytes: 1 },
    { side: 1024, precision: 'fp32', file: 'models/b.onnx', bytes: 1 },
  ],
};

// happy-dom has no crossOriginIsolated.
beforeEach(() => {
  vi.stubGlobal('crossOriginIsolated', true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const options = (root: ShadowRoot, name: string) =>
  Array.from(root.querySelectorAll<HTMLOptionElement>(`[name=${name}] option`)).map((o) => o.textContent);

describe('bench-app', () => {
  it('offers the whole layout and fewer tiles once the frames load', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.endsWith('manifest.json') ? new Response(JSON.stringify(manifest)) : new Response(new Blob()),
    );
    vi.stubGlobal('createImageBitmap', async () => ({}));
    const app = document.createElement('bench-app') as BenchApp;
    document.body.append(app);
    await vi.waitFor(() => expect(app.status).toBe('ready'));
    await app.updateComplete;

    expect(options(app.shadowRoot!, 'tiles')).toEqual(['2, whole layout', '1']);
    expect(app.shadowRoot!.querySelector<HTMLButtonElement>('button')!.disabled).toBe(false);
  });

  it('shows where a run that crashed the tab stopped', async () => {
    vi.stubGlobal('fetch', async () => new Response('missing', { status: 404 }));
    localStorage.setItem('bench-run', JSON.stringify({ settings: 'webgpu fp32, 2 tiles of 2048', step: 'first frame' }));
    const app = document.createElement('bench-app') as BenchApp;
    document.body.append(app);
    await app.updateComplete;
    expect(app.shadowRoot!.textContent).toContain('webgpu fp32, 2 tiles of 2048: stopped at first frame');
  });

  it('reports assets it cannot load', async () => {
    vi.stubGlobal('fetch', async () => new Response('missing', { status: 404 }));
    const app = document.createElement('bench-app') as BenchApp;
    document.body.append(app);
    await vi.waitFor(() => expect(app.status).toMatch(/^failed to load assets/));
  });
});

describe('camera-panel', () => {
  it('reports a camera that does not start', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: () => Promise.reject(new Error('NotFoundError')) },
    });
    const panel = document.createElement('camera-panel') as CameraPanel;
    document.body.append(panel);
    await panel.updateComplete;
    expect(panel.status).toBe('off');

    panel.shadowRoot!.querySelector('button')!.click();
    await vi.waitFor(() => expect(panel.status).toMatch(/^failed: .*NotFoundError/));
  });
});
