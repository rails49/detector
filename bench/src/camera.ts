import type { CameraRun } from './summary.js';

/** What the page does with camera frames at 10 Hz, standing in for the input of occupancy's sensor-patch classifier. */
export type CameraLoad = 'none' | 'draw' | 'read';

const LOAD_PERIOD_MS = 100;

/**
 * The rear camera at a requested size, with its frame arrival times and the
 * cost of drawing a frame into a canvas. Its frames go to no model.
 */
export class Camera {
  private intervalsMs: number[] = [];
  private drawMs: number[] = [];
  private readMs: number[] = [];
  private dropped = 0;
  private lastTime?: number;
  private lastPresented?: number;
  private timer?: number;
  private stopped = false;
  private readonly canvas = document.createElement('canvas');
  private context?: CanvasRenderingContext2D;
  private readonly settings: MediaTrackSettings;
  private readonly capabilities: MediaTrackCapabilities;

  private constructor(
    private readonly video: HTMLVideoElement,
    private readonly stream: MediaStream,
    private readonly requested: string,
    private readonly load: CameraLoad,
  ) {
    const track = stream.getVideoTracks()[0];
    this.settings = track.getSettings();
    this.capabilities = track.getCapabilities?.() ?? {};
  }

  static async start(video: HTMLVideoElement, width: number, height: number, load: CameraLoad): Promise<Camera> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment', width: { ideal: width }, height: { ideal: height } },
    });
    try {
      video.srcObject = stream;
      await video.play();
    } catch (error) {
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
      throw error;
    }
    const camera = new Camera(video, stream, `${width}×${height}`, load);
    camera.watchFrames();
    if (load !== 'none') camera.timer = window.setInterval(() => camera.drawFrame(), LOAD_PERIOD_MS);
    return camera;
  }

  private watchFrames(): void {
    this.video.requestVideoFrameCallback((now, metadata) => {
      if (this.stopped) return;
      if (this.lastTime !== undefined) this.intervalsMs.push(now - this.lastTime);
      if (this.lastPresented !== undefined) this.dropped += Math.max(0, metadata.presentedFrames - this.lastPresented - 1);
      this.lastTime = now;
      this.lastPresented = metadata.presentedFrames;
      this.watchFrames();
    });
  }

  private drawFrame(): void {
    const { videoWidth: width, videoHeight: height } = this.video;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    // CPU-backed only when the whole frame is read back.
    this.context ??= this.canvas.getContext('2d', { willReadFrequently: this.load === 'read' })!;
    const context = this.context;
    const t0 = performance.now();
    context.drawImage(this.video, 0, 0);
    // Reading one pixel makes the draw finish before the clock stops.
    context.getImageData(0, 0, 1, 1);
    const t1 = performance.now();
    this.drawMs.push(t1 - t0);
    if (this.load === 'read') {
      context.getImageData(0, 0, width, height);
      this.readMs.push(performance.now() - t1);
    }
  }

  /** Clears the frame and draw records, so the next `record()` covers one detector run. */
  reset(): void {
    this.intervalsMs = [];
    this.drawMs = [];
    this.readMs = [];
    this.dropped = 0;
  }

  record(): CameraRun {
    return {
      requested: this.requested,
      settings: this.settings,
      capabilities: this.capabilities,
      load: this.load,
      intervalsMs: this.intervalsMs,
      dropped: this.dropped,
      drawMs: this.drawMs,
      readMs: this.readMs,
    };
  }

  /** The settings the camera started with. */
  get started(): MediaTrackSettings {
    return this.settings;
  }

  /** The current frame as a JPEG, to compare its field with a still of the same scene. */
  async frameJpeg(): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = this.video.videoWidth;
    canvas.height = this.video.videoHeight;
    canvas.getContext('2d')!.drawImage(this.video, 0, 0);
    return new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.95),
    );
  }

  stop(): void {
    this.stopped = true;
    window.clearInterval(this.timer);
    for (const track of this.stream.getTracks()) track.stop();
    this.video.srcObject = null;
  }
}
