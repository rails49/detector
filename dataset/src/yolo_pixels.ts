import sharp from 'sharp';
import type { Frame } from '@rails49/detector';

/** An image's pixels, raw and row-major, `channels` bytes per pixel. */
export interface RawImage {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
  /** 3 for colour, 1 for a greyscale image; never alpha. */
  readonly channels: 1 | 2 | 3 | 4;
}

/**
 * Decode an archive image to raw pixels, then resample it to `size`.
 *
 * Two steps on purpose (#7): decoded first, the resize sees the same pixels
 * `detect` sees, so the export and `resample` in `@rails49/detector` filter the
 * same input with the same filter at any ratio. Handed the JPEG instead, sharp
 * lets libjpeg do part of a large reduction while decoding, which `detect`
 * cannot. At today's ratio, about 2×, libjpeg does none and the output is the
 * same either way.
 *
 * The resize is sharp's default, Lanczos3 with `fit: 'cover'`, which
 * `resample` reproduces.
 *
 * @param bytes The encoded image, as the archive holds it.
 * @param size  The resampled size, the plan's `size`.
 */
export async function decodeResampled(bytes: Uint8Array, size: Frame): Promise<RawImage> {
  const decoded = await sharp(Buffer.from(bytes)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = await sharp(decoded.data, {
    raw: { width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels },
  })
    .resize(size.width, size.height)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}
