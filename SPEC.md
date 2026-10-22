# Detector requirements

This file holds the requirements for the detector side of [rails49 occupancy](https://github.com/rails49/occupancy). The rest of the system's requirements, the occupancy output, calibration and labeling among them, are in occupancy's [`SPEC.md`](https://github.com/rails49/occupancy/blob/main/SPEC.md). Terms are defined in [`GLOSSARY.md`](GLOSSARY.md) and decisions are recorded in [`docs/adr/`](docs/adr/) ([ADR 0001](docs/adr/0001-glossary-and-adrs-alongside-the-spec.md)). It describes the target. Parts of it are not built yet, and each such part says so.

## The detector is YOLO26n-OBB

Settled in [rails49/occupancy#3](https://github.com/rails49/occupancy/issues/3) (feasibility) and [rails49/occupancy#10](https://github.com/rails49/occupancy/issues/10) (licensing).

| | |
| :--- | :--- |
| Family | Ultralytics YOLO26n-OBB, fine-tuned from the pretrained DOTA checkpoint |
| Head | Oriented bounding box; NMS-free, exported `end2end: True` |
| Output tensor | `[1, 300, 7]`, a fixed 300-slot buffer every frame |
| Input | one square canvas at constant DPT (see [Input geometry](#input-geometry-is-dpt-normalized)) |
| Quantization | static INT8 |
| Shipped artifact | `.ort`, 3.30 MiB measured, against the 25 MiB Cloudflare Pages limit |
| Runtime | `onnxruntime-web`, WASM execution provider |

The oriented head is required. [The occupancy test](https://github.com/rails49/occupancy/blob/main/SPEC.md#the-occupancy-test) is a point inside the car's own oriented box, so orientation is an output the model must produce. It costs 2.5% in model size and about 1% in FLOPs.

Quantization must be static INT8. Dynamic quantization emits `ConvInteger`, which the CPU execution provider does not implement. Static quantization needs calibration data; ten corpus images were enough. FP16 does not help on a CPU or WASM target.

The training and export pipeline lives in `detector/`.

### Input geometry is DPT-normalized

Decided in [ADR 0014](docs/adr/0014-dpt-normalized-input-padded-never-resized.md) ([rails49/occupancy#130](https://github.com/rails49/occupancy/issues/130)). Not built: `detector.input: [960, 544]` still ships, and [#10](https://github.com/rails49/detector/issues/10) is open.

Requirements:

* One square canvas, authored as a `config.yaml` constant, replaces `detector.input`. Its size is never derived from the corpus.
* Every image is resampled to a constant DPT and padded onto the canvas, never resized. See [YOLO annotations](#yolo-annotations-for-the-detector).
* A capture larger than the canvas is tiled into canvas-sized tiles. The overlap between tiles is longer than the longest car. With stride `T − O`, a car of length `L` lies whole inside some tile when `L ≤ O`.
* Tile detections are joined in full-frame coordinates. Since any covering detection reads occupied, adding boxes can turn clear into occupied but never the reverse. Tiling can add phantoms but cannot cause a false clear.
* Export stays static at the canvas size. A dynamic export was measured to work through INT8 and `.ort` and is kept as a fallback.
* The format sees none of this. v4 gains no field, and the editor and live view draw in full-frame image pixels. Normalization and tiling happen between a frame arriving and occupancy being computed, and detections are mapped back into the frame's own coordinates. Two things reach the user, both already present: the `min_dpt` bar at capture, and inference cost growing with tile count.

The canvas size is not set yet. The `end2end` head's anchor floor bounds it from below (`H·W ≥ ~14,629` px, measured). Training memory bounds it from above; [rails49/occupancy#128](https://github.com/rails49/occupancy/issues/128) measured that ceiling on the M2.

### Licensing: the project is AGPL-3.0

The project and its trained weights are AGPL-3.0, because the detector is fine-tuned from AGPL weights ([ADR 0003](docs/adr/0003-agpl-because-the-detector-is-fine-tuned-from-agpl-weights.md), [rails49/occupancy#10](https://github.com/rails49/occupancy/issues/10)). The change is forward-only: the earlier MIT snapshot stays MIT. There is still no CLA and no contributor gate. If the detector family changes, the licence is reconsidered.

*Not legal advice. If this becomes commercial, the Ultralytics Enterprise licence question returns.*

## Accuracy

Accuracy must be high enough to avoid collisions.

Models can be trained per layout, so only modest generalization is needed: recognizing trains at layout positions absent from the training data, or rolling stock the model has not seen. On that basis more than 99.9% should be achievable. That is still not enough for prototype trains, where accidents cost far more.

No automated test checks a model's accuracy ([ADR 0007](docs/adr/0007-no-automated-model-gate.md)). A figure above 99.9% needs a held-out evaluation, and that waits on a higher-DPT corpus. Do not add a substitute gate.

Safety: nothing here may be presented as a safety interlock. The detector does sometimes miss rolling stock and report phantom trains.

## Parameters live in `config.yaml`

```yaml
layout:
  standard_width: 3000.0      # prototype mm — widest real stock (SBB RAm TEE I)
  min_dpt: 20                 # warns persistently, never blocks

detector:
  input: [960, 544]           # superseded — see below
  confidence_threshold: 0.25  # placeholder — needs held-out recall
  classes: ["stock"]          # YOLO class index order — append-only
```

The format's own constants are not this project's and do not live here (org [ADR-0022](https://github.com/rails49/.github/blob/main/docs/adr/0022-the-r49-format-is-r49s-and-each-consumer-pins-it.md), rails49/occupancy#181). The standard gauge, the scale table and the vocabulary sit in `@rails49/r49`'s data file ([FORMAT.md § Scales and gauge](https://github.com/rails49/r49/blob/main/FORMAT.md#scales-and-gauge), [§ The vocabulary](https://github.com/rails49/r49/blob/main/FORMAT.md#the-vocabulary)), and the config generator reads them from the installed package.

The vocabulary is what the context menu offers and what a label's `class` must match. `classes` **is** the YOLO class list, verbatim and index-ordered, and every entry must name a class in the vocabulary — the generator fails, naming the class, when one does not. A label maps to the longest entry of `classes` that is a segment-prefix of its class, so `stock` matches `stock.loco.steam` but never `stockyard`; the same rule resolves an overriding `width_mm`. Adding a subtype to `classes` therefore re-maps every already-labeled car of that subtype with **no relabeling**.

> ⚠️ **`classes` is append-only.** A list position *is* a YOLO class index, so reordering or deleting an entry invalidates trained weights while the file still validates. It is the one config edit that can break a model with nothing noticing.

**`detector.input` is superseded** by [rails49/occupancy#130](https://github.com/rails49/occupancy/issues/130) and shown above only because it is what the code still reads. It becomes a **single square canvas side** plus the target DPT — an authored `[w, h]` pair is the wrong *shape* of parameter once image size falls out of layout extent × DPT rather than being chosen. See [Input geometry](#input-geometry-is-dpt-normalized) for why square, why authored rather than derived, and what bounds its value.

The `stock.` root is required rather than cosmetic: a new car is `stock` and refinements must roll up to it, so an unrooted class would match no entry and be dropped from the export — the unlabeled-car-as-background failure [Labeling completeness](https://github.com/rails49/occupancy/blob/main/SPEC.md#labeling-completeness) exists to prevent. The root never appears in the UI; the context menu renders its children.

**`config.yaml` is authored; every other representation is generated and verified.** Exports assert against it and abort on mismatch, and nothing writes a vocabulary back — which is why `classifier.labels` was deleted rather than corrected, being a key nothing could check. TypeScript reaches these values through a **generated, committed** `lib/config` package emitted by `pnpm config:generate`, with a staleness check in `bin/test.sh`; `@rails49/r49` reads the gauge, the scale-to-ratio table, its scale enum and the vocabulary from its own data file, not from `lib/config`. Python reads `config.yaml` directly, and the package's data file for the gauge.

The detector runs entirely in the browser via ONNX Runtime; the application is fully client-side with no backend.

## Deriving Training Data

Settled in [rails49/occupancy#4](https://github.com/rails49/occupancy/issues/4); the full working is in [`docs/research/issue-4-label-derivation.md`](docs/research/issue-4-label-derivation.md).

Car labels are the single source of truth. Every model input is derived from them by a fixed rule, and no second annotation format is kept by hand. A relabel regenerates everything downstream.

### YOLO annotations, for the detector

Built in `dataset/src/yolo_export.ts`, except the resampling, padding and tiling, which wait on [#10](https://github.com/rails49/detector/issues/10).

* Only `labeled_complete` images are exported. This is the one hard gate (see [Labeling completeness](https://github.com/rails49/occupancy/blob/main/SPEC.md#labeling-completeness)). Ultralytics states the same requirement: *"All instances of all classes in all images must be labeled. Partial labeling will not work."*
* The class index is the position in `detector.classes` of the longest entry that is a dotted prefix of the label's `class` ([ADR 0009](docs/adr/0009-config-yaml-is-authored-and-classes-is-append-only.md); see [Parameters](#parameters-live-in-configyaml)). A label that matches no entry is a fatal export error, never a silent drop: a dropped car is an unlabeled car.
* The geometry is the oriented box: centre and orientation from the `p0`–`p1` chord, length from its magnitude, width from `DPT × standard_width / standard_gauge`. Normalization into the detector's input frame is generated, not stored.
* Images are resampled to the target DPT, then padded onto the canvas and never resized ([ADR 0014](docs/adr/0014-dpt-normalized-input-padded-never-resized.md)).
* A capture larger than the canvas is tiled, with overlap longer than the longest car. A car cut by a tile boundary is clipped and labeled, not dropped. Dropping it would teach the model that part of a car is not a car, and so blind it to a car half outside the camera's frame, which no overlap can fix.

### CNN crops, for the classifier

Kept because the ResNet stays retrainable. Nothing loads it today.

* Fixed stride along the span, in canonical 20-DPT pixels, endpoint-inclusive and deterministic: `s = crop_size / 2 = 48`.
* Crops stay axis-aligned whatever the span's orientation. At inference the classifier only receives a query point, a `layout.sensors` entry, never an orientation, so a rotated training crop would not match what it is asked.
* A crop's labels come from every span intersecting it, not only the span that generated it. This is why the format needs no occlusion rule.
* Projects ~2718 crops against 959 today.

### v4 cannot produce a trainable CNN dataset, and that is known

Established in [rails49/occupancy#8](https://github.com/rails49/occupancy/issues/8). v4 stores only car spans, so every derivable crop centre lies on a car and every crop gets the same tag. The vocabulary collapses to one tag with no negatives. This is why `classifier.labels` was deleted from `config.yaml`.

The route back is to sample background crops as verified negatives. `labeled_complete` asserts no car is unlabeled, so a crop centre that meets no span is a verified negative. That changes the negative distribution and invalidates any gate built on the old one, so it is an experiment to run, and it stays dormant while the ResNet does. Until then the CNN derivation above has no corpus to run on.

---

*The accuracy campaign and the input geometry are [#2](https://github.com/rails49/detector/issues/2), which is open.*
