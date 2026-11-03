# Cutting detector compute on a mostly static scene

Research for [#36](https://github.com/rails49/detector/issues/36), under
[Map: hardware for live detection at ≥1 Hz](https://github.com/rails49/detector/issues/31).
Written 2026-10-29.

Sources are papers, vendor documentation and standards, linked at each claim.
Figures marked [calc] are arithmetic done here from `config.yaml` and the
Ultralytics FLOPs table; the method is shown. Statements marked [inference]
are argued, not sourced. Nothing here was measured on a device.

## Summary

Ranked by the saving expected on the 2×1 m N layout:

| Rank | Technique | Expected saving | Cuts the worst frame? | Main way it causes a miss |
| ---: | :--- | :--- | :--- | :--- |
| 1 | Crop to the chosen strips of track | 2–14× against full-layout tiles, set by chosen track length | yes | a car partly outside the strip, or lost context at the crop edge |
| 2 | Run only the blocks that changed since the model last saw them | 3–15× on average while one or two trains move; none when the whole frame changes | no | a change below the threshold: a low-contrast car creeping, or a threshold raised to hide codec noise |
| 3 | Different rates per region | 1.5–2× against everything at 2 Hz; 5–10× against the 10 Hz goal | yes | a car seen late in a slow region; a car whole only in a slow region's crop |
| 4 | FP16 or INT8 | 1.3–2× where the hardware has the matching units; none on old CPUs | yes | INT8 shifts confidences, so a marginal parked car falls below the threshold on every frame |
| 5 | A smaller canvas | none: 1024 needs 0.9–3× the pixels of 2048 | no | (none of its own; it adds overlap) |
| 6 | Temporal feature reuse inside the network | 3–8× reported, GPU only, custom kernels | no | thresholded deltas drop small changes |
| 7 | Tracking between detector runs | little at 1–2 Hz | no | a car that enters between runs is not tracked |
| 8 | A small model gating a large one | none that is safe | — | the small model's miss is never re-examined |

Three findings cut across the list.

1. Re-running the model on unchanged pixels buys no accuracy. The project's
   finding that misses on parked stock repeat frame to frame means a second
   run on the same input returns the same miss. Skipping unchanged blocks
   loses nothing; the only risk is calling a block unchanged when it is not.
2. Only cropping, per-region rates, quantization, a smaller model and a lower
   DPT reduce the worst frame. Change gating and the techniques after it
   reduce the average. The requirement bounds frame period plus latency
   variation, so the hardware must still finish the worst frame (a lighting
   change touches every block) within the budget, unless that frame is
   allowed to run late. Gating's gain is power and heat, and headroom toward
   10 Hz, not a smaller device [inference].
3. Because a miss on a parked car repeats, every check below counts misses per
   car on the held-out images, not per frame or as an average score. One car
   lost to INT8 or to a crop is lost for as long as it stays parked.

## Context

The map's requirement, as revised by the map owner on 2026-10-29:

* Stations: frame period plus latency variation ≤ 1 s. A train enters at
  50 mm/s and must stop within 50 mm. Rate about 1–2 Hz.
* Shunting areas: ≤ 2 s, at 25 mm/s. Rate 1 Hz.
* ≥ 1 Hz is the floor. 10 Hz is a goal to cost, not a requirement. Other track
  may run below 1 Hz; that conflicts with the floor and is the map owner's to
  settle.

At 2 Hz a station train moves 25 mm between frames, and a shunting train at
1 Hz moves 25 mm. At DPT 20 that is 56 px, so a moving train changes many
pixels per frame [calc: 25 mm × 20 / 8.96875 mm gauge].

Geometry, from `config.yaml` and [SPEC § Input geometry](../../SPEC.md#input-geometry-is-dpt-normalized):

* Canvas `T` = 2048 px. Overlap `O` = DPT × 30000 / 1435 px: 418, 523 and
  690 px at DPT 20, 25 and 33. A car of length up to `O` lies whole in some
  tile.
* An N car is 18.75 mm wide (3000 mm / 160) and up to 187.5 mm long
  (30000 mm / 160). At DPT 20 that is 42 × 418 px.
* The layout is 2000 × 1000 mm. At DPT 20 it is 4460 × 2230 px.

Compute per model run, from the Ultralytics YOLO26-OBB table at 1024 px:
YOLO26n-obb 14.8 GFLOPs, YOLO26l-obb 232.4 GFLOPs
([Ultralytics OBB docs](https://docs.ultralytics.com/tasks/obb/)). A
convolutional network's cost scales with input pixels, so a 2048 tile costs
four times that: about 59 and 930 GFLOPs [calc].

Full-layout tiling with one camera over the whole layout [calc]:

| DPT | Tiles at 2048 | Layout Mpx | Canvas Mpx | Canvas ÷ layout | GFLOPs per frame, n | GFLOPs per frame, l |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 3 × 2 = 6 | 9.9 | 25.2 | 2.5 | 355 | 5,578 |
| 25 | 4 × 2 = 8 | 15.5 | 33.6 | 2.2 | 474 | 7,437 |
| 33 | 5 × 3 = 15 | 27.1 | 62.9 | 2.3 | 888 | 13,944 |

Tiles per axis are `ceil((L − O) / (T − O))`. Overlap and the padded part of
the last tile in each row make the model process 2.2–2.5 times the layout's
pixels.

## SPEC's statement on tiling, checked

[SPEC § Inference cost](../../SPEC.md#inference-cost) says: "Region-of-interest
or tiled inference saves no time: N tiles cost the same convolution work plus N
times the fixed overhead, and cropping to the model's fixed input only
upsamples the region. Cropping saves time only by discarding part of the
layout."

The statement was written for the old input: one 960 × 544 letterbox of the
whole frame. There, cropping a region and scaling it to the same fixed input
costs the same run. Under ADR 0014 the model sees constant DPT, so a crop is
never upsampled, and the last sentence becomes the useful one: the map lets the
detector see only chosen areas of track, so discarding the rest of the layout
is allowed. Cropping to strips is that case. It saves in proportion to the area
dropped.

One part of the statement understates tiling's cost. N tiles do not cost "the
same convolution work": with overlap and edge padding they cost 2.2–2.5 times
the layout's pixels at the 2048 canvas (table above). Strips need overlap only
along the track, so they carry less of this overhead.

## 1. Cropping to strips of track

What it is. Cut the frame to the chosen track areas and run the model only
there, at the same DPT. Two ways:

* Skip whole tiles. Keep the 2048 grid and run only tiles that touch a chosen
  area. Saving depends on where the track lies: with chosen areas in every
  part of the layout it may be none.
* Pack strips. Cut each chosen stretch of track into axis-aligned rectangles a
  little wider than a car, overlap them by `O` along the track, and pack them
  onto 2048 canvases with padding between them. This keeps ADR 0014's one
  square canvas. A rectangular static export (for example 2048 × 128) also
  works for YOLO when both sides are multiples of 32, and meets the `end2end`
  head's floor of ~14,629 px ([SPEC § Input geometry](../../SPEC.md#input-geometry-is-dpt-normalized)),
  but it would be a second export to train and check [inference].

Width. A straight strip needs the car width plus a margin: about 30 mm. On a
curve a car's chord cuts inside the rail. On a 250 mm radius a 187.5 mm car
sits up to `R − √(R² − (L/2)²)` = 18 mm inside the centreline at its middle
[calc], so a curved strip needs about 50 mm. Diagonal and curved track in
axis-aligned rectangles wastes more; 100 mm is the pessimistic case below.

Expected saving [calc]: pixels = track length × strip width, times
`T / (T − O)` for the overlap along the track, width rounded up to 32 px,
compared with full-layout tiles at 2048.

| Chosen track | Width | DPT 20 | DPT 25 | DPT 33 |
| ---: | ---: | ---: | ---: | ---: |
| 5 m | 50 mm | 14× | 11× | 12× |
| 5 m | 100 mm | 8× | 6× | 6× |
| 10 m | 50 mm | 7× | 6× | 6× |
| 10 m | 100 mm | 4× | 3× | 3× |
| 20 m | 50 mm | 3.5× | 2.8× | 3× |
| 20 m | 100 mm | 2× | 1.6× | 1.5× |

The chosen length comes from [#33](https://github.com/rails49/detector/issues/33).
At DPT 20, 10 m of 50 mm strip is 3.6 Mpx, about one 2048 canvas against six.

Deployed precedent. The parking-lot system of Amato et al. classifies only the
parking spaces: "Pictures captured by cameras are filtered by a mask that
identifies the various parking spaces. The mask was built manually once and
for all", and each space's patch is classified on a Raspberry Pi 2, 50 spaces
in about 15 s ([Amato et al. 2017, ESWA 72, draft PDF](https://falchi.isti.cnr.it/Draft/2017-ESWA-Draft.pdf)).
SBNet runs convolutions only on blocks of a mask, which may come "from a priori
problem knowledge", and reports wall-clock speed-ups with no noticeable
accuracy loss on LiDAR detection ([Ren et al., CVPR 2018](https://arxiv.org/abs/1801.02108)).

How it causes a miss.

* A car partly outside the strip: overhang on a curve tighter than the strip
  allows, a car on a track that was not chosen, a derailed car.
* Lost context. The model was trained on 2048 tiles with ballast and
  neighbouring track around each car. A narrow strip with padding at both
  sides is a different input [inference].
* A car cut at a strip end that is not overlapped by `O`, for example where a
  strip meets a turnout.

Check on held-out images. Replace every pixel outside the chosen areas with
the padding value, run `detector/evaluate.py` on the masked frames, and list
each car found in the full frame and missed in the masked one. Then cut the
strips as the runtime would, and list each labeled car in a chosen area that no
strip contains whole. Both lists must be empty. The held-out images must
include curves and turnouts for the second list to mean anything.

## 2. Running only what changed

What it is. Split each tile into small blocks. For each block keep the frame
the model last ran on (the reference). Run the model on a tile only when one of
its blocks differs from its reference by more than a threshold. For a tile that
is skipped, reissue its last detections with the new frame's capture time.

Two rules decide whether this is safe [inference]:

* Compare against the reference, not the previous frame. Reducto's pixel
  feature "finds pixels that changed value from the last frame" and compares
  consecutive frames ([Li et al., SIGCOMM 2020](https://www.cs.princeton.edu/~ravian/publications/reducto_sigcomm20.pdf), §4.4 and Table 8).
  Against consecutive frames a train creeping at 1 mm/s changes 0.2 px per
  frame at 10 Hz and DPT 20, below any threshold. Against the reference the
  change accumulates until it triggers. Update the reference only when the
  model runs.
* Threshold per block, not per tile. A whole car is 42 × 418 px at DPT 20,
  0.4% of a 2048 tile [calc]. A car that moves 5 mm changes two strips at its
  ends, about 2 × 11 × 42 ≈ 930 px, which is 0.02% of the tile but a third of
  a 32 × 32 block [calc]. A tile mean hides it; a block count does not.

Add a forced run of every tile at a fixed interval so that any change the gate
misses has a bounded life.

Expected saving. During normal running one or two trains move and touch one or
two of the 6–15 tiles, so 3–15× fewer runs on average [calc]. With strips
(technique 1) the unit is a strip, which makes the gate finer. A global change
(lighting, auto-exposure) triggers everything, so the worst frame costs the
same as without gating. It also makes compute vary frame to frame, which is
latency variation unless the schedule reserves time for the worst frame
[inference].

Evidence that it works, and where it failed:

* NoScope's difference detectors and cascades on fixed-camera video reached
  265× to 15,500× real time with accuracy within 1–5% of the reference
  network ([Kang et al., VLDB 2017](https://arxiv.org/abs/1703.02529)). The
  task was binary presence; 1–5% is far from this project's 99.9% target.
* Reducto filtered 51–97% of frames while meeting its accuracy targets
  ([Li et al., SIGCOMM 2020](https://www.cs.princeton.edu/~ravian/publications/reducto_sigcomm20.pdf), abstract).
  It also found that Glimpse's frame differencing with a static threshold "is
  almost never able to meet the target accuracy", even when 90% of the same
  camera's video was used to pick the threshold, because "the best filtering
  threshold depends heavily on video content" (Figure 2). On this
  layout the content that matters is narrow (cars on track), which is why the
  threshold below is tied to a displacement rather than tuned on video
  [inference].

What must still trigger a run, and how it can fail:

* Lighting change. A global change in brightness triggers every block. That
  costs a full frame but causes no miss. The risk is the fix: normalising
  blocks for global brightness, to stop slow daylight drift from triggering,
  can hide a local change that happens with it. Prefer re-taking the
  reference after each full run [inference]. Mains flicker in LED or
  fluorescent light adds frame-to-frame banding at short exposures; an
  exposure that is a whole number of flicker periods (10 ms at 50 Hz,
  8.33 ms at 60 Hz) avoids it [inference].
* Auto-exposure, white balance and focus. The camera changes the whole frame
  by itself, for example when a hand or a bright car enters. Lock them. On
  Apple platforms `AVCaptureDevice.ExposureMode.locked` is "a mode that locks
  exposure for the device"
  ([Apple](https://developer.apple.com/documentation/avfoundation/avcapturedevice/exposuremode-swift.enum/locked));
  white balance and focus have their own locked modes. In the browser the
  [W3C Image Capture spec](https://w3c.github.io/mediacapture-image/) defines
  `exposureMode: "manual"`, in which exposure parameters "are set to fixed
  absolute values", against `"continuous"` auto-exposure. Whether Safari
  honours it was not checked here.
* A slow or stopping train. Caught by comparing against the reference, not
  the previous frame. A stopping train in a station moves less and less; the
  last few millimetres matter for the 50 mm stop. Tie the threshold to a
  displacement: any car that moves more than, say, 5 mm from where the model
  last saw it must trigger. The hard case is a car whose colour is close to
  the ballast, where only couplers, wheels and gaps change [inference].
* Video compression noise. An H.264, HEVC or MJPEG stream (USB webcam, IP
  camera) changes static pixels from frame to frame, more at each intra
  frame. Raising the threshold above that noise is the change most likely to
  cause a miss. A phone's camera pipeline hands uncompressed frames to the
  app, so this applies to network and USB cameras [inference]. DeltaCNN's
  authors give the same remedy for sensor noise in their own gate: high
  thresholds with a dilated update mask
  ([DeltaCNN README](https://github.com/facebookresearch/DeltaCNN)).
* A hand. A hand is a large change and triggers. While it covers cars the
  model misses them, gate or no gate. When the hand leaves, the frame differs
  from the reference taken with the hand in it, so it triggers again.

Check on held-out images. The held-out set is stills, so it tests the gate
against single changes, not against time:

* Displacement: for each labeled car, shift the pixels inside its oriented box
  along its own axis by the smallest displacement that must trigger (5 mm),
  and confirm the gate flags the block. Report the lowest-contrast car.
  Repeat after re-encoding both images at the deployed codec quality.
* Lighting: scale brightness by ±10–30% and confirm every block triggers,
  then run `evaluate.py` on the scaled images; misses there are the model's,
  not the gate's.
* Determinism: run the model twice on the same tile and confirm identical
  output, which is what makes reissuing a skipped tile's detections exact.

The gate's temporal failures (auto-exposure hunting, codec noise between
frames, a creeping train) need a recorded clip from the live camera: a long
static stretch, a train stopping in a station, a hand. Count false triggers on
the static stretch and confirm every displacement above 5 mm triggered.

## 3. Different rates per region

What it is. Stations at 2 Hz, shunting areas at 1 Hz, other track at 1 Hz or
below, as the map now sets. Combined with technique 2, a region's rate becomes
the longest it may go without a run, and a change triggers a run at once.

Expected saving [calc]: compute ∝ Σ area × rate. If stations are 20% of the
chosen track, shunting 30% and other track 50%: against everything at 2 Hz,
(0.2 × 2 + 0.3 × 1 + 0.5 × 1) / 2 = 0.6, a 1.7× saving; 2.1× if other track
runs at 0.5 Hz. Against the 10 Hz goal everywhere the same mix saves about
8×. Unlike gating it lowers the worst frame. Remix runs differently sized
networks on non-uniform blocks of one frame within a latency budget and reports
up to 8.1× speed-up at accuracy on par with the reference
([Jiang et al., MobiCom 2021](https://air.tsinghua.edu.cn/__local/B/A9/65/7521EC4F2D0C61517822C548F6D_05E55CCC_247A7E7.pdf));
the MSR abstract gives up to 5.5×
([MSR](https://www.microsoft.com/en-us/research/?p=763831)). Remix also lets a
region use a smaller model, which here would be a miss risk in that region.

How it causes a miss. A car in a slow region is reported late; its L0 carries
the capture time, so the delay is visible, not hidden. A car near a region
boundary may lie whole only in the slow region's crop. A train that enters a
station from slow track is first seen at the slow rate unless the gate catches
it.

Check on held-out images. For every labeled car in a station or shunting area,
confirm that some crop of that region's rate contains it whole. The rates
themselves are a timing check, not an accuracy one.

## 4. FP16 and INT8

What it is. The shipped model is already static INT8 on the WASM CPU path,
where FP16 does not help ([SPEC § The detector is YOLO26n-OBB](../../SPEC.md#the-detector-is-yolo26n-obb)).
The question is how much precision buys on other hardware.

Expected saving, by hardware:

* NVIDIA (TensorRT, YOLOv8n): on a Jetson Orin NX 16 GB, 6.11 ms at FP32,
  3.18 ms at FP16, 2.30 ms at INT8; INT8 cost 0.04–0.05 mAP50-95 against FP16
  on COCO across A100, RTX 3080 and Orin NX
  ([Ultralytics TensorRT docs](https://docs.ultralytics.com/integrations/tensorrt/)).
  FP16 gives 1.9×, INT8 a further 1.4×.
* Apple Neural Engine: Core ML ML programs are FP16 by default, and the Neural
  Engine runs FP16; an FP32-typed model cannot use it
  ([coremltools typed execution](https://apple.github.io/coremltools/docs-guides/source/typed-execution.html)).
  INT8 weights and activations add "increased throughput possible for
  int8-int8 compute on Neural Engine" on A17 Pro and M4; weight-only
  quantization ran at about the FP16 latency in Apple's table
  ([coremltools quantization performance](https://apple.github.io/coremltools/docs-guides/source/opt-quantization-perf.html)).
  The page does not name the A18 (iPhone 16). The M2 Max is older than both
  named chips, so INT8 should not be expected to speed it up [inference].
* CPU (ONNX Runtime): "x86-64 with VNNI, GPU with Tensor Core int8 support and
  Arm-based processors with dot-product instructions can get better
  performance", and "it is not rare to get worse performance on old devices"
  ([ONNX Runtime quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html)).
  The 2017 i7 has no VNNI [inference].

How it causes a miss. Ultralytics warns that INT8 can shift confidences and
says to pick the operating threshold from the INT8 model's own F1 curve
([Ultralytics TensorRT docs](https://docs.ultralytics.com/integrations/tensorrt/)).
With the FP32 threshold, a car that was found with low confidence drops below
it. Parked cars are the likely victims, and the miss then repeats every frame.
Calibration also matters: NVIDIA's guidance via Ultralytics is "at least 500
calibration images"; the SPEC's ten images were enough to run, not shown to be
enough for accuracy.

Check on held-out images. Run `evaluate.py` with the FP32 model and with each
quantized model the hardware would use. List every car found by FP32 and
missed by the quantized model at the threshold the runtime will use, and plot
the confidence of found cars in both. The list must be empty, or each entry
explained. Quantize with calibration images that are not held-out images.

## 5. A smaller canvas

What it is. Tiles of 1024 or 640 px instead of 2048, at the same DPT.

Expected saving: negative. The overlap `O` is fixed in pixels by DPT, so a
smaller tile spends a larger share on overlap [calc]:

| DPT | 2048 | 1536 | 1024 | 640 |
| ---: | ---: | ---: | ---: | ---: |
| 20 | 25.2 Mpx | 18.9 | 22.0 | 70.0 |
| 25 | 33.6 | 35.4 | 57.7 | 360 |
| 33 | 62.9 | 75.5 | 189 | not possible: `O` = 690 px > 640 |

At DPT 20, 1536 and 1024 beat 2048 only because 2048 tiles fit this layout
badly (the second row of tiles is mostly padding). That is a fit to one
layout, not a trend. A smaller canvas does make each run shorter, which helps a
scheduler, and makes the gate (technique 2) finer, but blocks inside a tile do
that without the overlap cost.

If "smaller canvas" means fewer pixels per car, that is lower DPT: DPT 20
needs 2.7× fewer pixels than DPT 33 (9.9 against 27.1 Mpx). Whether DPT 20 is
accurate enough is [Map: the YOLO accuracy campaign](https://github.com/rails49/detector/issues/2)'s
question. Model size is the same: YOLO26l-obb costs 15.7× the FLOPs of
YOLO26n-obb ([Ultralytics OBB docs](https://docs.ultralytics.com/tasks/obb/)).

How it causes a miss. A re-export at a new canvas changes nothing the model
learned, but each tile now holds less context. Check: re-tile the held-out
frames at the new canvas, run `evaluate.py`, and list cars lost against 2048.

## 6. Temporal feature reuse inside the network

What it is. Recompute only the parts of each layer whose input changed.

* CBinfer, change-based CNN inference for static-camera video: 8.6× over
  cuDNN on a Tegra X1, accuracy loss below 0.1%, no retraining
  ([Cavigelli et al. 2017](https://arxiv.org/abs/1704.04313)).
* DeltaCNN: up to 7× over cuDNN "with only marginal differences in accuracy"
  ([Parger et al., CVPR 2022](https://arxiv.org/abs/2203.03996)). "All layers
  are implemented in CUDA, other devices are currently not supported", and the
  repository was archived in October 2023
  ([DeltaCNN README](https://github.com/facebookresearch/DeltaCNN)).
* Skip-Convolutions: about 3–4× lower cost on EfficientDet and HRNet with no
  accuracy drop ([Habibian et al., CVPR 2021](https://arxiv.org/abs/2104.11487)).
* Deep Feature Flow: runs the backbone on key frames and warps features by
  optical flow; on ImageNet VID 73.9 → 73.1 mAP at 5× speed
  ([Zhu et al., CVPR 2017](https://arxiv.org/html/1611.07715v2)). Its authors
  note that warping "may be inaccurate due to errors in flow estimation,
  object occlusion", and that a new key frame "should be allocated when the
  image content changes drastically".

Expected saving on this layout. Similar to technique 2 on average, finer
grained, but none of these runs on ONNX Runtime, Core ML or stock TensorRT, so
it means custom GPU kernels [inference]. Technique 2 gets most of the saving
with a stock runtime.

How it causes a miss. Each method drops deltas below a threshold, so a slow,
low-contrast change can stay below it, the same failure as technique 2 but
inside the network. Flow warping does not create objects that were not in the
key frame.

Check. On still images only an equivalence test is possible: run dense and
sparse inference on a held-out image pair made by the displacement test of
technique 2 and compare per-car output. The real check needs the recorded
clip.

## 7. Tracking between detector runs

What it is. Run the detector at a low rate and move its boxes between runs by
tracking or by the camera's motion data. Euphrates uses the image signal
processor's motion data to cut the number of CNN inferences and reports up to
66% SoC energy saving with 1% accuracy loss
([Zhu et al., ISCA 2018](https://arxiv.org/abs/1803.11232)). Glimpse tracks
locally between "trigger frames" sent to a server
([Chen et al., SenSys 2015](https://www.microsoft.com/en-us/research/publication/glimpse-continuous-real-time-object-recognition-mobile-devices/)).

Expected saving on this layout: little. The detector already only needs 1–2
Hz, so there is little between runs to fill. A track-following motion model
could refine a moving train's position between runs, but that is L1 work, out
of the map's scope [inference].

How it causes a miss. A car that enters between detector runs is not tracked
until the next run. Tracker drift reports a car where it no longer is.

## 8. A small model gating a large one

What it is. A cheap model decides whether the expensive one runs. NoScope's
specialized models do this for binary presence queries
([Kang et al., VLDB 2017](https://arxiv.org/abs/1703.02529)).

Expected saving: none that is safe. A presence filter does nothing on a layout
that always has parked stock: Reducto found that binary classifiers "forego
between 17–74% of potential frame filtering opportunities by filtering based on
object presence rather than changes in query result, e.g., a parking lot can
contain parked cars, but the overall count or locations of the cars may not
change" ([Li et al., SIGCOMM 2020](https://www.cs.princeton.edu/~ravian/publications/reducto_sigcomm20.pdf), §1).
If YOLO26n decides where YOLO26l runs, every car the small model misses with
confidence is never re-examined, which keeps the small model's misses and pays
for both. A pixel-change gate (technique 2) is cheaper and has no learned
misses [inference].

Check, if tried anyway: list every held-out car the large model finds in a
tile the small model would have skipped. That list is the cascade's added
misses.

## Not a technique for L0

Classifying each section of track as occupied or clear, as the parking
system classifies each space, is cheaper than detection. Its output is not L0,
and the classifier is parked
([occupancy ADR 0004](https://github.com/rails49/occupancy/blob/main/docs/adr/0004-one-model-in-the-live-path.md)).

## Open points

* The chosen track length and its share of curves and turnouts ([#33](https://github.com/rails49/detector/issues/33))
  set technique 1's saving.
* Whether Safari honours `exposureMode: "manual"` was not checked.
* The gate's temporal checks need a recorded clip from the live camera; the
  held-out stills cannot exercise them.
* Whether the A18 has the A17 Pro's INT8 path on the Neural Engine is not in
  Apple's documentation read here.
