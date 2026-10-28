import { describe, it, expect } from 'vitest';
import { DETECTOR_CANVAS } from '@detector/config';
import { carWidthPx } from '@rails49/detector';
import { R49Archive, getDPT, type ManifestData } from '@rails49/r49';
import { planArchive, type ImageDecoder, type ImagePlan, type PlanOptions } from '../src/yolo_rules.ts';

/**
 * The YOLO export's rules. Every wrong number here is invisible until a model
 * trains badly for a reason nobody can name, which is why these are pinned
 * rather than eyeballed once.
 *
 * Every archive is built by `R49Archive` and round-tripped through the real
 * serializer, so each manifest under test is one the format accepts. Nothing
 * reads a fixture off disk: a rule is only pinned if the archive that triggers
 * it can be constructed exactly. The decoder is the one stand-in — it reports
 * a stated size for any image the archive carries, so no test needs a real
 * JPEG or `sharp`.
 *
 * The car box's own cases are `@rails49/detector`'s, with `spanToPolygon`.
 */

const A_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const FRAME = { width: 1920, height: 1080 };

/** Two calibration points at equal height, far enough apart to clear MIN_DPT at HO. */
const CALIBRATED = [
  { px: { x: 0, y: 0 }, world: { x: 0, y: 0, z: 0 } },
  { px: { x: 1000, y: 0 }, world: { x: 800, y: 0, z: 0 } },
];

/** Two points at different heights: no equal-height pair, so no DPT. */
const UNCALIBRATED = [
  { px: { x: 0, y: 0 }, world: { x: 0, y: 0, z: 0 } },
  { px: { x: 1000, y: 0 }, world: { x: 800, y: 0, z: 50 } },
];

const car = (over: Record<string, unknown> = {}) => ({
  id: 'car-1',
  class: 'stock',
  p0: { x: 100, y: 540 },
  p1: { x: 300, y: 540 },
  provenance: 'human',
  ...over,
});

interface ImageSpec {
  filename?: string;
  complete?: boolean;
  labels?: Record<string, unknown>[];
  /** Leave the file out of the zip while the manifest still names it. */
  missing?: boolean;
}

interface Built {
  manifest: ManifestData;
  decode: ImageDecoder;
}

async function build(
  images: ImageSpec[],
  opts: {
    calibration?: typeof CALIBRATED;
    decodesAs?: { width: number; height: number };
    frame?: { width: number; height: number };
  } = {}
): Promise<Built> {
  const filenames = images.map((spec, i) => spec.filename ?? `image-${i}.jpeg`);
  const draft = new R49Archive();
  // Typed `unknown` on the way in, as the format's own tests build manifests:
  // a literal checked against ManifestData would need every optional key.
  const manifest: unknown = {
    version: 4,
    id: 'arch1',
    layout: { scale: 'HO', calibration: { points: opts.calibration ?? CALIBRATED }, sensors: [] },
    camera: { resolution: opts.frame ?? FRAME },
    images: images.map((spec, i) => ({
      filename: filenames[i],
      labeled_complete: spec.complete ?? true,
      labels: spec.labels ?? [],
    })),
  };
  draft.setManifest(manifest as ManifestData);
  for (const [i, spec] of images.entries()) {
    if (!spec.missing) await draft.addImage(filenames[i], A_JPEG);
  }

  const archive = await R49Archive.load(await draft.export());
  const size = opts.decodesAs ?? opts.frame ?? FRAME;
  return {
    manifest: archive.getManifest(),
    decode: async filename => ((await archive.getImage(filename)) === null ? null : size),
  };
}

/** The plan for a one-archive corpus, failing the test if the archive is fatal. */
async function plan(name: string, built: Built, options?: PlanOptions): Promise<readonly ImagePlan[]> {
  const result = await planArchive(name, built.manifest, built.decode, options);
  if (result.kind !== 'planned') throw new Error(`expected a plan, got: ${result.reason}`);
  return result.images;
}

function exported(image: ImagePlan | undefined) {
  if (image?.kind !== 'exported') throw new Error(`expected an export, got ${JSON.stringify(image)}`);
  return image;
}

describe('the labeled_complete gate', () => {
  it('skips an image a human has not vouched for, labels and all', async () => {
    const images = await plan('a', await build([{ complete: false, labels: [car()] }]));
    expect(images).toEqual([{ kind: 'skipped', filename: 'image-0.jpeg' }]);
  });

  it('is the only thing that skips: a complete image beside it still exports', async () => {
    const images = await plan('a', await build([{ complete: false }, { labels: [car()] }]));
    expect(images.map(i => i.kind)).toEqual(['skipped', 'exported']);
  });

  it('does not look inside a skipped image, so its faults are not fatal', async () => {
    const images = await plan(
      'a',
      await build([{ complete: false, missing: true, labels: [car({ class: 'tree' })] }])
    );
    expect(images.map(i => i.kind)).toEqual(['skipped']);
  });
});

