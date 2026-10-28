import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';
import { DETECTOR_CANVAS, DETECTOR_CLASSES, DETECTOR_VAL_SPLIT } from '@detector/config';
import { R49Archive } from '@rails49/r49';
import { planArchive, type ImageDecoder, type Span, type Split } from './yolo_rules.ts';

/**
 * Derives the Ultralytics OBB dataset layout from a directory of `.r49`
 * archives — directly, with no intermediate database.
 *
 *     images/{train,val,test}/<archive>__<image>__<x>_<y>.jpg
 *     labels/{train,val,test}/<archive>__<image>__<x>_<y>.txt
 *     test/tiles.json
 *     data.yaml
 *
 * Each image is resampled to `--dpt` (its native DPT when absent) and cut into
 * `detector.canvas` tiles. The held-out images named in `holdout.json` go to
 * `test`, and `test/tiles.json` records where each of their tiles sits in its
 * frame, with the frame's cars, so the evaluation can join tile detections
 * without recomputing the tiling.
 *
 * See SPEC.md § YOLO annotations. What goes where, and what is fatal, is
 * decided by `planArchive` in `yolo_rules.ts`; this script walks directories,
 * decodes images with `sharp`, writes what it is handed, and reports.
 *
 * This is **not** a revival of the parked CNN crop prep. That derivation is
 * blocked on a vocabulary v4 cannot produce; this one needs nothing v4 does not
 * already store.
 */

const USAGE = `Usage: pnpm --filter dataset run export:yolo -- [--in <dir>] [--out <dir>] [--dpt <n>]

  --in   Directory of .r49 archives, scanned recursively. Default: ./r49
         (a checkout of https://github.com/rails49/r49 works as-is)
  --out  Dataset root to write. Default: ./yolo — gitignored, and replaced
         wholesale on every run.
  --dpt  DPT to resample every image to. Default: each archive's native DPT.
`;

const HOLDOUT = new URL('../holdout.json', import.meta.url);

interface Options {
  readonly inDir: string;
  readonly outDir: string;
  readonly dpt: number | undefined;
}

function parseArgs(argv: readonly string[]): Options {
  let inDir = 'r49';
  let outDir = 'yolo';
  let dpt: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      // pnpm passes its own `--` separator through to the script.
      continue;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (arg === '--in') {
      inDir = argv[++i] ?? fail(`--in needs a directory\n\n${USAGE}`);
    } else if (arg === '--out') {
      outDir = argv[++i] ?? fail(`--out needs a directory\n\n${USAGE}`);
    } else if (arg === '--dpt') {
      dpt = Number(argv[++i]);
      if (!(dpt > 0)) fail(`--dpt needs a positive number\n\n${USAGE}`);
    } else {
      fail(`unrecognized argument ${JSON.stringify(arg)}\n\n${USAGE}`);
    }
  }

  return { inDir: path.resolve(inDir), outDir: path.resolve(outDir), dpt };
}

function fail(message: string): never {
  throw new Error(message);
}

/**
 * Every `.r49` under `dir`, in sorted order so a run is reproducible.
 *
 * Recursive because the corpus keeps its archives one level down, in
 * `fixtures/` — pointing `--in` at a checkout root has to work.
 *
 * `Dirent.parentPath` carries the containing directory, and was named `path`
 * before Node 20.12. @types/node no longer declares the old name, but the
 * runtime pinned here still only emits it, so both are read: taking the new
 * name alone loses the subdirectory **silently**, exporting nothing and
 * reporting no error, rather than failing.
 */
async function findArchives(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.r49'))
    .map(e => path.join(e.parentPath ?? (e as { path?: string }).path ?? dir, e.name))
    .sort();
}

/**
 * Empties the output directory, refusing anything that is not obviously a
 * previous export.
 *
 * Stale files left from an earlier run would be trained on — Ultralytics reads
 * whatever is in `images/`, not whatever this run wrote — so the tree has to be
 * replaced rather than merged into. The `data.yaml` check is what keeps a
 * mistyped `--out` from deleting a directory that was never ours.
 */
