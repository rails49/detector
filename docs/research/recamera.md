# Seeed Studio reCamera as camera and detector

Researched 2026-11-01 for [#54](https://github.com/rails49/detector/issues/54). It builds on
`docs/research/cameras-dpt20.md` on branch `research/cameras-dpt20` [S1] and reuses its geometry,
and on `docs/research/hailo-8.md` on branch `research/hailo-8` [S2] and reuses its unit: effective
TFLOP/s = Ultralytics GFLOPs at the stated input ÷ time per frame.

Nothing was measured on a device. Numbers marked (calc) are geometry or arithmetic done here, with
the method shown. Numbers marked (secondary) come from a reseller, a news site or a search-result
snippet, not from Seeed, Sophgo, Rockchip or Ultralytics. Prices were read on 2026-11-01.

## Summary

Targets, from the issue: DPT 20 (the minimum in `SPEC.md` [S5]), with DPT 16 being measured. One
camera covers 2.10 × 1.10 m; two cameras cover 1.14 × 1.10 m each. Rate 1.5 Hz.

1. Seeed sells two reCamera families side by side [W11]. The 2002 family (2002, 2002w, 2002 HQ PoE,
   Gimbal 2002w) uses the Sophgo SG2002: 1 TOPS INT8 TPU, 256 MB of RAM in the package, $89.90 to
   $229.90 [W1][W2][W3][P1–P4]. The reCamera Pro uses the Rockchip RV1126B: 3 TOPS NPU, 2 or 4 GB,
   an 8 MP SC850SL sensor, $299.90 for 2 GB [W4][P5].
2. No reCamera reaches DPT 20 with one or two units. The SG2002's ISP takes at most 2,880 px wide
   and 5 MP [T1], which caps any 2002 unit at DPT 12.3 across 2.1 m and DPT 15.9 on the 1.1 m axis
   (calc). The 2002 and Gimbal ship a 5 MP OV5647 with a fixed lens: DPT 14.8 per unit with two units.
   The HQ PoE has an M12 mount but a 2 MP GC2053: at most DPT 8.8.
3. The Pro has an M12 mount (secondary [N1]) and a 3840 × 2160 sensor. With a 5.5 mm M12 lens one
   Pro covers 2,095 × 1,178 mm at DPT 16.5. Two Pros with 6 mm lenses reach DPT 18.0 with 40 mm of
   margin instead of 50 on the short axis (calc). The 16:9 sensor wastes the long axis in both
   cases.
4. NPU throughput, from published 640 × 640 figures only (calc): the SG2002 gives 0.13–0.16 TFLOP/s
   (YOLO11n, Seeed [W5][W6]). The RV1126B gives 0.35 TFLOP/s for YOLO26n and 0.63 for YOLO26s
   (Rockchip's model zoo [R2]). No inference time above 640 is published for either chip.
5. NPU busy share at 1.5 Hz, burst figures, cheapest of 1024 and 2048 tiles (calc, tables below):
   - One Pro: n at DPT 16 59 %, n at DPT 20 133 %, s at DPT 16 118 %.
   - Each of two Pros: n at DPT 16 30 %, n at DPT 20 76 %, s at DPT 16 59 %, s at DPT 20 161 %.
   - SG2002: n at DPT 16 126–158 % for one unit, 63–79 % per unit for two (only with 2048 tiles,
     which may not fit its 60 MB media memory [O3]). s does not fit.
6. Toolchains. Ultralytics exports every task, OBB included, to RKNN for `rv1126b`, with the box
   decode on the host [U1]. Rockchip's zoo added YOLO26 in release 2.4.2 [R2]; Seeed's Pro firmware
   ships RKNN runtime 2.3.2 and says not to replace it [W7]. Whether YOLO26-OBB runs on that runtime
   is unknown. For the SG2002, TPU-MLIR handles YOLO26 calibration [T3] and Seeed ships a YOLO26n
   detect model at 640 [O4]; no OBB model or example was found for that chip.
7. Verdicts: (a) one reCamera doing everything: no. (b) two doing everything: no at DPT 20; two
   Pros reach DPT 18 and would run n at DPT 16. (c) reCamera as camera for a Pi 5 with Hailo: no; it
   gives less DPT than the Pi cameras in [S1] at three to ten times their price. See
   [Verdicts](#verdicts).
8. Three Pros, each with its sensor turned 90° and an 8.5 mm lens, would reach DPT 25.5 and run n
   at DPT 20 at 38 % NPU busy, s at 81 % (calc). This is outside the question and rests on the same
   unknowns as point 6.

## Variants on sale

| Variant | SoC, NPU | RAM | Sensor | Lens | Network | Power | Price |
|---|---|---|---|---|---|---|---|
| reCamera 2002 / 2002w | SG2002, 1 TOPS INT8 | 256 MB | OV5647, 5 MP, 1/4", 1.4 µm | 3.46 mm f/2.8, 65°, distortion < 1 % | 100 Mbps Ethernet; 2002w adds Wi-Fi 2.4/5 GHz and BT | 5 V 1 A over USB-C | 2002w 8 GB $89.90; 2002 64 GB page $99.90 [P1][P2] |
| reCamera 2002 HQ PoE | as above | 256 MB | GC2053, 2 MP, 1/2.9" | M12, 2.9 mm f/2.8, 93° D / 84° H / 54° V | 100 Mbps Ethernet, 802.3af PoE Mode A only | PoE | 64 GB $119.90 [P3] |
| reCamera Gimbal 2002w | as above | 256 MB | OV5647, as the 2002 | as the 2002 | Wi-Fi, BT; CAN to the two motors | 12 V DC, 185 mA static | $229.90 [P4] |
| reCamera Pro | RV1126B, 3 TOPS, "mixed INT8/INT16" | 2 or 4 GB LPDDR4 | SC850SL, 8 MP, 3840 × 2160 at 30 fps | M12 × 0.5, 2.75 mm f/2.4, 123° ± 5° (secondary [N1]) | 1000 Mbps Ethernet, PoE, Wi-Fi, BT | 12–24 V DC, PoE, or 7.4 V battery | 2 GB $299.90; 4 GB price not listed [P5] |

Sources: [W1] 2002, [W2] HQ PoE, [W3] Gimbal, [W4] Pro, [W11] product matrix, [W12] sensor boards.

- The SG2002 TPU is "~1.0TOPS INT8" [T1]. TPU-MLIR compiles for CV181X in BF16 and symmetric INT8
  only [T2]. One Seeed workshop page gives "0.5 TOPS" and "16MB SPI Flash" [W13]; the hardware pages
  and Sophgo's manual give 1 TOPS and eMMC, and are used here.
- The SG2002's DDR3 is 256 MB in the package [T1]. reCamera-OS reserves 60 MB for media buffers
  (ION), of which 20 MB is the ISP's and 2 MB the encoder's [O3]. The TPU's working memory comes from
  the same ION pool; TPU-MLIR's `op_divide` option exists "to save ION memory" [T2].
- The 2002 family is modular: core board, sensor board and base board [W11][U2]. Seeed lists two
  sensor boards, S101 (OV5647) and S401 (GC2053) [W12]. Seeed sells the GC2053 board separately as a
  "Replaceable front panel ... with M12 swappable lens mount" for any 2002 unit [W14]. No other lens
  is offered for the OV5647 board.
- The SG2002 kernel has drivers for many sensors, including the 8 MP SC850SL and OS08A20 [W12], but
  the ISP stops at 5 MP and 2,880 px wide: "maximum width of 2880 and a maximum resolution of 5M
  (2688x1944, 2880x1620)" [T1]. A better sensor board cannot lift the 2002 family past that.
- RV1126B: "12M@30fps" ISP, "8M@30fps AI-ISP", up to five cameras, 4K 45 fps encode [R1]. The Pro's
  BSP has a device-tree overlay for an expansion-board camera and drivers for other sensors,
  including the 48 MP IMX586 [W8]. Seeed sells no such board, and the ISP limit of 12 MP still
  applies.
- Seeed's own M12 lens set for reCamera: 160° fisheye, 140° wide, 20° telephoto, 15° ultra
  telephoto [W14]. The 20° lens is 16 mm and the 15° lens 22 mm (secondary [N2]). They are rated 5 MP
  and 2 MP and sold for the 1/2.9" HQ PoE; whether they cover the Pro's 1/1.8" sensor is not stated.
- A reseller lists the Pro as taking M12, CS and C lenses (secondary [N3]). Seeed's pages do not say
  so. The Pro's quick start tells the user to "adjust the lens" during preview [W15].

## Sensors, lenses and DPT at 1.5 m

Method, as in [S1] (calc): field = sensor size × 1,500 ÷ f, or 2 × 1,500 × tan(FOV ÷ 2) where only
the FOV is published. DPT = 9 × pixels ÷ field in mm. One unit must cover 2,100 mm on its long axis;
for two units each must cover 1,140 × 1,100 mm, so a non-square sensor is limited by its short axis.

| Unit, sensor | Pixels, sensor size | Lens | Field at 1.5 m (mm) | One unit, DPT across 2.1 m | Two units, DPT on the 1.1 m axis |
|---|---|---|---|---|---|
| 2002 / Gimbal, OV5647 | 2592 × 1944, 3.63 × 2.72 mm | stock 3.46 mm | 1,573 × 1,180 | does not cover 2.1 m | 14.8 |
| as above | as above | lens that fills 2.1 m (2.59 mm), not sold | 2,100 × 1,575 | 11.1 | — |
| as above | as above | lens that fills 1.1 m (3.71 mm), not sold | 1,467 × 1,100 | — | 15.9 |
| HQ PoE, GC2053 | 1920 × 1080 | stock 2.9 mm, 84° × 54° | 2,701 × 1,529 | 6.4 | 6.4 |
| as above | as above | lens that fills the field | 2,100 or 1,100 on the limiting axis | 8.2 | 8.8 |
| as above | as above | Seeed 20° telephoto (16 mm) | 529 wide | covers a quarter of the width | covers half the width of one share |
| Pro, SC850SL | 3840 × 2160, 7.68 × 4.32 mm | stock 2.75 mm, 123° | 4,189 × 2,356 (rectilinear) | 8.3 | 8.3 |
| as above | as above | 5.5 mm M12, 1/1.8" (Arducam LN079, secondary [L1]) | 2,095 × 1,178 | 16.5 | 16.5 |
| as above | as above | 6 mm M12, 1/1.8" (Commonlands CIL062, secondary [L2]) | 1,920 × 1,080 | does not cover 2.1 m | 18.0, 20 mm short of 1,100 |
| as above, turned 90°, three units | as above | 8.5 mm M12, 1/1.8" (Arducam LN078, secondary [L1]) | 762 × 1,355 each | — | 25.5 with three units |

Arithmetic (calc):

- OV5647: 2592 × 1.4 µm = 3.63 mm; 1944 × 1.4 µm = 2.72 mm [W12]. With 3.46 mm: 3.63 × 1,500 ÷
  3.46 = 1,573 mm and 2.72 × 1,500 ÷ 3.46 = 1,180 mm. 1944 ÷ 1,180 × 9 = 14.8. The diagonal
  2 × atan(2.27 ÷ 3.46) = 66.5° matches Seeed's 65°, so 65° is diagonal.
- SG2002 ceiling: 9 × 2,880 ÷ 2,100 = 12.3 for one unit; 9 × 1,944 ÷ 1,100 = 15.9 for two.
- GC2053 stock: 2 × 1,500 × tan 42° = 2,701 mm; 1920 ÷ 2,701 × 9 = 6.4. 2 × 1,500 × tan 27° =
  1,529 mm; 1080 ÷ 1,529 × 9 = 6.4. Best case: 9 × 1,920 ÷ 2,100 = 8.2; 9 × 1,080 ÷ 1,100 = 8.8.
- SC850SL: 3840 × 2.0 µm = 7.68 mm; 2160 × 2.0 µm = 4.32 mm [N1][N4]. Stock: 7.68 × 1,500 ÷ 2.75 =
  4,189 mm. Its rectilinear diagonal would be 116°; the listed 123° means barrel distortion.
- Pro with 5.5 mm: 7.68 × 1,500 ÷ 5.5 = 2,095 mm, 5 mm short of 2,100, so the 50 mm margin becomes
  47.5 mm at each end. 3840 ÷ 2,095 × 9 = 16.5. Height 4.32 × 1,500 ÷ 5.5 = 1,178 mm. This lens
  covers the whole layout, so a second Pro with the same lens adds nothing.
- Pro with 6 mm: 4.32 × 1,500 ÷ 6 = 1,080 mm on the short axis, 20 mm short of 1,100, so the margin
  becomes 40 mm per side. 2160 ÷ 1,080 × 9 = 18.0. The lens that fills 1,100 mm is 4.32 × 1,500 ÷
  1,100 = 5.89 mm, which would give 17.7.
- Pro turned 90° with 8.5 mm: the 2160 px axis covers 4.32 × 1,500 ÷ 8.5 = 762 mm of the layout's
  length, the 3840 px axis 1,355 mm of its width. 2160 ÷ 762 × 9 = 25.5. Three units cover 2,287 mm,
  so each seam overlaps about 93 mm.
- Ceiling for any RV1126B camera through its ISP (calc): 12 MP at 16:9 is about 4,608 px wide, so
  DPT 19.7 across 2.1 m. One RV1126B unit cannot reach DPT 20 through the ISP with any sensor.

Notes:

- None of the M12 lenses above has a published MTF on 2.0 µm pixels or a distortion figure from its
  maker that was read here. Distortion lowers DPT at the corners by about three times the
  distortion along the radius [S1]; DPT 16.5 and 18.0 leave no room for it against DPT 20 in any case.
- The Gimbal pans and tilts one unit, but does not change DPT: 14.8 at 1.5 m with its fixed lens. A
  reseller says lens replacement is not supported on the Gimbal (secondary [N2]).

## NPU throughput

Published figures only. All are at 640 × 640, INT8, inference only unless stated.

| Chip | Model, input | Published | Source | Effective TFLOP/s (calc) |
|---|---|---|---|---|
| SG2002 | YOLO11n, 640, INT8 cvimodel | 40 ms inference, 395 ms post-processing (one logged run) | Seeed C++ example [W6] | 6.5 ÷ 0.040 = 0.16 |
| SG2002 | YOLO11n detect, 640, INT8 | 20 FPS, 50 ms end-to-end, 1.5 W, "long-term full-load stress testing" | Seeed benchmark [W5] | 6.5 × 20 = 0.13 |
| SG2002 | YOLO26n, 640, INT8 | model shipped, no timing | Seeed model zoo [O4] | — |
| RV1126B | YOLO26n, 640, INT8 | 63.2 FPS | Rockchip zoo v2.5.0 [R2] | 5.5 × 63.2 = 0.35 |
| RV1126B | YOLO26s, 640, INT8 | 30.2 FPS | [R2] | 20.9 × 30.2 = 0.63 |
| RV1126B | YOLO26m, 640, INT8 | 12.5 FPS | [R2] | 68.4 × 12.5 = 0.86 |
| RV1126B | YOLO11n / YOLO11s, 640, INT8 | 73.7 / 34.2 FPS | [R2] | 0.48 / 0.74 |
| RV1126B | YOLOv8n-obb, 640, INT8 | 85.0 FPS | [R2] | — |

GFLOPs: YOLO11n 6.5, YOLO11s 21.6 [U3]; YOLO26n 5.5, YOLO26s 20.9 at 640 [U4]; YOLO26m 68.4 [S2].

- Rockchip's figures are "collected based on the maximum NPU frequency" and exclude pre- and
  post-processing [R2]. They are burst figures. [S2] plans against half the burst figure until a
  sustained run exists; that halving is not applied in the tables below.
- reCamera-OS 0.2.1 set "TPU max to 700MHz" [O2]. Which clock the Seeed SG2002 figures used is not
  stated.
- The largest input published for either chip is 640 for YOLO. Seeed ships 512 × 1024 segmentation
  models for the SG2002 without timing [O4]. Effective TFLOP/s at 1024 or 2048 is unknown. YOLO26-OBB
  has its C2PSA attention block at stride 32; it is 19 % of n's GFLOPs at 2048 [S4], and how either
  NPU runs it at that size is unknown.
- The Seeed C++ example logged 395 ms of post-processing on the SG2002's 1 GHz RISC-V core for
  YOLO11n with NMS [W6]. YOLO26 needs no NMS, but the OBB decode runs on that core too. Its time at
  1024 or 2048 is unknown.

## Workload and NPU busy share

### Workload per unit

Method from `compute-per-area.md` [S4] (calc): fused GFLOPs per Mpx of 14.0 (n) and 54 (s) at a
1024 canvas, 16.3 and 59 at 2048. Overlap = DPT × 30,000 ÷ 1,435 px (`detector.tile_overlap_mm`).
Tiles along a side of D px: 1 if D ≤ C, else ⌈(D − O) ÷ (C − O)⌉. One unit runs on the 2.0 × 1.0 m
layout; each of two runs on its half plus 50 mm, 1.05 × 1.0 m, as in #37 [S3]. The figures for one
unit at DPT 20 match #37: 0.46 (n) and 1.8 (s).

| Region | DPT | Pixels | Tiles at 1024 / 2048 | n TFLOP/s at 1.5 Hz, 1024 / 2048 | s TFLOP/s at 1.5 Hz, 1024 / 2048 |
|---|---|---|---|---|---|
| One unit, 2.0 × 1.0 m | 16 | 3,556 × 1,778 | 15 / 2 | 0.33 / 0.21 | 1.27 / 0.74 |
| One unit, 2.0 × 1.0 m | 20 | 4,444 × 2,222 | 21 / 6 | 0.46 / 0.62 | 1.78 / 2.23 |
| Each of two, 1.05 × 1.0 m | 16 | 1,867 × 1,778 | 9 / 1 | 0.20 / 0.10 | 0.76 / 0.37 |
| Each of two, 1.05 × 1.0 m | 20 | 2,333 × 2,222 | 12 / 4 | 0.26 / 0.41 | 1.02 / 1.49 |

### Busy share at 1.5 Hz

Busy share = TFLOP/s needed ÷ effective TFLOP/s, using the cheaper canvas (calc). The RV1126B uses
the YOLO26n figure (0.35) for n and the YOLO26s figure (0.63) for s. The SG2002 uses 0.13–0.16 for
both, since no s-sized figure is published. Over 100 % does not fit. In brackets: with 1024 tiles
only, in case 2048 does not compile.

| Setup | n, DPT 16 | n, DPT 20 | s, DPT 16 | s, DPT 20 |
|---|---|---|---|---|
| One Pro | 59 % (95 %) | 133 % | 118 % (202 %) | 283 % |
| Each of two Pros | 30 % (57 %) | 76 % | 59 % (121 %) | 161 % |
| One SG2002 unit | 126–158 % (203–254 %) | 284–355 % | 455–571 % | 1,094–1,372 % |
| Each of two SG2002 units | 63–79 % (122–152 %) | 162–203 % | 228–285 % | 625–784 % |

- The DPT columns are what the detector would run at. The cameras deliver less: a 2002 unit 14.8 at
  best, a Pro 16.5 (one) or 18.0 (two). No row reaches DPT 20 in the camera, so the DPT 20 columns
  show only that the NPU would also fall short for one unit.
- Halving the burst figures for sustained load, as [S2] does, leaves one Pro at 118 % for n at DPT 16
  and two Pros at 60 % each.
- Whether a 2048 YOLO26n-OBB fits in the SG2002's 60 MB media pool, which it shares with the ISP and
  encoder [O3], is not known. A 2048 × 2048 RGB tile alone is 12.6 MB (calc).

## Toolchain and model support

### SG2002 (2002, HQ PoE, Gimbal)

- Path: ONNX, then TPU-MLIR `model_transform` to MLIR, `run_calibration`, `model_deploy
  --processor cv181x` to a `.cvimodel` [W9][T2]. Compilation runs in Sophgo's Docker image on x86.
  Seeed's guides use TPU-MLIR v1.7 [W13]; the current release is v1.30.2 of 2026-08-31 [T4].
- Ultralytics has no cvimodel export. Its reCamera page exports to ONNX and points to Seeed's
  conversion guide [U2].
- Seeed cuts YOLO11 before the head, at the six `cv2`/`cv3` convolutions, because "the operators in
  the YOLO's head have very low accuracy after INT8 quantization" [W9]. The decode then runs on the
  CPU. This is the same pattern as Hailo and RKNN [S2][U1].
- YOLO26: TPU-MLIR's automatic mixed-precision pattern covers "YOLOV5 ... V12 and yolo26", and it
  recommends `mse` or `percentile9999` calibration for YOLO26 [T3]. reCamera-OS 0.2.3 "Supports
  YOLO26 models" [O2], and Seeed ships `yolo26n_cv181x_int8.cvimodel` at 640 [O4].
- OBB: no OBB model, example or conversion note was found for the CV181X in Seeed's or Sophgo's
  repositories (searched `sophgo/tpu-mlir` and `Seeed-Studio/sscma-example-sg200x` for "obb"). Whether
  the OBB head and the C2PSA block compile at 1024 or 2048 within the ION pool is unknown.
- The INT8 model can be run on the host in TPU-MLIR to compare against the float model
  (`--test_reference`) [W9], so accuracy on the held-out frames can be checked before buying.

### RV1126B (Pro)

- Path: RKNN-Toolkit2 on x86 Linux, `target_platform='rv1126b'`, FP16 or INT8 [W7]. Ultralytics
  exports directly with `format="rknn", name="rv1126b"` [U1][W10].
- Ultralytics: "RKNN export supports all seven Ultralytics tasks", with `yolo26n-obb.pt` as its
  example. For OBB and the other box tasks "the INT8 `.rknn` file ends at the head's output
  convolutions", and the box decode runs on the host from `tail.onnx`. "INT8 accuracy for all tasks
  has been validated with the rknn-toolkit2 simulator but not yet on Rockchip hardware." INT8 builds
  keep high-error layers in FP16 (`auto_hybrid`) [U1].
- `imgsz` takes an integer or a (height, width) tuple [U1]. Inputs must be static [W10].
- Version conflict. Ultralytics requires `rknn-toolkit2>=2.3.2,<2.5`, because 2.5.0 fails YOLO11 and
  YOLO26 builds [U5]. Rockchip's zoo added YOLO26 in 2.4.2 and requires an RKNPU2 SDK of at least
  that version [R2]. Seeed's firmware ships runtime 2.3.2: "Do not overwrite the library on the
  device" [W7]. Ultralytics' troubleshooting says to replace `librknnrt.so` when versions mismatch
  [U1]. Whether a YOLO26-OBB model built with 2.3.2 runs, or whether Seeed will ship a newer runtime,
  is unknown.
- YOLO26 in Rockchip's zoo is truncated before the one-to-one head's decode, with top-k on the CPU
  and no NMS [R3].
- The detector would run as a native C/C++ process with the RKNN C API, not in the browser [W6].

## Frames out of the unit

| | 2002 family | Pro |
|---|---|---|
| Full-resolution rate | OV5647 2592 × 1944 at 15 fps; GC2053 1920 × 1080 at 30 fps [O5][W3] | 3840 × 2160 at 30 fps [W4] |
| Rolling readout, upper bound (calc) | ≤ 67 ms (one 15 fps frame) | ≤ 33 ms |
| Ports | 100 Mbps Ethernet; USB 2.0 Type-C as a network adapter; Wi-Fi on 2002w [W1][O1] | 1000 Mbps Ethernet; USB-C OTG; Wi-Fi [W4] |
| Streams | RTSP H.264, 1080p by default; ONVIF since OS 0.2.5 [O2] | RTSP main and sub stream through go2rtc; ONVIF; WebRTC [W8] |
| Full-resolution stills | Stock "max" mode puts 2592 × 1944 only on the H.264 channel; the JPEG channel is limited to 1,920 px wide [O5] | Web UI photo; JPEG snapshot sample in the SDK [W8][W16] |
| Latency | RTSP "within approximately 2 seconds" in Seeed's C++ example [O1] | not published; a low-delay RTSP sample exists [W8] |

- Raw frames: on the 2002, own C code can read RGB888 or NV21 from the video channels; Seeed's
  example uses 1920 × 1080 [O1]. On the Pro, the rockit VI module gives frames, and RGA converts NV12
  to RGB for the NPU [W8]. The stock service `rkipc` owns the camera and must be stopped first [W8].
- Link load (calc): a 2592 × 1944 NV12 frame is 7.6 MB; at 1.5 Hz that is 11.3 MB/s, 91 % of
  100 Mbps. A 3840 × 2160 NV12 frame is 12.4 MB; 1.5 Hz is 18.7 MB/s, 15 % of 1000 Mbps.
- Neither family publishes a capture timestamp definition or a capture-to-buffer time.

## Software, openness and support record

- 2002 OS: Buildroot with Node-RED, Seeed's `sscma` service and a supervisor [O6]. OTA from GitHub
  releases [O7]. Releases: 0.1.4 (2025-01) to 0.2.5 (2026-10-26), eight in 22 months [O2]. The OS,
  the C/C++ examples and the KiCad sources of the 2002 boards are on GitHub [O1][W11].
- Pro OS: Rockchip Buildroot with Seeed's `rkipc`-based service, a Web UI and an HTTP API [W8][W17].
  An experimental Debian 13 image exists; "Seeed does not maintain it at this time", and it is hosted
  on a personal GitHub account [W18]. The RKNN runtime is a binary library (`librknnrt.so`) [W7].
  Editable Pro hardware sources are not published [W11].
- Pro documentation dates from 2026-06 to 2026-10, and several pages still carry `TODO(verify)`
  notes in their source [W4][W7][W17]. The Pro shipped from 2026-07-29 (secondary [N1]).
- Activity on GitHub (read 2026-11-01): `reCamera-OS` 71 stars, 1 open issue; `OSHW-reCamera-Series`
  493 stars; `sscma-example-sg200x` 20 stars; Seeed's Pro toolchain repository, created 2026-08-21,
  1 star. Upstream: `sophgo/tpu-mlir` 1,014 stars, last push 2026-10-15; `airockchip/rknn-toolkit2`
  3,502 stars, last push 2026-10-20.
- Support period: Seeed publishes none. Its wiki keeps guides for products "no longer being
  supported" [W19]. No Seeed vision product is on that list. The 2002 family has had OS releases
  since January 2025.

## Power, heat, mounting

- 2002: 5 V 1 A [W1]. Seeed measured 1.5 W average for the whole unit running YOLO11n at 20 FPS [W5].
  Sophgo gives about 500 mW for the chip at "1080P + Video encode + AI" [T1]. 40 × 40 × 36.5 mm.
- HQ PoE: 802.3af, Mode A only; −20 to 50 °C; 40 × 40 × 53.1 mm with lens [W2].
- Gimbal: 12 V, 185 mA static; 68 × 112 × 71 mm, 230 g [W3].
- Pro: 12 V, 1 A minimum; the factory supply is 12 V 3 A [W15]. PoE standard, power under load and
  operating temperature are not published. 89.8 × 67 × 67 mm, 324 g (secondary [N1]).
- No heat or throttling data under continuous NPU load was found for either family, beyond Seeed's
  1.5 W figure for the 2002. No mounting thread or bracket specification was found in the pages read.

## Verdicts

### (a) One reCamera doing everything

No. No variant reaches DPT 20 alone.

- 2002 family: the SG2002 ISP caps one unit at DPT 12.3 across 2.1 m; the stock OV5647 lens does not
  cover 2.1 m. Its NPU is 126–158 % busy for n at DPT 16.
- Pro: DPT 16.5 with a 5.5 mm M12 lens. If DPT 16 is accepted, n at DPT 16 uses 59 % of the NPU's
  burst figure with 2048 tiles and 95 % with 1024; s does not fit. Whether YOLO26-OBB runs depends on
  the RKNN version question above.

### (b) Two reCameras doing everything

No at DPT 20.

- Two 2002 units: DPT 14.8 with the stock lens, 15.9 at most for any lens. Below DPT 16.
- Two Pros: DPT 18.0 with 6 mm lenses and 40 mm margins. At the DPT 16 being measured each would be
  30 % busy for n and 59 % for s with 2048 tiles (57 % and 121 % with 1024). This is the only
  reCamera setup inside the question that would run, and only if DPT 16 to 18 is accepted. It costs
  $600 plus lenses and needs YOLO26-OBB on the RKNN runtime confirmed first.

### (c) reCamera as camera only, feeding a Pi 5 with Hailo

No. The best reCamera sensor, the Pro's, gives DPT 16.5 (one) or 18.0 (two). The Pi cameras in
[S1] give DPT 20.8–24.9 with two units for $29–105 each, connect directly to the Pi's CSI ports, and
deliver ISP-processed frames with libcamera timestamps. A reCamera sends H.264/H.265 or JPEG over
Ethernet, with an unmeasured latency (about 2 s for the 2002's RTSP [O1]). A 2002 unit delivers at
most DPT 15.9.

### Beyond the question: three Pros

Three Pros with the sensor turned 90° and 8.5 mm lenses reach DPT 25.5 (calc above). Each runs on
about 0.72 × 1.0 m of the layout (its third plus 50 mm). At DPT 20 that is 1,593 × 2,222 px, six 1024
tiles: 0.13 TFLOP/s for n and 0.51 for s at 1.5 Hz, so 38 % and 81 % of the burst figures (calc). It
costs about $900 plus lenses and rests on the same unknowns as (b): YOLO26-OBB on RKNN 2.3.2, input
size, sustained throughput and heat. Three units also need their L0 outputs merged, which the
two-camera design already needs.

## What must be measured

Only the Pro is worth measuring, and only if (b) or the three-unit setup is wanted.

- On an x86 Linux host, before buying: export YOLO26n-OBB and YOLO26s-OBB with Ultralytics
  `format="rknn", name="rv1126b"` at 1024 and 2048, with RKNN-Toolkit2 2.3.2 (Seeed's firmware
  version) and with 2.4.x. Record whether each builds and the misses and phantoms on the held-out
  frames of #37 in the toolkit's simulator, INT8 against FP32 [S3].
- On a Pro: whether the 2.3.2 runtime loads the model; ms per tile at 1024 and 2048 for n and s,
  sustained 30 minutes at 1.5 Hz, with NPU clock, SoC temperature and power logged; CPU time of the
  `tail.onnx` decode per tile on the A53 cores.
- Lens: field, distortion and corner DPT of a 5.5 mm and a 6 mm M12 lens on the SC850SL at 1.5 m,
  measured from a calibrated capture as in [S1]; delivered resolution on 2.0 µm pixels.
- Frames: whether a custom process gets 3840 × 2160 RGB frames from the rockit VI pipeline at 1.5 Hz
  with a capture timestamp, and the time from exposure to buffer.
- Heat: the Pro's case temperature and any throttling under continuous load at the ceiling.
- For the 2002 family nothing needs measuring: the ISP limit rules it out at DPT 16 and above.

## Sources

Repository
- [S1] `docs/research/cameras-dpt20.md`, branch `research/cameras-dpt20`.
  https://github.com/rails49/detector/blob/research/cameras-dpt20/docs/research/cameras-dpt20.md
- [S2] `docs/research/hailo-8.md`, branch `research/hailo-8`.
  https://github.com/rails49/detector/blob/research/hailo-8/docs/research/hailo-8.md
- [S3] #37, "Accuracy by model and DPT" and Resolution. https://github.com/rails49/detector/issues/37
- [S4] `docs/research/compute-per-area.md`, branch `research/compute-per-area` (GFLOPs per Mpx,
  tiling method, attention share).
  https://github.com/rails49/detector/blob/research/compute-per-area/docs/research/compute-per-area.md
- [S5] `SPEC.md` § Minimum DPT. https://github.com/rails49/detector/blob/main/SPEC.md#minimum-dpt

Seeed Studio wiki (source in `Seeed-Studio/wiki-documents`, branch `docusaurus-version`)
- [W1] reCamera 2002 Series, hardware and specs (1 TOPS, SG2002, 256 MB, OV5647, 3.46 mm, 65°,
  100 Mbps, 5 V 1 A, 40 × 40 × 36.5 mm). https://wiki.seeedstudio.com/recamera_2002_series_hardware_and_specs/
- [W2] reCamera HQ PoE, hardware and specs (GC2053, M12, 2.9 mm, 93°/84°/54°, 802.3af Mode A,
  −20–50 °C). https://wiki.seeedstudio.com/reCamera_hq_poe_hardware_and_specs/
- [W3] reCamera Gimbal, hardware and specs (OV5647 full size 15 fps, 12 V 185 mA).
  https://wiki.seeedstudio.com/recamera_gimbal_hardware_and_specs/
- [W4] reCamera Pro hardware specifications (RV1126B, 3 TOPS mixed INT8/INT16, SC850SL 4K30, GbE,
  PoE). https://wiki.seeedstudio.com/recamera_pro_hardware_specifications/
- [W5] YOLO11n benchmarking on reCamera (20 FPS, 50 ms, 1.5 W, 640, INT8).
  https://wiki.seeedstudio.com/recamera_benchmarking/
- [W6] Real-time YOLO object detection using reCamera based on C++ (infer 40 ms, post 395 ms).
  https://wiki.seeedstudio.com/real_time_yolo_object_detection_using_recamera_based_on_cpp/
- [W7] reCamera Pro, AI and NPU development (RKNN 2.3.2 baseline, "Do not overwrite the library").
  https://wiki.seeedstudio.com/recamera_pro_ai_npu_development/
- [W8] reCamera Pro, video and ISP development (rockit, RGA, rkipc, go2rtc, sensor drivers,
  expansion camera overlay, JPEG and low-delay samples). https://wiki.seeedstudio.com/recamera_pro_video_isp_development/
- [W9] Model conversion guide, SG2002 (TPU-MLIR, output names before the head, `--processor cv181x`).
  https://wiki.seeedstudio.com/recamera_model_conversion/
- [W10] reCamera Pro, RKNN-Toolkit2 conversion (2.3.2, static input, Ultralytics export).
  https://wiki.seeedstudio.com/recamera_pro_rknn_model_conversion/ and model compatibility,
  https://wiki.seeedstudio.com/recamera_pro_model_compatibility/
- [W11] Seeed, `OSHW-reCamera-Series` readme and hardware index (product matrix; Pro sources not
  published). https://github.com/Seeed-Studio/OSHW-reCamera-Series
- [W12] Seeed, S101 OV5647 and S401 GC2053 sensor boards; SG2002 sensor-driver compatibility.
  https://github.com/Seeed-Studio/OSHW-reCamera-Series/tree/main/hardware/recamera-2002/sensors
  https://github.com/Seeed-Studio/OSHW-reCamera-Series/blob/main/hardware/recamera-2002/SENSOR_COMPATIBILITY.md
- [W13] YOLO11n model conversion for reCamera, workshop guide ("0.5 TOPS"; TPU-MLIR v1.7).
  https://wiki.seeedstudio.com/model_conversion_guide/
- [W14] reCamera landing page data (GC2053 sensor board "Compatible with all reCamera 2002 series
  devices"; M12 lens collection). https://wiki.seeedstudio.com/recamera/ (source:
  `src/components/recamera/productData.ts`)
- [W15] reCamera Pro quick start (12 V, 1 A minimum, factory 12 V 3 A; "adjust the lens").
  https://wiki.seeedstudio.com/recamera_pro_getting_started/
- [W16] reCamera Pro, preview, capture and manual recording. https://wiki.seeedstudio.com/recamera_pro_live_preview/
- [W17] reCamera Pro start page. https://wiki.seeedstudio.com/recamera_pro/
- [W18] reCamera Pro, experimental Debian 13 image. https://wiki.seeedstudio.com/recamera_pro_debian/
- [W19] Seeed wiki, discontinued products. https://wiki.seeedstudio.com/discontinuedproducts/

Seeed Studio software (GitHub and wiki)
- [O1] reCamera, develop with C/C++ (channels, RTSP latency "within approximately 2 seconds").
  https://wiki.seeedstudio.com/recamera_develop_with_c_cpp/
- [O2] `reCamera-OS` CHANGELOG and releases (ION 60 MB, TPU 700 MHz, YOLO26, ONVIF).
  https://github.com/Seeed-Studio/reCamera-OS/blob/main/CHANGELOG.md
- [O3] `reCamera-OS`, `external/build/boards/cv181x/sg2002_recamera_emmc/memmap.py` (ION 60 MB, ISP
  20 MB, H.26x 2 MB). https://github.com/Seeed-Studio/reCamera-OS/blob/main/external/build/boards/cv181x/sg2002_recamera_emmc/memmap.py
- [O4] `sscma-example-sg200x`, `models/README.md` (CV181X model zoo: YOLO11n, YOLO26n at 640;
  segmentation at 512 × 1024). https://github.com/Seeed-Studio/sscma-example-sg200x/blob/main/models/README.md
- [O5] `sscma-example-sg200x`, `solutions/sscma-node/main/node/camera.cpp` and
  `components/sophgo/video/src/video_paramparse.c` (OV5647 2592 × 1944 at 15; JPEG channel 1,920
  limit). https://github.com/Seeed-Studio/sscma-example-sg200x
- [O6] reCamera OS structure (Buildroot, supervisor, sscma, Node-RED).
  https://wiki.seeedstudio.com/recamera_os_structure/
- [O7] reCamera OS version control (OTA). https://wiki.seeedstudio.com/recamera_os_version_control/

Seeed store (prices read 2026-11-01)
- [P1] reCamera 2002w 8GB, $89.90. https://www.seeedstudio.com/reCamera-2002w-8GB-p-6250.html
- [P2] reCamera 2002 64GB page, $99.90. https://www.seeedstudio.com/reCamera-2002-64GB-p-6252.html
- [P3] reCamera 2002 HQ PoE 64GB, $119.90. https://www.seeedstudio.com/reCamera-2002-HQ-PoE-64GB-p-6557.html
- [P4] reCamera Gimbal 2002w 64GB, $229.90. https://www.seeedstudio.com/reCamera-Gimbal-2002w-64GB-p-6403.html
- [P5] reCamera Pro 2GB, $299.90. https://www.seeedstudio.com/reCamera-Pro-2GB.html

Sophgo
- [T1] SG2002 Technical Reference Manual, features and introduction (TPU ~1.0 TOPS INT8; video input
  max 2,880 wide and 5 MP; DDR3 256 MB; ~500 mW).
  https://github.com/sophgo/sophgo-doc/blob/main/SG200X/TRM/contents/en/system-overview/features.rst
- [T2] TPU-MLIR quick start, CV18xx guide and `model_deploy` options (BF16/INT8 on CV181X;
  `op_divide`). https://github.com/sophgo/tpu-mlir/blob/master/docs/quick_start/source_en/Appx.02_cv18xx_guide.rst
  https://github.com/sophgo/tpu-mlir/blob/master/docs/quick_start/source_en/03_onnx.rst
- [T3] TPU-MLIR quick start, quantization (YOLO26 calibration and mixed precision).
  https://github.com/sophgo/tpu-mlir/blob/master/docs/quick_start/source_en/07_quantization.rst
- [T4] TPU-MLIR releases (v1.30.2, 2026-08-31). https://github.com/sophgo/tpu-mlir/releases

Rockchip
- [R1] RV1126B product page (3 TOPS, 12M@30fps ISP, 8M@30fps AI-ISP, five cameras).
  https://www.rock-chips.com/a/en/products/RV11_Series/2025/1208/2118.html
- [R2] `airockchip/rknn_model_zoo` README v2.5.0 (benchmark table incl. RV1126B; YOLO26 from 2.4.2;
  SDK version table). https://github.com/airockchip/rknn_model_zoo
- [R3] `rknn_model_zoo/examples/yolo26/README.md` (truncated one-to-one head, no NMS).
  https://github.com/airockchip/rknn_model_zoo/tree/main/examples/yolo26

Ultralytics
- [U1] Rockchip RKNN export (all tasks incl. OBB; INT8 ends at head convolutions; `tail.onnx`;
  rv1126b FP16 and INT8; simulator-only INT8 validation). https://docs.ultralytics.com/integrations/rockchip-rknn/
- [U2] Seeed Studio reCamera integration (ONNX, then Seeed's cvimodel conversion).
  https://docs.ultralytics.com/integrations/seeedstudio-recamera/
- [U3] YOLO11 model page (YOLO11n 6.5, YOLO11s 21.6 GFLOPs at 640). https://docs.ultralytics.com/models/yolo11/
- [U4] YOLO26 model page and performance tables (YOLO26n 5.5, s 20.9 at 640; n-obb 14.8, s-obb 56.7
  at 1024). https://docs.ultralytics.com/models/yolo26/
- [U5] `ultralytics/utils/export/rknn.py` (`rknn-toolkit2>=2.3.2,<2.5`).
  https://github.com/ultralytics/ultralytics/blob/main/ultralytics/utils/export/rknn.py

Secondary
- [N1] CNX Software, "reCamera Pro 'Open AI Camera' ...", 2026-07-17 (SC850SL 1/1.8", 2.0 µm, M12 ×
  0.5, 2.75 mm f/2.4, 123° ± 5°, 89.8 × 67 × 67 mm, 324 g, shipping 2026-07-29).
  https://www.cnx-software.com/2026/07/17/recamera-pro-open-ai-camera-supports-computer-vision-llm-vlm-stt-and-tts-workloads/
- [N2] OpenELAB and Pakronics listings of Seeed's M12 lenses (20° = 16 mm, 15° = 22 mm; no lens
  change on the Gimbal) (search snippets). https://openelab.io/products/seeed-studio-m12-telephoto-lens-for-recamera-5mp-20
  https://www.pakronics.com.au/products/m12-fisheye-lens-for-recamera-5mp-160-ss100095034
- [N3] OpenELAB, reCamera Pro 2GB listing (M12, CS and C mount claim) (search snippet).
  https://openelab.com/products/seeed-studio-recamera-pro-2gb-open-ai-camera
- [N4] M5Stack, CamModule SC850SL (3856 × 2176, 2.0 µm, 1/1.8").
  https://docs.m5stack.com/en/accessory/CamModule_SC850SL
- [L1] Arducam, 1/1.8" 4K low-distortion M12 lenses, 5.5 mm (LN079) and 8.5 mm (LN078) (search
  snippets; the pages refused direct fetches). https://www.arducam.com/blog/product/4k-5-5mm-low-distortion-m12-lens-ln079/
  https://www.arducam.com/4k-8-5mm-low-distortion-m12-lens-ln078.html
- [L2] Commonlands, CIL062 6 mm M12 lens for 1/1.8", 9.0 mm image circle, distortion < 1 % (search
  snippet). https://commonlands.com/products/no-distortion-6mm-m12-lens

SmartSens's own SC850SL page gives "8MP" and rolling shutter but no pixel size or format
(https://www.smartsenstech.com/en/page?id=155); the sensor size here rests on [N1] and [N4].
