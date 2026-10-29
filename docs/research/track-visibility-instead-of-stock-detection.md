# Track visibility as a fallback to stock detection

Written 2026-10-29. Research note on the question: instead of detecting cars, detect where track is
visible, and read occupied wherever it is not. Would that let a smaller, faster model do the job?
The stock detector stays; this note records the option as the fallback if the detector's compute
becomes a problem, and as something that could run beside it.

*Researched 2026-10-29. Sources: Ultralytics 8.4.115 source as installed in `detector/.venv`
(`cfg/models/26/*.yaml`, `nn/modules/head.py`, `utils/torch_utils.py`) and the Ultralytics task
docs; torchvision model docs; Amato et al. 2017 (CNRPark-EXT), de Almeida et al. 2015 (PKLot) and
Marek 2021 (ACPDS); this repo's `SPEC.md`, `config.yaml`, `docs/research/`, issues #25, #28, #33,
#36, #37, #39 and branches `prototype-track-metric` and `task/track-area`; occupancy's `SPEC.md`,
ADRs 0004, 0005, 0010, 0016 and `docs/research/image-change-detection.md`; control's
`docs/store/DRAWING.md`; r49's `FORMAT.md` and vocabulary. FLOPs and track length were measured
here; method in each section. No project code was changed.*

---

## Verdict

As a fallback, the idea holds, in one specific form: a small binary classifier run on fixed
crops placed along the track, each answering "is anything on this piece of track". That is the
parking-space formulation (one classifier per known space on a fixed camera) and close to
occupancy's parked option 2, with track geometry deciding where the crops go. Detecting track
itself, as boxes or as a segmentation mask, is not the form to use: OBB fits a long thin structure
poorly, and segmentation still pays for the whole frame.

The compute saving is real, but it does not come from track being easier to recognise than cars.
It comes from looking only at track pixels, in fixed small crops, with a small network. ResNet-18
at 96×96 over all the track costs about what YOLO26n-OBB costs over the whole layout. The
recommendation is YOLO26n-cls at 96×96 at DPT 20, crops rotated to the track direction, about 460
crops per frame on the 2×1 m N layout: about 35 GFLOPs per frame, against about 420 for YOLO26n-OBB
and about 5,800 for YOLO26l-OBB over the same layout.

Training labels can be derived from the existing car labels and `labeled_complete`, once the crop
positions exist in image pixels. Non-train obstructions are the exception: today's labels would
teach a hand on the track as free. The output is a per-spot state, which serves block-end sensors
but not L0: no car positions, counts or couplings. Nothing has measured its accuracy; #28's
per-section metric would compare it with the detector directly. The structural reason that ruled
out change detection does not apply to a learned classifier, only to one that compares against a
stored empty-track image. This is not a safety interlock.

---

## Legend

| Tag | Meaning |
|---|---|
| [DOC] | Official documentation (Ultralytics, torchvision). Link given. |
| [SRC] | Read from source code. File cited. |
| [LIT] | Published paper. |
| [REPO] | Read from or measured in this repo or a rails49 sibling. Path or issue given. |
| [MEAS] | Measured during this research. Method given. |
| [INF] | Inference or arithmetic. Argued, not sourced. |

---

## 1. What "detect track" can mean as a model task

Three formulations:

1. Track as an object (box or OBB). A track run has no natural extent: it ends where a car or the
   frame cuts it. This was tried on paper in 2026-07: a track class labeled as per-image spans,
   split where cars sit. Axis-aligned track boxes were 14–25% track at the corpus's median 32°
   track angle, and swallowed neighbouring tracks (`docs/research/issue-4-label-derivation.md` §2.3)
   [REPO]. OBB fixes the fill but keeps the problem that the box is defined by what interrupts it.
   Occupancy's SPEC also rules out a track class as a check on the stock detector: "a missed car
   on confidently detected track is a confident false clear, and the two failures are correlated"
   (occupancy `SPEC.md` § Confidence) [REPO].
