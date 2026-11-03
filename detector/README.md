# Detector — YOLO26n-OBB

Fine-tunes an oriented-box detector on rolling stock and exports it for the
browser, in its own `uv` environment.

No model has been released. The corpus is
[`rails49/r49`](https://github.com/rails49/r49)'s `archives/`; the current model
trains on the ceiling captures in its `archives/iot49/`.
No number this produces is a generalization estimate (`SPEC.md` § Accuracy).
When a model is released, the package version names it.

## The path

```bash
# 0. the corpus, and the dataset derived from it
git clone https://github.com/rails49/r49.git ../dataset/r49
pnpm --filter dataset run export:yolo
#    add `-- --in <dir>` for any other directory of .r49 files, relative to
#    dataset/

# 1. fine-tune from the DOTA-pretrained OBB checkpoint
uv run python train.py --epochs 20

# 2. misses and phantoms on the held-out frames
uv run python evaluate.py runs/tracer/weights/best.pt
#    and the frames with their detections drawn, in runs/tracer/held-out/
uv run python evaluate.py runs/tracer/weights/best.pt --draw runs/tracer/held-out
#    in FP16, and in INT8 from the export, stopped before the .ort
uv run python evaluate.py runs/tracer/weights/best.pt --fp16
uv run python export_onnx.py --weights runs/tracer/weights/best.pt --onnx-only --out runs/tracer/int8
uv run python evaluate.py runs/tracer/int8/detector_int8.onnx --device cpu

# a new capture before it is labeled: every image with its detections drawn
uv run python detect.py runs/tracer/weights/best.pt <archive.r49> --dpt <dpt> --out <dir>

# 3. .pt -> ONNX -> static INT8 -> .ort
uv run python export_onnx.py
```

`train.py` writes to `runs/`, `export_onnx.py` to `models/`. Both are
gitignored.

## Three export findings that are easy to rediscover the hard way

**Quantize convolutions only.** Quantizing the whole graph yields a model that
loads, runs, and returns the right `[1, 300, 7]` shape with **every score
zero** — it detects nothing, and nothing errors. The head's last `Concat` fuses
box coordinates (0..canvas) with scores (0..1) into one output tensor; a single
activation scale has to span both, it gets sized for the coordinates, and the
whole score range lands in the zero bucket. `op_types_to_quantize=["Conv"]`
leaves the head's plumbing in float and costs ~0.5 px of centre agreement
against fp32.

Excluding the head by node name works just as well and is ~0.5 MiB larger, but
it silently degrades to quantizing everything if Ultralytics renumbers its
layers — hence the op-type filter, which depends on no naming convention.

**Static quantization, never dynamic.** Dynamic emits `ConvInteger`, which the
ORT CPU provider does not implement — the model quantizes fine and then refuses
to load. Static emits `QLinearConv`, which it does. Calibration data is
therefore mandatory; the exported training frames are the calibration set,
because static quantization picks activation ranges from what it observes and
calibrating off-distribution costs accuracy silently.

**FP16 is not a rung on this ladder.** There is no FP16 arithmetic path on a
CPU/WASM target, and the conversion fails on a `Resize` type mismatch anyway.
The useful rungs are fp32 and static INT8.

The last two were established in the issue rails49/occupancy#3 feasibility research
(`docs/research/issue-3-browser-yolo-feasibility.md`), which ran this whole
path on the released DOTA weights before any of this existed. The first was
**not** — that research checked the output shape, which a collapsed model
passes.

Which is why `export_onnx.py` finishes by running fp32 and INT8 over the
calibration frames and comparing detection counts. Loading, running and shape
all pass on a model that detects nothing; only the comparison catches it. On
the tracer weights: fp32 116, INT8 124, whole-graph-quantized **0**.

**Calibration frames are the exported tiles, as exported.** Static
quantization fixes its activation ranges on whatever geometry it is shown, so
calibrating on anything other than what `detect` feeds the model calibrates it
for a distribution it is never given. `export:yolo` already writes each tile
at the canvas square, resampled to the target DPT and padded on the right and
bottom with `(114, 114, 114)`, Ultralytics' own fill — which is what `detect`
builds in the browser from `inputLayout` (ADR 0014). So calibration reads the
tiles unchanged and refuses one that is not the canvas square.

## The input is one canvas tile

The exported graph takes `[1, 3, canvas, canvas]`, `detector.canvas` from
`config.yaml`, read by both scripts — Python reads the authored YAML directly
and never the generated `lib/config`. `export_onnx.py` checks the graph it
wrote has that input, and `loadDetector` refuses any other. A frame is
resampled to the target DPT, `detector.dpt`, and cut into tiles of that
square, in training and in the browser alike. See `SPEC.md` § Input geometry.
