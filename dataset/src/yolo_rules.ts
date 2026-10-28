import crypto from 'node:crypto';
import { DETECTOR_CANVAS, DETECTOR_CLASSES, DETECTOR_VAL_SPLIT } from '@detector/config';
import {
  carWidthPx,
  convexIntersectionArea,
  detectorClassIndex,
  spanCorners,
  spanToPolygon,
  tileOrigins,
  tileOverlapPx,
} from '@rails49/detector';
import { getDPT, type ManifestData, type Point } from '@rails49/r49';

/**
 * The rules of the YOLO OBB export, with no filesystem in it.
 *
 * `planArchive` decides everything about one archive — which images go, to
 * which split, under which stem, with which label lines, what to warn about,
 * and what is fatal — and `yolo_export.ts` only walks directories and writes
 * what it is handed. The image decoder is a parameter, so a test can state a
 * decoded size without `sharp` and the rules are pinned by assertions rather
 * than by a run over a corpus.
 *
 * Each image is resampled to the target DPT and cut into canvas-sized tiles
 * (ADR 0014); every tile carries the cars whose box reaches into it, clamped
 * to the tile.
 *
 * The one hard gate is `labeled_complete`: an image whose labeling a human has
 * not vouched for is skipped whole, because a single unlabeled car in an
 * exported frame teaches the detector that cars are background, and that loss
 * is shared across the image so it cannot be scoped away per class. Everything
 * else that could drop a car is fatal instead.
 *
 * The car box itself is **not** here. `carWidthPx` and `spanToPolygon` are
 * `@rails49/detector`'s, which is the only way the UI's archive diagnostics
 * can draw ground truth in the browser — this module imports `node:crypto` at
 * the top for the split — and the only way the width constant that biases
 * boxes toward `occupied` has one home rather than two.
 */

/**
 * Which side of the split an image falls on. `test` holds the held-out
 * images, which are named rather than hashed.
 */
export type Split = 'train' | 'val' | 'test';

/** The size an image decodes to, in pixels. */
export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Decodes the named image far enough to know its size.
 *
 * @returns `null` when the archive does not carry the image.
 */
export type ImageDecoder = (filename: string) => Promise<ImageSize | null>;

/** A car span in the resampled frame's pixels. */
export interface Span {
  readonly id: string;
  readonly p0: Point;
  readonly p1: Point;
}

/** One canvas-sized piece of an exported image. */
export interface TilePlan {
  /** Shared by the tile's image file and its label file; Ultralytics pairs them by it. */
  readonly stem: string;
  /** The tile's top-left corner in the resampled frame. */
  readonly x: number;
  readonly y: number;
  /** One per car whose box reaches into the tile. Empty is an all-background sample. */
  readonly lines: readonly string[];
  /** Corners `spanToPolygon` moved onto the tile edge. */
  readonly cornersClamped: number;
}

/** What the export does with one manifest image. */
export type ImagePlan =
  | {
      /** Not `labeled_complete`: left out whole. */
      readonly kind: 'skipped';
      readonly filename: string;
    }
  | {
      readonly kind: 'exported';
      readonly filename: string;
      readonly split: Split;
      /** The image's own stem, which each tile stem extends. */
      readonly stem: string;
      /** The DPT the image is resampled to. */
      readonly dpt: number;
      /** The resampled frame, `camera.resolution` scaled from native to `dpt`. */
      readonly size: ImageSize;
      /** Every car, in the resampled frame. */
      readonly cars: readonly Span[];
      readonly tiles: readonly TilePlan[];
      readonly warnings: readonly string[];
    }
  | {
      /** Exporting it would drop a car, or it cannot be exported at all. */
      readonly kind: 'fatal';
      readonly filename: string;
      readonly reasons: readonly string[];
    };