async function resetOutDir(outDir: string): Promise<void> {
  const existing = await fs.readdir(outDir).catch(() => null);
  if (existing === null) {
    await fs.mkdir(outDir, { recursive: true });
    return;
  }
  if (existing.length > 0 && !existing.includes('data.yaml')) {
    fail(
      `refusing to replace ${outDir}: it is not empty and holds no data.yaml, so it ` +
        `is not a previous export. Point --out somewhere else, or empty it yourself.`
    );
  }
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
}

/** A held-out frame, as `test/tiles.json` records it. */
interface TestFrame {
  readonly stem: string;
  readonly dpt: number;
  readonly width: number;
  readonly height: number;
  readonly cars: readonly Span[];
  readonly tiles: readonly { readonly stem: string; readonly x: number; readonly y: number }[];
}

interface Tally {
  archives: number;
  imagesExported: number;
  tiles: number;
  imagesSkipped: number;
  cars: number;
  emptyFrames: number;
  cornersClamped: number;
  readonly perSplit: Record<Split, number>;
  readonly warnings: string[];
  readonly testFrames: TestFrame[];
  readonly held: Set<string>;
}

async function exportArchive(
  file: string,
  outDir: string,
  dpt: number | undefined,
  holdout: ReadonlySet<string>,
  tally: Tally
): Promise<void> {
  const archiveName = path.basename(file, '.r49');
  const archive = await R49Archive.load(await fs.readFile(file));

  const decode: ImageDecoder = async filename => {
    const bytes = await archive.getImage(filename);
    if (bytes === null) return null;
    const { width, height } = await sharp(Buffer.from(bytes)).metadata();
    return { width: width ?? 0, height: height ?? 0 };
  };

  const manifest = archive.getManifest();
  const plan = await planArchive(archiveName, manifest, decode, { dpt, holdout });
  if (plan.kind === 'fatal') fail(plan.reason);

  // Every fatal image is named before anything of this archive is written.
  const fatal = plan.images.flatMap(image => (image.kind === 'fatal' ? image.reasons : []));
  if (fatal.length > 0) fail(fatal.join('\n'));

  for (const image of plan.images) {
    if (image.kind !== 'exported') {
      tally.imagesSkipped++;
      continue;
    }

    // Decoded once to raw pixels at the target size; each tile is cut from that.
    const bytes = (await archive.getImage(image.filename))!;
    const { data, info } = await sharp(Buffer.from(bytes))
      .resize(image.size.width, image.size.height)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const raw = { width: info.width, height: info.height, channels: info.channels };

    for (const tile of image.tiles) {
      const width = Math.min(DETECTOR_CANVAS, image.size.width - tile.x);
      const height = Math.min(DETECTOR_CANVAS, image.size.height - tile.y);
      // Padded on the right and bottom, never resized (ADR 0014), in
      // Ultralytics' own fill.
      await sharp(data, { raw })
        .extract({ left: tile.x, top: tile.y, width, height })
        .extend({
          right: DETECTOR_CANVAS - width,
          bottom: DETECTOR_CANVAS - height,
          background: { r: 114, g: 114, b: 114 },
        })
        .jpeg({ quality: 95 })
        .toFile(path.join(outDir, 'images', image.split, `${tile.stem}.jpg`));
      await fs.writeFile(
        path.join(outDir, 'labels', image.split, `${tile.stem}.txt`),
        tile.lines.length > 0 ? `${tile.lines.join('\n')}\n` : ''
      );
      tally.cornersClamped += tile.cornersClamped;
      tally.tiles++;
    }

    if (image.split === 'test') {
      tally.held.add(`${manifest.id}/${image.filename}`);
      tally.testFrames.push({
        stem: image.stem,
        dpt: image.dpt,
        ...image.size,
        cars: image.cars,
        tiles: image.tiles.map(({ stem, x, y }) => ({ stem, x, y })),
      });
    }

    tally.warnings.push(...image.warnings);
    tally.cars += image.cars.length;
    if (image.cars.length === 0) tally.emptyFrames++;
    tally.perSplit[image.split]++;
    tally.imagesExported++;
  }

  tally.archives++;
}