describe('fatal', () => {
  it('is a whole archive without a DPT', async () => {
    const built = await build([{ labels: [car()] }], { calibration: UNCALIBRATED });
    expect(getDPT(built.manifest)).toBeNull();

    const result = await planArchive('west', built.manifest, built.decode);
    expect(result.kind).toBe('fatal');
    if (result.kind === 'fatal') expect(result.reason).toMatch(/^west: no DPT/);
  });

  it('is an image whose class no detector.classes entry prefixes', async () => {
    const [image] = await plan('a', await build([{ labels: [car({ id: 'x', class: 'tree' })] }]));
    expect(image?.kind).toBe('fatal');
    if (image?.kind === 'fatal') {
      expect(image.reasons).toHaveLength(1);
      expect(image.reasons[0]).toMatch(/^a\/image-0\.jpeg: label x has class "tree"/);
    }
  });

  it('is an image the manifest names and the archive does not carry', async () => {
    const [image] = await plan('a', await build([{ missing: true }]));
    expect(image).toEqual({
      kind: 'fatal',
      filename: 'image-0.jpeg',
      reasons: ['a: manifest names image-0.jpeg, which the archive does not contain'],
    });
  });

  it('is an image with a span whose ends coincide, which has no orientation', async () => {
    const [image] = await plan(
      'a',
      await build([{ labels: [car({ id: 'x', p0: { x: 100, y: 540 }, p1: { x: 100, y: 540 } })] }])
    );
    expect(image?.kind).toBe('fatal');
    if (image?.kind === 'fatal') expect(image.reasons[0]).toMatch(/^a\/image-0\.jpeg: label x: p0 and p1 coincide/);
  });

  it('names every fault in an image, not only the first', async () => {
    const [image] = await plan(
      'a',
      await build([
        {
          missing: true,
          labels: [car({ id: 'x', class: 'tree' }), car({ id: 'y', class: 'rock' })],
        },
      ])
    );
    expect(image?.kind === 'fatal' && image.reasons).toHaveLength(3);
  });

  it('leaves the other images planned, so the caller sees every fatal one', async () => {
    const images = await plan(
      'a',
      await build([{ labels: [car({ class: 'tree' })] }, { labels: [car()] }, { missing: true }])
    );
    expect(images.map(i => i.kind)).toEqual(['fatal', 'exported', 'fatal']);
  });
});

describe('an exported image', () => {
  it('may carry no cars: an empty label list is an all-background sample', async () => {
    const image = exported((await plan('a', await build([{}])))[0]);
    expect(image.tiles.map(t => t.lines)).toEqual([[]]);
    expect(image.warnings).toEqual([]);
  });

  it('carries one line per car, the class index then eight six-decimal corners on the canvas', async () => {
    const built = await build([{ labels: [car(), car({ id: 'car-2', class: 'stock.boxcar' })] }]);
    const image = exported((await plan('a', built))[0]);

    // A horizontal span from x=100 to x=300 at y=540, half a car width either side.
    const half = carWidthPx(getDPT(built.manifest)!) / 2;
    // The frame is smaller than the canvas, so it is one tile, padded.
    const top = ((540 + half) / DETECTOR_CANVAS).toFixed(6);
    const bottom = ((540 - half) / DETECTOR_CANVAS).toFixed(6);
    const x0 = (100 / DETECTOR_CANVAS).toFixed(6);
    const x1 = (300 / DETECTOR_CANVAS).toFixed(6);
    const line = `0 ${x0} ${top} ${x1} ${top} ${x1} ${bottom} ${x0} ${bottom}`;

    expect(image.tiles).toHaveLength(1);
    expect(image.tiles[0]!.lines).toEqual([line, line]);
    expect(image.tiles[0]!.cornersClamped).toBe(0);
  });

  it('counts the corners clamped to the tile edge', async () => {
    // At y=0 the two corners on the far side of the chord fall above the frame.
    const image = exported(
      (await plan('a', await build([{ labels: [car({ p0: { x: 100, y: 0 }, p1: { x: 300, y: 0 } })] }])))[0]
    );
    const [tile] = image.tiles;
    expect(tile!.cornersClamped).toBe(2);
    expect(tile!.lines[0]!.split(' ').slice(1).every(c => Number(c) >= 0 && Number(c) <= 1)).toBe(true);
  });

  it('warns, and still exports, when the image decodes at another size than camera.resolution', async () => {
    const image = exported(
      (await plan('a', await build([{ labels: [car()] }], { decodesAs: { width: 1, height: 1 } })))[0]
    );
    expect(image.cars).toHaveLength(1);
    expect(image.warnings).toEqual([
      'a/image-0.jpeg: camera.resolution is 1920x1080 but the image decodes as 1x1; ' +
        'labels were normalized against camera.resolution',
    ]);
  });
});

