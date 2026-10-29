# Detector compute per square metre

Written 2026-10-29. Research for [detector#32](https://github.com/rails49/detector/issues/32), under map
[#31](https://github.com/rails49/detector/issues/31).

Sources: the Ultralytics source at the version this repo pins (`ultralytics==8.4.115`, read from
`detector/.venv`), `ultralytics-thop==2.1.6` (the FLOPs counter Ultralytics calls), and
measurements run for this ticket with torch 2.14.0 on CPU. Geometry constants come from
`config.yaml`. Line numbers below are from the installed packages.

## Answer

- Ultralytics' "GFLOPs" are 2 × multiply-accumulates (MACs). `get_flops` multiplies THOP's MAC count
  by 2 (`ultralytics/utils/torch_utils.py:553`), and THOP counts one MAC per kernel tap per output
  element (`thop/vision/calc_func.py:27-34`). A hand count of conv and attention MACs on the fused
  model is exactly half of Ultralytics' fused figure at every model and canvas size (table below).
  Vendor INT8 TOPS figures are conventionally counted the same way (one MAC = 2 ops), so fused
  GFLOPs per refresh × refresh rate / 1000 compares directly with a TOPS rating. That convention
  is not checked here against each datasheet; the hardware tickets should check it per device.
- Use the fused count. `model.info()` reports the unfused model: it adds batch-norm ops and the
  one-to-many training head, about 11-15 % over what the exported graph runs. Export calls
  `model.fuse()` (`ultralytics/engine/exporter.py:834`), which folds batch norm into the convs and,
  for end-to-end models, drops the one-to-many head (`ultralytics/nn/tasks.py:236-268`,
  `ultralytics/nn/modules/head.py:524-526` for `OBB`).
- Compute is linear in pixels, plus a small quadratic term. YOLO26 has one `C2PSA` attention block
  at stride 32 (`ultralytics/cfg/models/26/yolo26-obb.yaml`, layer 10), whose cost grows with the
  square of the token count. Because of it, Ultralytics profiles at full size instead of
  extrapolating from a stride-sized sample (`torch_utils.py:547-552`). The attention share at a
  2048 canvas is 19 % for n, 10 % for s and 3-4 % for m, l and x. GFLOPs per Mpx therefore rise
  with canvas size: n goes from 13.6 at 640 to 16.3 at 2048.
- At DPT 20 the full 2×1 m layout costs, per refresh: n 154-206 GFLOPs per m², s 595-738,
  m 1940-2275, l 2439-2874, x 5458-6369, depending on canvas (1024 or 2048). That is 2.2-3.0 times
  the cost of the layout's pixels alone.
- Tile overhead on the full rectangle is 2.2-2.6 at a 2048 canvas for all three DPTs. At a 1024
  canvas it is 2.2 at DPT 20 but 7.0 at DPT 33. At 640 it is 7 at DPT 20, 23 at DPT 25, and at DPT 33
  the 690 px overlap is larger than the canvas, so 640 cannot tile at all. Smaller canvases pay more
  because the overlap is a fixed number of pixels at a given DPT and takes a larger share of a
  smaller tile.
- Narrow strips on square canvases waste most of each tile. A 1-track strip costs 40-68 times its
  own pixels; a 4-track strip 8-14 times. A rectangular canvas (height = strip width rounded up to
  32) brings that to 1.4-3.9 at widths 1024 and 2048. The network accepts rectangular inputs; the
  export and runtime path for them is covered in
  [ultralytics-variable-size.md](ultralytics-variable-size.md).

## Definitions

- DPT d: pixels per 9 mm track gauge. Pixels per layout mm = d / 9. One m² is (d / 9)² × 10⁶ px.
- Overlap between neighbouring tiles: d × `tile_overlap_mm` / 1435 px, with
  `detector.tile_overlap_mm: 30000` (`config.yaml`).
- Car width: d × 3000 / 1435 px. Track spacing: 25 mm centre to centre, so 25 × d / 9 px.
- A strip k tracks wide and 2 m long has width car width + (k − 1) × spacing. Its area in m² is
  that width in layout mm × 2 m.
- Tiles along a side of D px with canvas C and overlap O: 1 if D ≤ C, else ⌈(D − O) / (C − O)⌉.
  The last tile is shifted back to the edge. A tiling with O ≥ C is impossible and shows as n/a.
- Overhead: tiles × canvas px / region px.
- Model figures are for `nc=1` (`detector.classes: ["stock"]`), built from
  `yolo26{n,s,m,l,x}-obb.yaml`. The class count changes the head only: `nc=80` adds 2-3 % for n and
  under 1 % for l. The pretrained `yolo26l-obb.pt` and `yolo26x-obb.pt` (DOTA, 15 classes) profile
  within 0.1 % of the `nc=1` build.
- "Per refresh" means one inference over the region. Multiply by the refresh rate for GFLOP/s.

## Method

The profiling script and analysis script are in the ticket's scratchpad, not the repo. For each
model and canvas size 640, 1024 and 2048 the script recorded:

- `get_flops(model, s)` on the unfused model (what `model.info()` prints) and on a fused copy;
- an independent MAC count from forward hooks on every `nn.Conv2d` (output elements × input
  channels / groups × kernel area) plus the two attention matmuls, using the same per-head formula
  as Ultralytics' `_attention_ops` (`torch_utils.py:505-516`).

Conv MACs per pixel are identical at all three sizes, and attention MACs scale with tokens², so
per-tile cost is `2 × (a × px + b × (px / 1024)²)` with a and b fitted per model. The fit
reproduces Ultralytics' fused figure within 0.1 % at every size, and gives the cost of the
rectangular canvases below.

| model | conv GFLOPs per Mpx (2a) | attention MACs per token² (b) |
|---|---|---|
| yolo26n-obb | 13.26 | 384 |
| yolo26s-obb | 52.49 | 768 |
| yolo26m-obb | 174.63 | 768 |
| yolo26l-obb | 219.18 | 1152 |
| yolo26x-obb | 492.31 | 1728 |

The scale comments in `yolo26-obb.yaml` (16.9 GFLOPs for n, 259.0 for l) match the unfused count at
1024 within 1 %.

## GFLOPs per tile and per Mpx (fused, nc=1)

| model | params (M) | GFLOPs @640 | GFLOPs @1024 | GFLOPs @2048 | GFLOPs/Mpx @640 | GFLOPs/Mpx @1024 | GFLOPs/Mpx @2048 | attention share @2048 |
|---|---|---|---|---|---|---|---|---|
| yolo26n-obb | 2.45 | 5.6 | 14.7 | 68.5 | 13.6 | 14.0 | 16.3 | 19% |
| yolo26s-obb | 9.75 | 21.7 | 56.6 | 245.9 | 53.1 | 54.0 | 58.6 | 10% |
| yolo26m-obb | 21.20 | 71.8 | 184.7 | 758.2 | 175.2 | 176.2 | 180.8 | 3% |
| yolo26l-obb | 25.59 | 90.1 | 232.2 | 957.9 | 220.1 | 221.5 | 228.4 | 4% |
| yolo26x-obb | 57.54 | 202.2 | 519.9 | 2122.9 | 493.7 | 495.8 | 506.1 | 3% |

## Unfused vs fused vs own MAC count

| model | canvas | Ultralytics unfused | Ultralytics fused | own MACs (conv+attn) | fused / MACs |
|---|---|---|---|---|---|
| yolo26n-obb | 640 | 6.39 | 5.56 | 2.78 | 2.0000 |
| yolo26n-obb | 1024 | 16.84 | 14.71 | 7.36 | 2.0000 |
| yolo26n-obb | 2048 | 77.03 | 68.51 | 34.26 | 2.0000 |
| yolo26s-obb | 640 | 24.71 | 21.74 | 10.87 | 2.0000 |
| yolo26s-obb | 1024 | 64.24 | 56.65 | 28.32 | 2.0000 |
| yolo26s-obb | 2048 | 276.29 | 245.92 | 122.96 | 2.0000 |
| yolo26m-obb | 640 | 82.35 | 71.77 | 35.89 | 2.0000 |
| yolo26m-obb | 1024 | 211.79 | 184.72 | 92.36 | 2.0000 |
| yolo26m-obb | 2048 | 866.49 | 758.21 | 379.11 | 2.0000 |
| yolo26l-obb | 640 | 100.87 | 90.14 | 45.07 | 2.0000 |
| yolo26l-obb | 1024 | 259.70 | 232.24 | 116.12 | 2.0000 |
| yolo26l-obb | 2048 | 1067.80 | 957.95 | 478.97 | 2.0000 |
| yolo26x-obb | 640 | 225.67 | 202.20 | 101.10 | 2.0000 |
| yolo26x-obb | 1024 | 579.93 | 519.85 | 259.93 | 2.0000 |
| yolo26x-obb | 2048 | 2363.21 | 2122.89 | 1061.45 | 2.0000 |

## Geometry

| DPT | px/mm | Mpx per m² | overlap px | car width px | track spacing px | layout px |
|---|---|---|---|---|---|---|
| 20 | 2.222 | 4.94 | 418 | 41.8 | 55.6 | 4444 × 2222 |
| 25 | 2.778 | 7.72 | 523 | 52.3 | 69.4 | 5556 × 2778 |
| 33 | 3.667 | 13.44 | 690 | 69.0 | 91.7 | 7333 × 3667 |

## Tile overhead, square canvas (tiled px / region px)

| region | DPT | region px | tiles @640 | tiles @1024 | tiles @2048 | overhead @640 | overhead @1024 | overhead @2048 |
|---|---|---|---|---|---|---|---|---|
| 2×1 m rectangle | 20 | 4444 × 2222 | 171 | 21 | 6 | 7.09 | 2.23 | 2.55 |
| 2×1 m rectangle | 25 | 5556 × 2778 | 860 | 55 | 8 | 22.83 | 3.74 | 2.17 |
| 2×1 m rectangle | 33 | 7333 × 3667 | n/a | 180 | 15 | n/a | 7.02 | 2.34 |
| 1-track strip | 20 | 4444 × 42 | 19 | 7 | 3 | 41.88 | 39.50 | 67.71 |
| 1-track strip | 25 | 5556 × 52 | 43 | 11 | 4 | 60.66 | 39.72 | 57.78 |
| 1-track strip | 33 | 7333 × 69 | n/a | 20 | 5 | n/a | 41.45 | 41.45 |
| 2-track strip | 20 | 4444 × 97 | 19 | 7 | 3 | 17.98 | 16.96 | 29.08 |
| 2-track strip | 25 | 5556 × 122 | 43 | 11 | 4 | 26.05 | 17.06 | 24.81 |
| 2-track strip | 33 | 7333 × 161 | n/a | 20 | 5 | n/a | 17.80 | 17.80 |
| 4-track strip | 20 | 4444 × 208 | 19 | 7 | 3 | 8.40 | 7.92 | 13.58 |
| 4-track strip | 25 | 5556 × 261 | 43 | 11 | 4 | 12.17 | 7.97 | 11.59 |
| 4-track strip | 33 | 7333 × 344 | n/a | 20 | 5 | n/a | 8.31 | 8.31 |

## Tile overhead, rectangular canvas for strips (height = strip width rounded up to 32)

| region | DPT | canvas h | tiles @w=640 | tiles @w=1024 | tiles @w=2048 | overhead @w=640 | overhead @w=1024 | overhead @w=2048 |
|---|---|---|---|---|---|---|---|---|
| 1-track strip | 20 | 64 | 19 | 7 | 3 | 4.19 | 2.47 | 2.12 |
| 1-track strip | 25 | 64 | 43 | 11 | 4 | 6.07 | 2.48 | 1.81 |
| 1-track strip | 33 | 96 | n/a | 20 | 5 | n/a | 3.89 | 1.94 |
| 2-track strip | 20 | 128 | 19 | 7 | 3 | 3.60 | 2.12 | 1.82 |
| 2-track strip | 25 | 128 | 43 | 11 | 4 | 5.21 | 2.13 | 1.55 |
| 2-track strip | 33 | 192 | n/a | 20 | 5 | n/a | 3.34 | 1.67 |
| 4-track strip | 20 | 224 | 19 | 7 | 3 | 2.94 | 1.73 | 1.49 |
| 4-track strip | 25 | 288 | 43 | 11 | 4 | 5.47 | 2.24 | 1.63 |
| 4-track strip | 33 | 352 | n/a | 20 | 5 | n/a | 2.86 | 1.43 |

## GFLOPs per refresh per m², full 2×1 m rectangle

| model | DPT | no tiling, rate @1024 | tiled @640 | tiled @1024 | tiled @2048 | whole layout @best |
|---|---|---|---|---|---|---|
| yolo26n-obb | 20 | 69 | 475 | 154 | 206 | 309 |
| yolo26n-obb | 25 | 108 | 2389 | 405 | 274 | 548 |
| yolo26n-obb | 33 | 189 | n/a | 1324 | 514 | 1028 |
| yolo26s-obb | 20 | 267 | 1859 | 595 | 738 | 1190 |
| yolo26s-obb | 25 | 417 | 9350 | 1558 | 984 | 1967 |
| yolo26s-obb | 33 | 726 | n/a | 5098 | 1844 | 3689 |
| yolo26m-obb | 20 | 870 | 6137 | 1940 | 2275 | 3879 |
| yolo26m-obb | 25 | 1359 | 30863 | 5080 | 3033 | 6066 |
| yolo26m-obb | 33 | 2368 | n/a | 16625 | 5687 | 11373 |
| yolo26l-obb | 20 | 1094 | 7707 | 2439 | 2874 | 4877 |
| yolo26l-obb | 25 | 1709 | 38762 | 6387 | 3832 | 7664 |
| yolo26l-obb | 33 | 2978 | n/a | 20902 | 7185 | 14369 |
| yolo26x-obb | 20 | 2448 | 17288 | 5458 | 6369 | 10917 |
| yolo26x-obb | 25 | 3825 | 86948 | 14296 | 8492 | 16983 |
| yolo26x-obb | 33 | 6665 | n/a | 46787 | 15922 | 31843 |

Columns: "no tiling" is the layout's pixels at the 1024 per-Mpx rate, with no overlap or padding.
"tiled @C" tiles the 2×1 m rectangle with square C canvases. "whole layout" is GFLOPs per refresh for
the full 2 m² at the cheapest of the three canvases; at 10 Hz, divide by 100 for TOPS.

## GFLOPs per refresh per metre of strip

Strips are 2 m long; figures are per metre. "square" uses square canvases; "rect" uses a canvas
C wide and the strip width (rounded up to 32) tall.

| model | region | DPT | square @1024 | square @2048 | rect @w=1024 | rect @w=2048 |
| --- | --- | --- | --- | --- | --- | --- |
| yolo26n-obb | 1-track strip | 20 | 51.5 | 102.8 | 3.1 | 2.6 |
| yolo26n-obb | 1-track strip | 25 | 80.9 | 137.0 | 4.8 | 3.5 |
| yolo26n-obb | 1-track strip | 33 | 147.1 | 171.3 | 13.1 | 6.6 |
| yolo26n-obb | 2-track strip | 20 | 51.5 | 102.8 | 6.1 | 5.3 |
| yolo26n-obb | 2-track strip | 25 | 80.9 | 137.0 | 9.6 | 7.1 |
| yolo26n-obb | 2-track strip | 33 | 147.1 | 171.3 | 26.4 | 13.3 |
| yolo26n-obb | 4-track strip | 20 | 51.5 | 102.8 | 10.8 | 9.4 |
| yolo26n-obb | 4-track strip | 25 | 80.9 | 137.0 | 21.9 | 16.2 |
| yolo26n-obb | 4-track strip | 33 | 147.1 | 171.3 | 48.8 | 24.9 |
| yolo26s-obb | 1-track strip | 20 | 198.3 | 368.9 | 12.1 | 10.4 |
| yolo26s-obb | 1-track strip | 25 | 311.6 | 491.8 | 19.0 | 13.8 |
| yolo26s-obb | 1-track strip | 33 | 566.5 | 614.8 | 51.7 | 25.9 |
| yolo26s-obb | 2-track strip | 20 | 198.3 | 368.9 | 24.2 | 20.8 |
| yolo26s-obb | 2-track strip | 25 | 311.6 | 491.8 | 38.0 | 27.7 |
| yolo26s-obb | 2-track strip | 33 | 566.5 | 614.8 | 103.8 | 52.2 |
| yolo26s-obb | 4-track strip | 20 | 198.3 | 368.9 | 42.4 | 36.6 |
| yolo26s-obb | 4-track strip | 25 | 311.6 | 491.8 | 85.8 | 62.9 |
| yolo26s-obb | 4-track strip | 33 | 566.5 | 614.8 | 191.1 | 96.5 |
| yolo26m-obb | 1-track strip | 20 | 646.5 | 1137.3 | 40.1 | 34.4 |
| yolo26m-obb | 1-track strip | 25 | 1016.0 | 1516.4 | 63.0 | 45.8 |
| yolo26m-obb | 1-track strip | 33 | 1847.2 | 1895.5 | 171.8 | 86.0 |
| yolo26m-obb | 2-track strip | 20 | 646.5 | 1137.3 | 80.2 | 68.8 |
| yolo26m-obb | 2-track strip | 25 | 1016.0 | 1516.4 | 126.0 | 91.8 |
| yolo26m-obb | 2-track strip | 33 | 1847.2 | 1895.5 | 343.9 | 172.2 |
| yolo26m-obb | 4-track strip | 20 | 646.5 | 1137.3 | 140.5 | 120.6 |
| yolo26m-obb | 4-track strip | 25 | 1016.0 | 1516.4 | 284.0 | 207.0 |
| yolo26m-obb | 4-track strip | 33 | 1847.2 | 1895.5 | 631.3 | 316.6 |
| yolo26l-obb | 1-track strip | 20 | 812.8 | 1436.9 | 50.3 | 43.1 |
| yolo26l-obb | 1-track strip | 25 | 1277.3 | 1915.9 | 79.1 | 57.5 |
| yolo26l-obb | 1-track strip | 33 | 2322.4 | 2394.9 | 215.7 | 107.9 |
| yolo26l-obb | 2-track strip | 20 | 812.8 | 1436.9 | 100.7 | 86.4 |
| yolo26l-obb | 2-track strip | 25 | 1277.3 | 1915.9 | 158.2 | 115.2 |
| yolo26l-obb | 2-track strip | 33 | 2322.4 | 2394.9 | 431.8 | 216.3 |
| yolo26l-obb | 4-track strip | 20 | 812.8 | 1436.9 | 176.4 | 151.5 |
| yolo26l-obb | 4-track strip | 25 | 1277.3 | 1915.9 | 356.6 | 260.1 |
| yolo26l-obb | 4-track strip | 33 | 2322.4 | 2394.9 | 792.9 | 397.9 |
| yolo26x-obb | 1-track strip | 20 | 1819.5 | 3184.3 | 113.0 | 96.9 |
| yolo26x-obb | 1-track strip | 25 | 2859.2 | 4245.8 | 177.5 | 129.2 |
| yolo26x-obb | 1-track strip | 33 | 5198.5 | 5307.2 | 484.3 | 242.3 |
| yolo26x-obb | 2-track strip | 20 | 1819.5 | 3184.3 | 226.0 | 193.9 |
| yolo26x-obb | 2-track strip | 25 | 2859.2 | 4245.8 | 355.2 | 258.6 |
| yolo26x-obb | 2-track strip | 33 | 5198.5 | 5307.2 | 969.2 | 485.2 |
| yolo26x-obb | 4-track strip | 20 | 1819.5 | 3184.3 | 395.8 | 339.8 |
| yolo26x-obb | 4-track strip | 25 | 2859.2 | 4245.8 | 800.1 | 583.0 |
| yolo26x-obb | 4-track strip | 33 | 5198.5 | 5307.2 | 1778.8 | 891.5 |

## Not covered

- Achieved throughput. FLOPs set a floor; real speed depends on memory bandwidth, operator support
  and quantization on each device. The shortlist measurements in #31 cover that.
- Accuracy at each canvas, DPT and model. That is
  [Map: the YOLO accuracy campaign](https://github.com/rails49/detector/issues/2).
- Strips that curve or cross: the strip figures assume straight 2 m strips along the long side.
