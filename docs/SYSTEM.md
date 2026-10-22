# System

What the repository does now, across its stages. Each package's `README.md` or
`src/index.ts` describes that package. `SPEC.md` describes the target, which
this is not.

## The pipeline

Each directory is a stage in one data path. Two branches share one corpus: the
detector path runs, and the classifier path is parked at its first arrow.

```
.r49 archives (rails49/r49)         v4: layout photos, calibration, labels
        │
        ├── dataset/src/yolo_export.ts   labeled_complete gate, OBB spans
        │       ▼
        │   dataset/yolo/                Ultralytics OBB layout, 80/20 by image
        │       │  detector/train.py       YOLO26n-OBB fine-tune from DOTA
        │       ▼
        │   detector/runs/.../best.pt
        │       │  detector/export_onnx.py ONNX → static INT8 → .ort
        │       ▼
        │   detector/models/             detector_int8.ort (not in git)
        │       │
        │       └─▶ lib/detector/         loadDetector → L0
        │               │
        │               └─▶ occupancy's ui/   occupancy() → L1
        │
        └── parked: no crop derivation runs (rails49/occupancy#8, rails49/occupancy#18)
                ▼
            dataset/data/                144×144 crops, data.csv
                │  classifier/resnet/TRAIN.ipynb   ResNet-18 → ONNX → ORT
                ▼
            classifier/resnet/models/    model_int8.ort + config.json (not in git)
                │
                └─▶ nothing loads it (occupancy ADR 0004)
```

The archives live in [`rails49/r49`](https://github.com/rails49/r49), not here
(rails49/occupancy#63). Its `fixtures/` tree holds six archives, 46 images with
calibration and no labels, below `layout.min_dpt`. They exercise the code and
are not training data.

`dataset/README.md` covers the export and its gates. `detector/README.md`
covers training and export.

## Configuration

`config.yaml` holds the parameters that must agree across stages. The format's
constants (standard gauge, scale ratios, class vocabulary) are in
`@rails49/r49`'s data file (rails49/occupancy#181). `pnpm config:generate`
reads both and writes:

| Output | Tracked? | Read by |
| :--- | :--- | :--- |
| `config.json` | gitignored | the model export |
| `lib/config/src/` | committed | `dataset` |
| `lib/detector/src/generated.ts` | committed | `@rails49/detector`, which is published and so imports no workspace package |

`bin/test.sh` regenerates both into a temporary tree and fails on a
difference. The generator fails, naming the class, when a `detector.classes`
entry is not in the vocabulary (`lib/config/tests/generateConfig.test.ts`), and
fails if `classifier.labels` reappears (rails49/occupancy#8). Python reads
`config.yaml` and the package's data file directly. See ADR 0009.

## Workspace packages

`pnpm-workspace.yaml` covers `lib/*` and `dataset`. `@rails49/detector` is
built to `dist/` and published from a tag (`README.md` § Releasing); the other
`lib/*` packages are consumed as TypeScript source and not published.
`lib/CLAUDE.md` holds their interface rules. The `.r49` format package,
`@rails49/r49`, comes from npm at the version `pnpm-workspace.yaml` pins
(org [ADR-0022](https://github.com/rails49/.github/blob/main/docs/adr/0022-the-r49-format-is-r49s-and-each-consumer-pins-it.md)).

| Package | Described in |
| :--- | :--- |
| `@detector/config` | `lib/config/src/index.ts` (generated) |
| `@rails49/detector` | `lib/detector/src/index.ts` |
| `@detector/classifier` | `lib/classifier/README.md` |

## Model files

Model files are gitignored. Nothing under `detector/models/` is tracked: the
package version names the model, and no model has been released. The
classifier's `classifier/resnet/models/version.txt` is tracked.
`bin/test.sh` downloads no model.

The detector package's build copies `detector/models/detector_int8.ort` into
`dist/`, which its `./model` exports entry names
([occupancy ADR 0019](https://github.com/rails49/occupancy/blob/main/docs/adr/0019-detection-and-training-move-to-rails49-detector.md)).
With no model the build copies nothing, and the packed package has no
`./model` entry.