describe('the stem', () => {
  it('qualifies the image by its archive, so identically named images survive', async () => {
    const built = await build([{}]);
    const stems = await Promise.all(
      ['cars-0-10', 'lighting'].map(async n => exported((await plan(n, built))[0]).stem)
    );
    expect(stems).toEqual(['cars-0-10__image-0', 'lighting__image-0']);
  });

  it('strips only the last extension', async () => {
    const image = exported((await plan('a', await build([{ filename: 'frame.2.jpg' }])))[0]);
    expect(image.stem).toBe('a__frame.2');
  });

  it('is extended by each tile with the tile origin', async () => {
    const image = exported((await plan('a', await build([{}])))[0]);
    expect(image.tiles.map(t => t.stem)).toEqual(['a__image-0__0_0']);
  });

  it('collapses anything that is not a filename character', async () => {
    const image = exported((await plan('club layout/west', await build([{ filename: 'image 0.jpeg' }])))[0]);
    expect(image.stem).toBe('club-layout-west__image-0');
  });
});

describe('the split', () => {
  const names = ['a', 'b', 'c', 'd', 'e'];
  const splits = async (valSplit?: number) =>
    Promise.all(names.map(async n => exported((await plan(n, await build([{}]), { valSplit }))[0]).split));

  it('is stable across runs, keyed on the archive and image alone', async () => {
    expect(await splits(0.5)).toEqual(await splits(0.5));
  });

  it('sends everything to val at 1 and nothing at 0', async () => {
    expect(await splits(1)).toEqual(names.map(() => 'val'));
    expect(await splits(0)).toEqual(names.map(() => 'train'));
  });

  it('keeps every car in a frame on one side, by keying on the image', async () => {
    // Labels do not enter the key, so the cars of one frame share its split.
    const bare = exported((await plan('a', await build([{}]), { valSplit: 0.5 }))[0]);
    const busy = exported((await plan('a', await build([{ labels: [car()] }]), { valSplit: 0.5 }))[0]);
    expect(busy.split).toBe(bare.split);
  });

  it('sends a held-out image to test, whatever its hash, keyed on archive id and filename', async () => {
    const holdout = new Set(['arch1/image-1.jpeg']);
    const images = await plan('a', await build([{}, {}]), { valSplit: 0, holdout });
    expect(images.map(i => exported(i).split)).toEqual(['train', 'test']);
  });
});

describe('tiling', () => {
  // Five canvases wide: more than one tile across, one tile down.
  const WIDE = { width: 5 * DETECTOR_CANVAS, height: 1080 };

  it('cuts a frame wider than the canvas into whole tiles from edge to edge', async () => {
    const image = exported((await plan('a', await build([{}], { frame: WIDE })))[0]);
    const xs = image.tiles.map(t => t.x);
    expect(xs[0]).toBe(0);
    expect(xs.at(-1)).toBe(WIDE.width - DETECTOR_CANVAS);
    expect(image.tiles.every(t => t.y === 0)).toBe(true);
  });

  it('puts a car in every tile its box reaches into, and in no other', async () => {
    const built = await build([{ labels: [car({ p0: { x: 100, y: 540 }, p1: { x: 300, y: 540 } })] }], {
      frame: WIDE,
    });
    const image = exported((await plan('a', built))[0]);
    expect(image.tiles.map(t => t.lines.length)).toEqual(image.tiles.map(t => (t.x === 0 ? 1 : 0)));
  });

  it('labels a car cut by a tile edge in both tiles, clamped where it is cut', async () => {
    // Across the first tile's right edge, and whole inside the second tile.
    const edge = DETECTOR_CANVAS;
    const built = await build(
      [{ labels: [car({ p0: { x: edge - 100, y: 540 }, p1: { x: edge + 100, y: 540 } })] }],
      { frame: WIDE }
    );
    const [first, second] = exported((await plan('a', built))[0]).tiles;
    expect(second!.x).toBeLessThan(edge - 100);
    expect(first!.lines).toHaveLength(1);
    expect(first!.cornersClamped).toBe(2);
    expect(second!.lines).toHaveLength(1);
    expect(second!.cornersClamped).toBe(0);
  });
});

describe('the DPT', () => {
  it('is the native DPT when no target is given', async () => {
    const built = await build([{}]);
    const image = exported((await plan('a', built))[0]);
    expect(image.dpt).toBe(getDPT(built.manifest));
    expect(image.size).toEqual(FRAME);
  });

  it('resamples the frame and every car to the target, with the car width at the target', async () => {
    const built = await build([{ labels: [car()] }]);
    const scale = 10 / getDPT(built.manifest)!;
    const image = exported((await plan('a', built, { dpt: 10 }))[0]);

    expect(image.size).toEqual({ width: Math.round(1920 * scale), height: Math.round(1080 * scale) });
    expect(image.cars[0]!.p1.x).toBeCloseTo(300 * scale, 10);

    const corners = image.tiles[0]!.lines[0]!.split(' ').slice(1).map(Number);
    const width = (corners[1]! - corners[7]!) * DETECTOR_CANVAS;
    expect(width).toBeCloseTo(carWidthPx(10), 3);
  });

  it('is fatal above the native DPT, which would invent pixels', async () => {
    const built = await build([{}]);
    const result = await planArchive('a', built.manifest, built.decode, { dpt: 100 });
    expect(result.kind).toBe('fatal');
    if (result.kind === 'fatal') {
      expect(result.reason).toMatch(/^a: native DPT 20\.\d is below the target DPT 100/);
    }
  });
});
