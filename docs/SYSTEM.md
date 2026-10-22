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
| `lib/config/src/` | committed | TypeScript in this repository |

`bin/test.sh` regenerates `lib/config` into a temporary tree and fails on a
difference. The generator fails, naming the class, when a `detector.classes`
entry is not in the vocabulary (`lib/config/tests/generateConfig.test.ts`), and
fails if `classifier.labels` reappears (rails49/occupancy#8). Python reads
`config.yaml` and the package's data file directly. See ADR 0009.

## Workspace packages

`pnpm-workspace.yaml` covers `lib/*` and `dataset`. The `lib/*` packages are
consumed as TypeScript source; nothing under `lib/` is built or published yet.
`lib/CLAUDE.md` holds their interface rules. The `.r49` format package,
`@rails49/r49`, comes from npm at the version `pnpm-workspace.yaml` pins
(ADR 0018).

| Package | Described in |
| :--- | :--- |
| `@occupancy/config` | `lib/config/src/index.ts` (generated) |
| `@occupancy/detector` | `lib/detector/src/index.ts` |
| `@occupancy/classifier` | `lib/classifier/README.md` |

## Model files

Model files are gitignored. Nothing under `detector/models/` is tracked: the
package version names the model, and no model has been released. The
classifier's `classifier/resnet/models/version.txt` is tracked.
`bin/test.sh` downloads no model.

The detector package exposes `detector/models/detector_int8.ort` as its
`./model` exports entry, through the `lib/detector/models` link
([occupancy ADR 0019](https://github.com/rails49/occupancy/blob/main/docs/adr/0019-detection-and-training-move-to-rails49-detector.md)).
The link dangles in a clone with no model.