2. Semantic segmentation of track pixels. Ultralytics 8.4 ships it as `yolo26-sem`
   (`cfg/models/26/yolo26-sem.yaml`, head `SemanticSegment` in `nn/modules/head.py`) [SRC]. The head
   predicts at stride 8 and upsamples bilinearly; the docs warn that thin structures look jagged at
   low `imgsz` ([semantic task docs](https://docs.ultralytics.com/tasks/semantic/)) [DOC]. Labels are
   class-ID PNG masks, or polygons converted on load [DOC]. Measured cost per 2048² tile, fused, in
   Ultralytics' FLOPs (2 × multiply-adds, `utils/torch_utils.py:553`) [MEAS]:

   | Model | GFLOPs per 2048² tile | Params |
   |---|---|---|
   | YOLO26n-OBB (current family) | 70.3 | 2.4 M ([OBB docs](https://docs.ultralytics.com/tasks/obb/)) |
   | YOLO26n-sem | 50.9 | 1.6 M ([semantic docs](https://docs.ultralytics.com/tasks/semantic/)) |
   | YOLO26n-seg (instance) | 106.3 | 2.7 M ([segment docs](https://docs.ultralytics.com/tasks/segment/)) |
   | YOLO26l-OBB (current baseline, #25) | 961.4 | 25.6 M |

   Semantic segmentation saves 28% per tile at nano size. It still runs over every tile of the
   frame, and a mask still has to be reduced to per-spot answers along the track [INF].
3. Per-spot classification along known track. Place crops at fixed positions on the track and
   classify each as occupied or free. Cost scales with track length, not frame area. This is what
   parking-occupancy systems do (§3), and it is the form the rest of this note uses.

Formulation 3 does not need the model to recognise track as such. It is trained on "free" and
"occupied" crops and learns whatever separates them. Whether it treats anything other than clean
track as occupied depends on the training data (§6) [INF].

## 2. Where the track geometry comes from

The crops need the track's position and direction in image pixels. What exists:

- The `.r49` format stores no track (occupancy [ADR 0010](https://github.com/rails49/occupancy/blob/main/docs/adr/0010-track-is-not-stored.md);
  r49 `FORMAT.md` has no track field at `3c388bf`) [REPO].
- control's layout file, `layouts/<name>.drawing.yaml`, holds topology, block lengths in mm,
  turnout and sensor addresses, and a schematic placement on a grid with 90° rotations
  (control `docs/store/DRAWING.md` § Geometry, ADR-0018) [REPO]. It has no positions in layout mm or
  image pixels, so it cannot place crops by itself. It does name what control consumes: one sensor
  per block end, addressed `<block>.<end>`, and "nothing above the layout interface learns detector
  geometry" (DRAWING.md § Hardware ids) [REPO].
- Image-pixel track for the ceiling layout has been approximated twice from the car labels: #28
  joins every labelled span of `ceiling-2026-10-28` (branch `prototype-track-metric`), and #33 maps
  the 1,026 spans of both ceiling archives to layout mm through each archive's calibration
  homography and adds hand-traced track where no car stood (branch `task/track-area`,
  `track_area.py`) [REPO]. Track that never carried a car is missing from the first and traced in
  the second.

I found no other image-space track geometry in `~/rails49`. If a layout plan with track positions
in layout mm exists elsewhere, `track_area.py`'s homography maps it to each archive's pixels,
"z ignored, good to about 3%" [REPO]. Track on a grade or bridge sits off the calibration plane
and shifts in the image; occupancy's ADR 0015 corrects scale for height but not position [REPO].

How many crops. Track length on the ceiling layout, from the labelled spans in layout mm [MEAS]:
the skeleton of a one-gauge-wide band drawn along every span is 16.9 m (pixel count, which
undercounts diagonals), and the band's area divided by its width is 30.0 m (which overcounts,
since label jitter widens the band). #33's car-width band gives 0.446 m² / 18.8 mm = 23.7 m before
its exclusions [REPO, INF]. This note uses 20 m.

A 96 px crop at DPT 20 in N spans 4.8 gauges = 43 mm. With the stride equal to the crop, 20 m
needs about 460 crops; with the stride at half the crop, as `SPEC.md` § CNN crops uses for
training, about 925 [INF]. A crop of 43 mm is also close to the section length at which #28 found
false clear at couplings mostly closes (30–50 mm) [REPO].

Camera movement affects every method alike and is left out here.

## 3. The parking-space literature

The closest published task is parking-space occupancy on a fixed camera, with each space marked
once in image coordinates.

- PKLot: about 12,400 images and 695,899 space crops from three lots (de Almeida et al., *PKLot –
  A robust dataset for parking lot classification*, Expert Systems with Applications 42(11):4937,
  2015, [doi:10.1016/j.eswa.2015.02.009](https://doi.org/10.1016/j.eswa.2015.02.009)) [LIT].
- Amato et al., *Deep learning for decentralized parking lot occupancy detection*, Expert Systems
  with Applications 72:327, 2017 ([draft](https://falchi.isti.cnr.it/Draft/2017-ESWA-Draft.pdf))
  [LIT]. Spaces are cut from the frame by fixed per-camera masks. mAlexNet has three conv and two
  fully connected layers, takes a 224×224 crop of one space, and is "three orders of magnitude"
  smaller than AlexNet. Trained and tested on the same dataset, the two differ by at most 1%.
  mAlexNet reaches 98.27% on PKLot UFPR04→PUC and 90.1–90.7% on the harder CNRPark split. 50
  spaces took about 15 s on a Raspberry Pi 2.
- Marek, *Image-Based Parking Space Occupancy Classification: Dataset and Baseline* (ACPDS,
  [arXiv:2107.12207](https://arxiv.org/abs/2107.12207)) [LIT]. 293 images, 11,236 space views, 48%
  occupied, split by lot. Spaces are quadrilaterals given as region proposals to a ResNet-50. A
  crop per space (128×128) reaches 97.97% on the test lots; one shared pass with pooled features
  reaches 98.51%. The author prefers the crop design for deployment. He also notes crops cannot
  share information, which may hurt under occlusion.

What this says here [INF]: a per-space binary classifier on a fixed camera works with a network far
smaller than a general detector, and crops lose little against a shared pass. The 98% figures
are short of this project's bar, as `docs/research/yolo-detection-accuracy.md` §2 already notes for
the detector. They are outdoor, oblique and in ACPDS cross-lot. Nothing published measures this
task.

## 4. Does "easier task → smaller, faster model" hold?

The current costs, from the repo:

- YOLO26n-OBB INT8 `.ort`: 120–445 ms per 960×544 frame in the browser (`SPEC.md` § Inference
  cost). At canvas 2048 the whole 2×1 m layout at DPT 20 is 6 tiles (#33) [REPO].
- #37 dropped the browser: WASM runs about 0.06 TFLOP/s on the iPhone 16, so model n at DPT 20,
  about 0.31 TFLOP per refresh, takes about 5 s per frame [REPO].
- The baseline accuracy model is YOLO26l-OBB (#25); #39 aims for enough accuracy with n [REPO].

Cost per frame at DPT 20, Ultralytics FLOPs convention (2 × multiply-adds) [MEAS, INF]. torchvision
lists ResNet-18 at "1.81 GFLOPS" and MobileNetV3-Small at "0.06" at 224², which count
multiply-adds ([ResNet-18](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.resnet18.html),
[MobileNetV3-Small](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.mobilenet_v3_small.html))
[DOC]; THOP here gives 1.82 and 0.062 G multiply-adds, so they are doubled below.

| Model | Input | GFLOPs per crop or tile | Per frame, 460 crops | Per frame, 925 crops |
|---|---|---|---|---|
| ResNet-18 (parked classifier) | 144² | 1.59 | 730 | 1,470 |
| ResNet-18 | 96² | 0.67 | 310 | 620 |
| ResNet-18 | 64² | 0.30 | 140 | 280 |
| ResNet-18 cut after `layer2` | 96² | 0.37 | 170 | 340 |
| YOLO26n-cls | 96² | 0.076 | 35 | 70 |
| MobileNetV3-Small | 96² | 0.026 | 12 | 24 |
| YOLO26n-OBB, whole layout | 6 × 2048² | 70.3 | 420 | |
| YOLO26n-OBB, track strips only (#33: 4–12 Mpx) | | | 70–200 | |
| YOLO26n-sem, whole layout | 6 × 2048² | 50.9 | 305 | |
| YOLO26l-OBB, whole layout | 6 × 2048² | 961 | 5,770 | |

Notes:

- The parked classifier trains on 144² crops but runs on 96² (`config.yaml`
  `classifier.crop_size: 96`, `cnn.crop_size_prep: 144` for jitter) [REPO].
- Ultralytics docs give YOLO26n-OBB as 14.8 GFLOPs at 1024² ([OBB docs](https://docs.ultralytics.com/tasks/obb/))
  [DOC]; measured here 15.1 fused, 16.9 unfused per the YAML comment [MEAS, SRC]. YOLO26n-cls is
  0.4 GFLOPs at 224² ([classify docs](https://docs.ultralytics.com/tasks/classify/)) [DOC].
- 64² at DPT 20 is DPT 13 in effect, below `layout.min_dpt`. That floor was set for placing cars,
  not for classifying a spot whose position is given; nothing has measured either [INF].

What the table shows [INF]:

- The saving comes from looking only at track, and from the backbone. ResNet-18 at 96² over all
  the track (310 GFLOPs) costs about what YOLO26n-OBB costs over the whole layout (420). YOLO26n-cls or
  MobileNetV3-Small at 96² come to 12–35× below n-OBB over the whole layout.
- That a binary per-spot task tolerates such a small network is supported by mAlexNet (§3), not by
  any evidence that track is easier to see than cars.
- Segmentation does not get there: YOLO26n-sem is 28% below n-OBB per tile and still covers every
  tile.
- Shared pass or separate crops. 460 crops of 96² are 4.2 Mpx, the low end of #33's 4–12 Mpx of
  strips. So one shared pass of the same backbone over strips costs about the same as the crops,
  and brings back the variable input shapes #33 lists as a cost of strips. A shared pass over the
  whole frame with the off-track pixels masked costs the whole frame: #33 and #39 note that
  blanking pixels inside a tile saves nothing. YOLO26n-cls's backbone over 25 Mpx would be about
  200 GFLOPs, six times the crops. Separate crops, batched into one call with a fixed batch size,
  are the cheaper and simpler choice.
- In the browser at #37's 0.06 TFLOP/s, 35 GFLOPs is about 0.6 s per frame, against about 5 s for
  n-OBB. This is arithmetic, not a measurement. `SPEC.md` § Inference cost notes a fixed overhead
  per call, which batching the crops avoids.

## 5. Recommended model

YOLO26n-cls at 96×96, binary (occupied, free), ImageNet-pretrained, static INT8.

- Crops at DPT 20, 43 mm square in N, centred on the track and rotated so the track runs along the
  crop's x axis. The parked classifier keeps crops axis-aligned because it gets a point with no
  orientation (`SPEC.md` § CNN crops); with track geometry the direction is known. Rotation hurt the
  detector: models trained on `ceiling-2026-10-28` found 45% of the cars in `ceiling-2026-10-29`,
  "fewer the steeper the car" (commit `c680a25`) [REPO]. Aligned crops remove that variable [INF].
- Why YOLO26n-cls over MobileNetV3-Small: it trains and exports through the same Ultralytics
  pipeline the detector already uses (`detector/train.py`, `detector/export_onnx.py`, whose static
  INT8 path works), and it costs 35 GFLOPs per frame, already a twelfth of n-OBB over the whole
  layout. MobileNetV3-Small is a third of that again, and the alternative if it is still too slow
  [INF].
- Train ResNet-18 at 96² on the same crops once, as a reference. If YOLO26n-cls matches it on
  held-out spots, keep the smaller model [INF].
- Size: 2.8 M parameters, so about 3 MB at INT8, against about 11 MB for the parked ResNet-18 [INF].

## 6. Labels

The SPEC says v4 "cannot produce a trainable CNN dataset" because every crop centre derived from a
car span lies on a car, and it names the way back: "a crop centre that meets no span is a verified
negative" under `labeled_complete` (`SPEC.md` § v4 cannot produce a trainable CNN dataset) [REPO].
With crop positions on the track, this is a fixed rule over existing data:

- For each `labeled_complete` image and each spot, the spot is occupied if any part of its centre
  segment along the track lies inside a car's box (span, car width), and free otherwise. This is
  the L1 rule extended over the spot's length, as #28's section rule is [INF].
- Free is verified: `labeled_complete` asserts no car is unlabeled (occupancy `SPEC.md` § Labeling
  completeness) [REPO].
- No new annotation per image. Track positions are drawn once per camera position, or derived from
  the cars plus tracing as #33 did [REPO].

Rough size [INF]: 36 labelled ceiling images × about 460 spots ≈ 16,500 crops. The 1,026 cars have
a median length of 79 mm [MEAS], about 2.3 m of car per image on 20 m of track, so roughly 10–15%
occupied. The crops are highly correlated: 11 images of `ceiling-2026-10-29b` share one arrangement
(commit `c455864`). `dataset/holdout.json` holds out whole images, which keeps neighbouring spots of
one frame on one side.

The gap is non-train obstructions. A hand or tool on the track in a `labeled_complete` image carries
no label, so the rule above marks it free and the model learns to call it free. The r49 vocabulary
has only `stock` and its children (`packages/r49/src/data.json`) [REPO]. Reading obstructions as
occupied needs either a class outside `stock` (an r49 release, org ADR-0022) labeled as boxes, or
images with obstructions labeled by hand at spot level. Without such examples the classifier's
answer on a hand is untrained, though a crop that looks unlike free track is more likely to read
occupied [INF].

## 7. Failure modes and what the output can serve

The change-detection verdict was negative because the stored reference must adapt to light but not
to a stopped train, which makes false trips and missed trains persist (occupancy
`docs/research/image-change-detection.md` §5, [ADR 0016](https://github.com/rails49/occupancy/blob/main/docs/adr/0016-image-change-does-not-decide-occupancy.md))
[REPO]. A classifier trained offline and run frame by frame keeps no reference, so that reason does
not apply. It would apply in full to a version that compares each crop with a stored empty-track
image [INF].

Remaining failure modes [INF unless marked]:

- Couplings. A few mm of track show between two cars. With the spot rule in §6 a spot spanning a
  coupling is occupied. #28 found that 947 of 1015 false-clear positions for the detector were at
  car ends and couplings, and that 30–50 mm sections close most of them [REPO]. A real gap shorter
  than a spot also reads occupied, which is the direction occupancy's ADR 0005 accepts.
- Train ends. Position resolution is one spot, 43 mm. #28 shows the trade-off between section
  length and how precisely a train's end is placed [REPO].
- Adjacent track. Parallel centres are 33 mm apart and a car is 18.8 mm wide (#33) [REPO]. A 43 mm
  crop reaches 21.5 mm either side, so a car on the next track's near edge, at 23.6 mm, sits just
  outside it. Obliquity widens cars by up to 1.5–2.6× at the frame corners (occupancy `SPEC.md` §
  Camera height) [REPO], which puts them in the crop. Derived labels teach the model to ignore the
  neighbour, but these are the hardest crops. A crop narrower across the track than along it would
  help.
- Turnouts, crossings, track of another colour or ballast: each is a different "free" appearance
  with few examples per layout. Spots there need enough training samples.
- Tunnels and hidden track: no spot, or a spot that is always unknown. A car detector cannot see
  there either.
- Shadows, glare, dirt: a classifier trained across the lighting in the corpus should cope; one
  not trained on them will lean toward occupied. `ceiling-2026-10-29` and `-29b` include sunlight
  and changing light [REPO].
- Correlation with the detector. A car that looks like its track (low contrast) is hard for both.
  Occupancy's SPEC names a "CNN verifier over the same points" as a possible independent observer
  but does not claim independence [REPO].

Outputs. The detector produces L0, car poses with confidences, and L1, sensor states computed from
L0 (detector `SPEC.md` § The runtime reports detections; occupancy ADR 0005) [REPO]. A per-spot
classifier produces sensor states directly. That serves control, which reads one sensor per block
end [REPO]. It cannot produce L0: no car positions, lengths, counts or couplings, and no box off
the track. Occupancy's glossary defines L1 as "computed from L0 alone", and ADR 0004 loads one
model in the live path [REPO]. Using the classifier for sensor states changes both definitions.
Losing car counts is accepted as a cost of this option.

## 8. When to use it, and running it beside the detector

When to switch [INF]:

- The hardware on #37's shortlist cannot run the detector the accuracy campaign picks (n or l) at
  the station rate, at the DPT it needs.
- #39's lever of last resort is needed: computing only on part of the field. The classifier does
  this by construction and keeps fixed input shapes.
- A rate the detector cannot reach somewhere, such as the short 10 Hz bursts at critical places that #33
  and #39 mention.

Before relying on it: score it on the held-out images with #28's metric (false clear and false
occupied per section length) next to the detector. Both can be scored on the same track points.

Side by side [INF]. ADR 0004 would need revisiting for any of these.

- By region: the classifier where only block occupancy is needed or a high rate is needed, the
  detector where positions and counts are needed.
- By rate: the classifier every frame on the track, the detector less often for L0. This fits #36
  and #39's per-region rates.
- Both on the same spots: occupied if either says occupied, matching ADR 0005's bias. Every
  disagreement is a candidate hard example for the next labelling round. This lowers misses only
  as far as the two models fail on different cars.

---

## What I could not determine

- A layout file with track positions in layout mm or image pixels. control's drawing is a
  schematic; r49 stores none. If one exists outside `~/rails49`, §2's homography maps it.
- Accuracy of any per-spot classifier on this layout. Nothing has been trained.
- Whether YOLO26n-cls or MobileNetV3-Small keeps its accuracy at static INT8; the detector's INT8
  path is known to work, the classifiers' is not measured here.
- Latency on the shortlisted native runtimes (Core ML, QNN) for 460 crops batched: not measured.

## Sources

Ultralytics:
- Source, ultralytics 8.4.115: `cfg/models/26/yolo26-sem.yaml`, `yolo26-seg.yaml`, `yolo26-obb.yaml`,
  `yolo26-cls.yaml`; `nn/modules/head.py` (`SemanticSegment`); `utils/torch_utils.py` (`get_flops`).
- Docs: [OBB](https://docs.ultralytics.com/tasks/obb/), [segment](https://docs.ultralytics.com/tasks/segment/),
  [semantic](https://docs.ultralytics.com/tasks/semantic/), [classify](https://docs.ultralytics.com/tasks/classify/).

torchvision:
- [ResNet-18](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.resnet18.html),
  [MobileNetV3-Small](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.mobilenet_v3_small.html).

Papers:
- de Almeida, Oliveira, Silva Jr, Britto Jr, Koerich, *PKLot – A robust dataset for parking lot
  classification*, ESWA 42(11):4937–4949, 2015 — <https://doi.org/10.1016/j.eswa.2015.02.009>
- Amato, Carrara, Falchi, Gennaro, Meghini, Vairo, *Deep learning for decentralized parking lot
  occupancy detection*, ESWA 72:327–334, 2017 — <https://doi.org/10.1016/j.eswa.2016.10.055>,
  draft at <https://falchi.isti.cnr.it/Draft/2017-ESWA-Draft.pdf>
- Marek, *Image-Based Parking Space Occupancy Classification: Dataset and Baseline* —
  <https://arxiv.org/abs/2107.12207>

Measurements made here (scripts not committed):
- FLOPs: each model built from its YAML or torchvision constructor, fused where Ultralytics fuses,
  profiled with THOP at the stated input; Ultralytics' `get_flops` doubles multiply-adds, and the
  torchvision rows are doubled to match.
- Track length: the 1,026 spans of `ceiling-2026-10-28` and `ceiling-2026-10-29` mapped to layout
  mm with each archive's calibration homography, drawn one gauge wide at 2 px/mm; skeleton pixel
  count and area ÷ width.

This repo and siblings: `SPEC.md`, `config.yaml`, `docs/research/issue-4-label-derivation.md`,
`docs/research/yolo-detection-accuracy.md`, `docs/research/issue-3-browser-yolo-feasibility.md`,
`dataset/holdout.json`, issues #25, #28, #33, #36, #37, #39, branches `prototype-track-metric` and
`task/track-area`; occupancy `SPEC.md`, `GLOSSARY.md`, ADRs 0004, 0005, 0010, 0016,
`docs/research/image-change-detection.md`; control `docs/store/DRAWING.md`, ADR-0018; r49
`FORMAT.md`, `packages/r49/src/data.json`.
