import { afterEach, expect, it, vi } from 'vitest';
import { Camera } from '../src/camera.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('stops the stream when the video will not play', async () => {
  const stop = vi.fn();
  const track = { stop, getSettings: () => ({}) };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => stream } });
  const video = { srcObject: null, play: () => Promise.reject(new Error('NotAllowedError')) } as unknown as HTMLVideoElement;

  await expect(Camera.start(video, 3840, 2160, 'read')).rejects.toThrow('NotAllowedError');
  expect(stop).toHaveBeenCalled();
  expect(video.srcObject).toBeNull();
});
