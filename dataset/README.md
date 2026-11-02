# Occupancy Dataset Preparation

Tools for deriving training data from `.r49` railroad layout archives: the
**detector** export.

## Scripts

### `pnpm run export:yolo` — the detector dataset

Derives the Ultralytics OBB layout directly from a directory of archives, with
no intermediate database:

```bash
pnpm --filter dataset run export:yolo -- --in r49 --out yolo
```

`--in` defaults to `r49` and is scanned recursively; `--out` defaults to `yolo`
and is **replaced wholesale** on every run (it refuses to delete a directory
that holds no `data.yaml`, so a mistyped `--out` cannot eat your home
directory). Both are gitignored. Point `--in` at a checkout of
[`rails49/r49`](https://github.com/rails49/r49); the labels live there, not here.
Its `archives/` is empty for now, and `--in` takes any directory of `.r49`
files.

Every image is resampled to the target DPT, `detector.dpt`; `--dpt <n>`
resamples to DPT `n` instead. An archive whose native DPT is below it is fatal:
training never upsamples.
Each image is decoded to raw pixels first and then resized with sharp's
default, Lanczos3 (`src/yolo_pixels.ts`), so libjpeg never takes part of a
large reduction while decoding. `detect` resamples with `resample` from
`@rails49/detector`, which reproduces that resize; `tests/resample.test.ts`
compares the two.

```
yolo/
  data.yaml                                         path/train/val/test + the class names
  images/{train,val,test}/<archive>__<image>__<x>_<y>.jpg   one canvas tile
  labels/{train,val,test}/<archive>__<image>__<x>_<y>.txt   class + 8 normalized corners
  test/tiles.json                                   each held-out tile's place in its frame, and the frame's cars
```

The rules it applies are `SPEC.md` § YOLO annotations:

* **`labeled_complete` is the one hard gate.** An image a human has not vouched
  for is skipped whole — one unlabeled car in an exported frame teaches the
  detector that cars are background, and that loss is shared across the image
  so it cannot be scoped away per class. A complete image with *no* cars is
  legitimate and exports an empty label file: it is an all-background sample.
* **Everything else that could drop a car is fatal**, never a silent skip: a
  class no entry of `detector.classes` prefixes, an uncalibrated archive (no
  DPT means no derivable width), a zero-length span, a missing image.
* **Width is derived, not stored** — `DPT × standard_width / standard_gauge`.
  The scale ratio cancels, so a car is 2.09 track-widths wide in every scale.
* **Every image is cut into `detector.canvas` tiles** overlapping by
  `detector.tile_overlap_mm`, converted to pixels like car width. A frame
  smaller than the canvas is one tile, padded on the right and bottom. The
  positions are `inputLayout`'s, from `@rails49/detector`, which `detect` cuts
  its input with too.
* **The held-out images are named** in `holdout.json`, as `<archive id>/<filename>`,
  and go to `test`. The rest **split by image and by hash**, so re-exporting
  reshuffles nothing and two cars in one frame cannot land on opposite sides.
  Ratio: `detector.val_split`.
* A tile carries every car whose box reaches into it. Corners are **clamped**
  into the tile; Ultralytics rejects a label file carrying one outside, and a
  clamped box beats no box. The run reports how many moved.
* An image that decodes at another size than `camera.resolution` **warns** and
  still exports: its labels are normalized against `camera.resolution`.

`src/yolo_rules.ts` holds all of these as one function, `planArchive`: a
manifest and an image decoder in, and per image the split, the resampled size,
the tiles with their label lines, and warnings, or the reasons it is fatal. Nothing in it touches the
filesystem or `sharp`, and it is where the tests point; `src/yolo_export.ts`
only walks directories, decodes, writes what it is handed and reports, and
names every fatal image of an archive before writing any of it. The car box itself is not there: `carWidthPx` and `spanToPolygon`
are `@rails49/detector`'s, so that the width constant has one home and occupancy's
UI can draw ground truth beside detections without importing `node:crypto`.

## Directory Structure

There are no `.r49` archives here any more (rails49/occupancy#63). The corpus,
for training and testing, is the `archives/<handle>/<slug>.r49` tree of
[`rails49/r49`](https://github.com/rails49/r49), which takes submissions by pull
request under CC BY 4.0. That tree is empty for now. The archives used today
are ceiling captures in a local folder outside git (rails49/r49#51). No number derived from them
predicts model accuracy (`SPEC.md` § Accuracy). Training reads archives from a
local directory passed as `--in`.

*   `yolo/`: The generated detector dataset (gitignored; `export:yolo` writes
    it). `data.yaml` names an absolute path, so it is machine-specific by
    construction — regenerate rather than copy it.
*   `r49/`: The default `--in`, if you keep a corpus checkout here (gitignored).
*   `src/yolo_export.ts`, `src/yolo_rules.ts`: the detector export and its rules
    (the car box is `@rails49/detector`'s).
