import { LitElement, css, html } from 'lit';
import { Camera, type CameraLoad } from './camera.js';
import { saveBlob } from './download.js';

const SIZES = [
  [3840, 2160],
  [4032, 3024],
  [1920, 1080],
];

/** Starts the camera, shows what it delivers, and saves a frame. */
export class CameraPanel extends LitElement {
  static properties = {
    camera: { state: true },
    status: { state: true },
  };

  static styles = css`
    video {
      width: 100%;
      max-height: 30vh;
      background: #000;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin: 0.5rem 0;
    }
  `;

  declare camera?: Camera;
  declare status: string;

  constructor() {
    super();
    this.status = 'off';
  }

  private get video(): HTMLVideoElement {
    return this.renderRoot.querySelector('video')!;
  }

  private value(name: string): string {
    return this.renderRoot.querySelector<HTMLSelectElement>(`[name=${name}]`)!.value;
  }

  private async start(): Promise<void> {
    const [width, height] = this.value('size').split('x').map(Number);
    try {
      this.camera = await Camera.start(this.video, width, height, this.value('load') as CameraLoad);
      const s = this.camera.started;
      this.status = `${s.width}×${s.height} at ${s.frameRate} fps`;
    } catch (error) {
      this.status = `failed: ${error}`;
    }
  }

  private stop(): void {
    this.camera?.stop();
    this.camera = undefined;
    this.status = 'off';
  }

  private async save(): Promise<void> {
    saveBlob(await this.camera!.frameJpeg(), `video-frame-${Date.now()}.jpg`);
  }

  render() {
    return html`
      <h2>Camera</h2>
      <div class="row">
        <label
          >Ask for
          <select name="size" ?disabled=${!!this.camera}>
            ${SIZES.map(([w, h]) => html`<option value="${w}x${h}">${w}×${h}</option>`)}
          </select></label
        >
        <label
          >At 10 Hz
          <select name="load" ?disabled=${!!this.camera}>
            <option value="draw">draw the frame</option>
            <option value="read">draw and read the frame</option>
            <option value="none">nothing</option>
          </select></label
        >
        ${this.camera
          ? html`<button @click=${this.stop}>Stop camera</button><button @click=${this.save}>Save frame</button>`
          : html`<button @click=${this.start}>Start camera</button>`}
      </div>
      <div>Camera: ${this.status}</div>
      <video playsinline muted></video>
    `;
  }
}

customElements.define('camera-panel', CameraPanel);