/** What the export does with one archive. */
export type ArchivePlan =
  | { readonly kind: 'planned'; readonly images: readonly ImagePlan[] }
  | {
      /** Nothing in the archive can be exported, whatever its images hold. */
      readonly kind: 'fatal';
      readonly reason: string;
    };

/** How `planArchive` exports. */
export interface PlanOptions {
  /** The fraction hashed to `val`. Defaults to `detector.val_split`. */
  readonly valSplit?: number;
  /** The DPT to resample to. Absent keeps the archive's native DPT. */
  readonly dpt?: number;
  /** Held-out images, as `<archive id>/<filename>`; these go to `test`. */
  readonly holdout?: ReadonlySet<string>;
}

/**
 * The export of one archive, decided without writing anything.
 *
 * Images are planned in manifest order, and every fatal image is reported
 * rather than only the first, so one run names every fix an archive needs.
 * Skipped images are not decoded.
 *
 * @param archiveName The archive's basename without `.r49`; it qualifies every
 *        stem and keys the split.
 */
export async function planArchive(
  archiveName: string,
  manifest: ManifestData,
  decode: ImageDecoder,
  { valSplit = DETECTOR_VAL_SPLIT, dpt: targetDpt, holdout = new Set() }: PlanOptions = {}
): Promise<ArchivePlan> {
  // Width comes from DPT, so an uncalibrated archive has no derivable box at
  // all. Fatal rather than skipped: silently exporting five of six archives is
  // how a training run ends up quietly smaller than the corpus it named.
  const dpt = getDPT(manifest);
  if (dpt === null) {
    return {
      kind: 'fatal',
      reason:
        `${archiveName}: no DPT — its calibration has no pair of points at equal height, ` +
        `so car width cannot be derived. Calibrate it in the editor, or move it out of --in.`,
    };
  }
  // Resampling up would invent pixels the camera never recorded.
  if (targetDpt !== undefined && targetDpt > dpt) {
    return {
      kind: 'fatal',
      reason: `${archiveName}: native DPT ${dpt.toFixed(1)} is below the target DPT ${targetDpt}.`,
    };
  }
  const outDpt = targetDpt ?? dpt;
  const scale = outDpt / dpt;
  const widthPx = carWidthPx(outDpt);
  const overlapPx = tileOverlapPx(outDpt);
  const frame = manifest.camera.resolution;
  const size = { width: Math.round(frame.width * scale), height: Math.round(frame.height * scale) };

  const images: ImagePlan[] = [];
  for (const image of manifest.images) {
    const { filename } = image;
    if (!image.labeled_complete) {
      images.push({ kind: 'skipped', filename });
      continue;
    }

    const where = `${archiveName}/${filename}`;
    const reasons: string[] = [];
    const warnings: string[] = [];

    const decoded = await decode(filename);
    if (decoded === null) {
      reasons.push(`${archiveName}: manifest names ${filename}, which the archive does not contain`);
    } else if (decoded.width !== frame.width || decoded.height !== frame.height) {
      // Labels are authored in the camera frame, so that is what normalizes
      // them. A decoded size that disagrees means the two have come apart and
      // every box in this image is scaled wrong — worth saying loudly, but not
      // worth failing on: the frozen v4 test fixture pairs a real declared
      // resolution with a 1x1 placeholder image on purpose.
      warnings.push(
        `${where}: camera.resolution is ${frame.width}x${frame.height} ` +
          `but the image decodes as ${decoded.width}x${decoded.height}; labels were normalized ` +
          `against camera.resolution`
      );
    }

    const cars: { span: Span; classIndex: number; corners: readonly Point[] }[] = [];
    for (const label of image.labels) {
      const classIndex = detectorClassIndex(label.class);
      if (classIndex === null) {
        reasons.push(
          `${where}: label ${label.id} has class ` +
            `${JSON.stringify(label.class)}, which no entry of detector.classes ` +
            `[${DETECTOR_CLASSES.join(', ')}] is a segment-prefix of. Dropping it would ` +
            `train this car as background — fix the class, or append its root to ` +
            `detector.classes in config.yaml and regenerate.`
        );
        continue;
      }

      const span = {
        id: label.id,
        p0: { x: label.p0.x * scale, y: label.p0.y * scale },
        p1: { x: label.p1.x * scale, y: label.p1.y * scale },
      };
      try {
        cars.push({ span, classIndex, corners: spanCorners(span, widthPx) });
      } catch (err) {
        reasons.push(`${where}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (reasons.length > 0) {
      images.push({ kind: 'fatal', filename, reasons });
      continue;
    }

    const stem = outputStem(archiveName, filename);
    const tiles: TilePlan[] = [];
    for (const y of tileOrigins(size.height, overlapPx)) {
      for (const x of tileOrigins(size.width, overlapPx)) {
        const tile = rectangle(
          x,
          y,
          Math.min(DETECTOR_CANVAS, size.width - x),
          Math.min(DETECTOR_CANVAS, size.height - y)
        );
        const lines: string[] = [];
        let cornersClamped = 0;
        for (const car of cars) {
          if (convexIntersectionArea(car.corners, tile) === 0) continue;
          const shifted = {
            id: car.span.id,
            p0: { x: car.span.p0.x - x, y: car.span.p0.y - y },
            p1: { x: car.span.p1.x - x, y: car.span.p1.y - y },
          };
          const box = spanToPolygon(shifted, widthPx, { width: DETECTOR_CANVAS, height: DETECTOR_CANVAS });
          cornersClamped += box.clamped;
          lines.push(labelLine(car.classIndex, box.corners));
        }
        tiles.push({ stem: `${stem}__${x}_${y}`, x, y, lines, cornersClamped });
      }
    }

    images.push({
      kind: 'exported',
      filename,
      split: holdout.has(`${manifest.id}/${filename}`) ? 'test' : splitFor(archiveName, filename, valSplit),
      stem,
      dpt: outDpt,
      size,
      cars: cars.map(car => car.span),
      tiles,
      warnings,
    });
  }

  return { kind: 'planned', images };
}

/** An axis-aligned rectangle as a polygon. */
function rectangle(x: number, y: number, width: number, height: number): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/** One label file line: the class index, then the eight normalized corners. */
function labelLine(classIndex: number, corners: readonly number[]): string {
  // Six decimals is ~0.01 px at 1920 wide — below what anyone can click, and
  // short enough that the label files stay readable.
  return [classIndex, ...corners.map(c => c.toFixed(6))].join(' ');
}

/**
 * The split an image belongs to, decided by a hash of its identity rather than
 * by counting.
 *
 * Deterministic in the archive and filename alone, so re-exporting never
 * reshuffles, adding an archive never moves an existing image, and two machines
 * exporting the same corpus agree. This is the discipline the retired crop
 * pipeline used, moved up one level: it keyed on the individual marker, and the
 * unit here is the **image**, because two cars in one frame must not land on
 * opposite sides.
 */
function splitFor(archive: string, filename: string, valSplit: number): 'train' | 'val' {
  const digest = crypto.createHash('md5').update(`${archive}:${filename}`).digest('hex');
  const bucket = parseInt(digest.slice(0, 8), 16) % 100;
  return bucket < valSplit * 100 ? 'val' : 'train';
}

/**
 * The output stem for an image, qualified by its archive.
 *
 * Every archive in the corpus names its images `image-0.jpeg`, so the archive
 * has to be in the name or the sixth `image-0` silently overwrites the first
 * five. Ultralytics pairs a label to its image by stem, so both files take this
 * one.
 */
function outputStem(archive: string, filename: string): string {
  const imageStem = filename.replace(/\.[^./\\]+$/, '');
  return `${sanitize(archive)}__${sanitize(imageStem)}`;
}

/** Anything that is not a filename character, collapsed to `-`. */
function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '-');
}