/** `data.yaml`, the file Ultralytics is actually pointed at. */
function renderDataYaml(outDir: string): string {
  const names = DETECTOR_CLASSES.map((name, i) => `  ${i}: ${name}`).join('\n');
  return [
    '# GENERATED by dataset/src/yolo_export.ts — do not edit.',
    '#',
    '# Derived from .r49 archives; regenerate rather than patching. `path` is',
    '# absolute because Ultralytics resolves a relative one against its own',
    '# settings directory, not against this file.',
    '#',
    '# ⚠️  The class list is APPEND-ONLY (config.yaml § detector.classes): an',
    '# index here is a position in trained weights.',
    '',
    `path: ${outDir}`,
    'train: images/train',
    'val: images/val',
    'test: images/test',
    '',
    'names:',
    names,
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const { inDir, outDir, dpt } = parseArgs(process.argv.slice(2));
  const holdout = new Set<string>(JSON.parse(await fs.readFile(HOLDOUT, 'utf8')));

  const archives = await findArchives(inDir).catch(() => {
    fail(`cannot read ${inDir}. Pass --in <dir> pointing at a directory of .r49 archives.`);
  });
  if (archives.length === 0) {
    fail(`no .r49 archives under ${inDir}`);
  }

  await resetOutDir(outDir);
  await fs.mkdir(path.join(outDir, 'test'));
  for (const split of ['train', 'val', 'test'] as const) {
    await fs.mkdir(path.join(outDir, 'images', split), { recursive: true });
    await fs.mkdir(path.join(outDir, 'labels', split), { recursive: true });
  }

  const tally: Tally = {
    archives: 0,
    imagesExported: 0,
    tiles: 0,
    imagesSkipped: 0,
    cars: 0,
    emptyFrames: 0,
    cornersClamped: 0,
    perSplit: { train: 0, val: 0, test: 0 },
    warnings: [],
    testFrames: [],
    held: new Set(),
  };

  for (const file of archives) {
    await exportArchive(file, outDir, dpt, holdout, tally);
  }

  await fs.writeFile(
    path.join(outDir, 'test', 'tiles.json'),
    `${JSON.stringify({ canvas: DETECTOR_CANVAS, frames: tally.testFrames }, null, 2)}\n`
  );
  for (const entry of holdout) {
    if (!tally.held.has(entry)) {
      tally.warnings.push(`holdout.json names ${entry}, which this export did not find`);
    }
  }

  await fs.writeFile(path.join(outDir, 'data.yaml'), renderDataYaml(outDir));

  for (const warning of tally.warnings) {
    console.warn(`⚠️  ${warning}`);
  }

  console.log(
    [
      `Exported ${tally.imagesExported} images (${tally.cars} cars) from ${tally.archives} archives.`,
      `  train ${tally.perSplit.train} / val ${tally.perSplit.val} / test ${tally.perSplit.test} images`,
      `  ${tally.tiles} tiles`,
      `  ${tally.imagesSkipped} images skipped: not labeled_complete`,
      `  ${tally.emptyFrames} exported frames carry no cars (all-background samples)`,
      `  ${tally.cornersClamped} corners clamped to a tile edge`,
      `  → ${path.join(outDir, 'data.yaml')}`,
    ].join('\n')
  );

  // A run that produced no validation images is not a smaller dataset, it is a
  // broken one — Ultralytics has nothing to score epochs against. Louder here
  // than a stack trace three minutes into training.
  for (const split of ['train', 'val'] as const) {
    if (tally.perSplit[split] === 0) {
      fail(
        `the ${split} split is empty. With ${tally.imagesExported} images and a ` +
          `val_split of ${DETECTOR_VAL_SPLIT}, every image hashed to the other side — ` +
          `export more archives, or change detector.val_split in config.yaml.`
      );
    }
  }
}

try {
  await main();
} catch (err) {
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
