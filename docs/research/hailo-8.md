# Hailo-8 on a Raspberry Pi 5 or a fanless mini PC

Written 2026-11-01. Research for [issue #52](https://github.com/rails49/detector/issues/52), under map
[#31](https://github.com/rails49/detector/issues/31). It builds on `docs/research/compute-hardware.md`
on branch `research/compute-hardware` [S1] and `docs/research/cameras.md` on branch `research/cameras`
[S2], and uses the same unit: effective TFLOP/s = Ultralytics GFLOPs at the stated input ÷ time per
frame.

Sources are listed at the end and cited as [S1], [S2], and so on. Sources marked "secondary" are third
parties; everything else is Hailo, Raspberry Pi or Ultralytics. Numbers marked "estimate" are arithmetic
or inference done here, with the method shown. Nothing was measured on a device for this note. Prices
were read on 2026-11-01 unless dated otherwise.

## Answer

1. No Hailo path runs YOLO26-OBB today. Ultralytics' `format="hailo"` export states that "YOLO26-OBB is
   not currently supported" [S14]. The Hailo Model Zoo has YOLO26 detect (n, s, m), YOLO26 instance and
   semantic segmentation, and YOLO11-OBB (n to x), but no YOLO26-OBB, on any chip [S4–S11].
2. The NMS-free head is kept only in part. For YOLO26 detect, the zoo cuts the graph at the six
   one-to-one head convolutions. The chip runs the network through those convolutions; sigmoid, box decode and the
   two-stage top-k run on the host, with no NMS [S9, S10]. For YOLO11-OBB the host also decodes the
   angle and runs rotated NMS [S10]. A YOLO26-OBB build would follow the same pattern with the angle
   branch added (estimate, not tried).
3. Burst throughput on Hailo's x86 test host (PCIe Gen 3 x4) for YOLO11-OBB at 1024 is 1.7–3.0 TFLOP/s
   for n and 3.5–5.1 for s on Hailo-8, 1.4–2.5 and 2.7–3.3 on Hailo-8L, and 2.9–3.2 and 4.7–7.4 on
   Hailo-10H (batch 1 – batch 8) [S5–S7].
4. Any model that does not fit in one context is much slower than one that does. YOLOv8s fits in one
   context on Hailo-8 and reaches 14.0 TFLOP/s; YOLO26s at the same input needs three and reaches 2.0
   [S4, S12]. Every YOLO26 and every OBB model in the zoo is multi-context.
5. On a Pi 5, the single PCIe lane costs a Hailo-8 about 40–50 % of the zoo figure for multi-context
   models: published Pi 5 runs reach 48–63 % of it [S22, S39, S40]. Hailo staff say the same in words:
   performance on the Pi "is blocked by the single lane issue" [S22]. The Hailo-10H keeps context
   switches in its own DRAM [S23] and reached 97 % of its zoo figure for YOLO11l on a Pi 5 [S39].
6. Against the workload (estimate, below): a Pi 5 with a Hailo-8 covers n at DPT 20 with margin (busy
   25–53 % of each second), n at DPT 25 without margin (45–95 %), s at DPT 20 only at the top of the
   range (59–104 %), and not s at DPT 25. A Pi 5 with a Hailo-10H covers s at DPT 20–25 (25–67 %). A
   Hailo-8 in an x86 box with a Gen 3 x4 M.2 slot covers n and s at DPT 20–25 (15–87 %).
7. 2048 × 2048 inputs are unverified on any Hailo chip. The largest Hailo-8 zoo input is 1024 × 2048,
   for YOLO26 semantic segmentation, at 3.3–5.1 TFLOP/s [S8]. A user compiled YOLOv8s at 3008 × 2240 for
   Hailo-10H and ran it on a Pi 5 at 4.7 TFLOP/s [S25]. YOLO26-OBB has attention blocks at stride 32
   (C2PSA); at 2048 they see 4,096 positions, twice the 1024 × 2048 case that compiled. Hailo staff name
   attention transposes as a known size limit [S24].
8. INT8 on Hailo loses 0.7–1.2 mAP for YOLO11-OBB on DOTA and 1.6–2.2 mAP for YOLO26 detect on COCO,
   with the zoo's settings (all 8-bit for YOLO11-OBB; some 16-bit layers for YOLO26) [S4, S5, S9, S12]. Ultralytics' own export kept
   about 93 % of YOLO26n's mAP50, against about 96 % for YOLO11n [S14]. How that maps to missed cars is
   unknown. Hailo's emulator can measure it on an x86 Linux host before any hardware is bought [S13].
9. No published test runs a Hailo chip under load for hours, on a Pi or in a mini PC. The M.2 module's
   maximum is 8.25 W at full utilization; Hailo's typical figures are 2.4–3.3 W [S19]. HailoRT has
   temperature-protection zones and up to four throttling levels [S20]; the only published thresholds
   (throttling from 104 °C, shutdown at 120 °C) come from a third party without a citation [S41].
10. The tiles themselves use a small part of the link. 2048 × 2048 RGB tiles at the DPT 20–25
    rate are 98–174 MB/s, against 500 MB/s for Gen 2 x1 and about 985 MB/s for Gen 3 x1 (estimate).
    The unknown is the context-switch traffic, which no Hailo document quantifies.
11. Prices: Pi 5 8 GB $175 [S35]; AI HAT+ 26 TOPS (Hailo-8) $119.95, 13 TOPS (Hailo-8L) $76.95 [S35];
    AI HAT+ 2 (Hailo-10H) $200 at Raspberry Pi [S32]. Bare M.2 modules in September 2026: Hailo-8 $169,
    Hailo-8L $85, Hailo-10H 4 GB $212.50 [S36]. Fanless N150 boxes start at about $218–247 barebones,
    but the ones checked have x1 M.2 slots [S38].

## The workload

From issue #37's resolution and its accuracy table [S3]: n and s at DPT 20–25 are the accuracy pick, and
need these sustained TFLOP/s over the whole 2 × 1 m layout at 1.5 Hz:

| Model | DPT 20 | DPT 25 |
| :--- | ---: | ---: |
| n | 0.46 | 0.82 |
| s | 1.8 | 3.0 |

YOLO26-OBB costs 14.8 (n) and 56.7 (s) GFLOPs at 1024 [S1], so about 59 and 227 GFLOPs at 2048
(× 4, estimate). That is about 5 tiles of 2048 × 2048 per refresh at DPT 20 and about 9 at DPT 25
(estimate: TFLOP per refresh ÷ GFLOPs per tile).

Hailo's "OPS (G)" column matches Ultralytics GFLOPs where both exist: YOLO26n, s, m 5.5, 20.9, 68.4;
YOLOv8s 28.6 [S4]. So Hailo FPS × Hailo OPS gives the same unit as the earlier notes. YOLO11-OBB at 1024
is 17.25 (n) and 57.94 (s) GOPs in the zoo [S5], close to YOLO26-OBB's 14.8 and 56.7.

## Software support

### Toolchain

- Two separate stacks. Hailo-8 and 8L use Dataflow Compiler (DFC) 3.x and HailoRT 4.x; Hailo-10H and
  Hailo-15 use DFC 5.x and HailoRT 5.x. The artifacts are not interchangeable [S14]. HailoRT's
  `master` branch supports only Hailo-10 and Hailo-15; Hailo-8 is on a `hailo8` branch [S20]. On a Pi,
  `hailo-all` (AI HAT+) and `hailo-h10-all` (AI HAT+ 2) cannot be installed together [S28].
- Current versions: Model Zoo v2.20 with DFC 3.34.0 and HailoRT 4.24.0 for Hailo-8/8L; Model Zoo v5.5.0
  with DFC 5.5.0 and HailoRT 5.5.0 for Hailo-10H [S11].
- Compilation needs Linux x86_64. Inference does not need the DFC [S14]. Each HEF is compiled for one
  fixed input size [S14].
- Ultralytics export: `model.export(format="hailo", name="hailo8")`, INT8 only, optimization level 2
  forced [S14]. Detection is listed for YOLOv8, YOLO11 and YOLO26; OBB for YOLOv8 and YOLO11 only,
  validated on Hailo-8L with DFC 3.33 and HailoRT 4.23, not validated on Hailo-10H [S14].
- Runtime path: HailoRT from C++ or Python on the host. It is not an ONNX Runtime execution provider,
  so the detector would run as a native process, not in the browser (from [S14, S20]; no ONNX Runtime
  integration exists in the HailoRT repository).

### YOLO26 and the NMS-free head

- The zoo added YOLO26 detect n, s, m in v2.18 as "End-to-end NMS-free object detection models", and
  YOLO26 segmentation in v2.19–v2.20 [S11].
- The YOLO26 config ends the chip graph at `/model.23/one2one_cv2.{0,1,2}` and
  `/model.23/one2one_cv3.{0,1,2}`, with `nms: false` on the device [S9]. The host then applies sigmoid,
  decodes boxes, and runs `yolo26_filter`, which "match[es] ultralytics get_topk_index logic": top-k
  anchors by best class score, then top-k (anchor, class) pairs. No NMS runs [S10].
- So the one-to-one head's weights run on the chip and its decode runs on the host. Output per 2048
  tile would be 86,016 anchors × (4 box + 1 angle + 1 class) values, about 1 MB at 16 bits (estimate).
- Ultralytics' export gives YOLO26 detect raw tensors with host NMS by default, and NMS-free one-to-one
  outputs with `nms=False` [S14].

### OBB

- The zoo's YOLO11-OBB configs end at the nine head convolutions (`cv2`, `cv3`, `cv4` at three scales).
  The host decodes the angle and runs rotated NMS with probabilistic IoU (`batch_probiou`) [S9, S10].
- YOLO26-OBB is in neither the zoo nor Ultralytics' export [S5, S14]. Ultralytics' YOLO26-OBB graph is
  the YOLO26 backbone plus an `OBB26` head [S9 for the zoo's YOLO26 cut; the OBB26 head is in the
  installed Ultralytics package's `yolo26-obb.yaml`]. Cutting it at its one-to-one `cv2`/`cv3`/`cv4`
  convolutions and decoding on the host would match both zoo patterns. Not tried; whether the parser
  accepts it is unverified.
- Ultralytics says embedded Ultralytics NMS is not supported on Hailo, and that segmentation, pose and
  OBB outputs are "raw head tensors decoded on the host" [S14].

## Input size and context switching

- Hailo-8 keeps all memory on the die: "Does not require external memory" [S15]. A model that does not
  fit is split into contexts that the chip loads in turn. A Hailo engineer: for an LLM on Hailo-8, "that
  would require 100+ context switches. This would require lot of work and RAM from the host." The
  Hailo-10H "has a DDR interface and a local DDR memory on the module to free the host from the context
  switch management" [S23]. It carries 4 or 8 GB of LPDDR4/4X [S18].
- Context counts from the zoo's Hailo-8 profiler reports (v2.20.0) [S12]:

  | Model | Input | Contexts | FPS, batch 1 | Effective TFLOP/s |
  | :--- | :--- | ---: | ---: | ---: |
  | YOLOv8s | 640 | 1 | 492 | 14.0 |
  | YOLO26n | 640 | 3 | 155 | 0.85 |
  | YOLO26s | 640 | 3 | 97.7 | 2.0 |
  | YOLO11n-OBB | 1024 | 3 | 100 | 1.7 |
  | YOLO11s-OBB | 1024 | 3 | 59.8 | 3.5 |

  The YOLO26 model scripts set 16-bit precision on several layers and all six outputs (`a16_w16`) [S9].
  The zoo does not say why YOLO26s needs three contexts where YOLOv8s needs one.
- Hailo staff on the Pi: "Especially for multi-context networks PCIe bandwidth will influence the
  maximum FPS you can reach", and the zoo's figures "are for a Hailo device connected to a system with
  4 PCIe lanes and a x86 CPU" (2024-11-09) [S21]. In 2025 a Pi 5 user reported that only YOLOv8s ran in
  real time because it fits in one context [S22].
- Largest inputs in the zoo [S4, S8]:

  | Chip | Model | Input | FPS b1 / b8 | GOPs | TFLOP/s b1 / b8 |
  | :--- | :--- | :--- | :--- | ---: | :--- |
  | Hailo-8 | yolo26n_sem | 1024 × 2048 | 143 / 143 | 23.9 | 3.4 / 3.4 |
  | Hailo-8 | yolo26s_sem | 1024 × 2048 | 36.7 / 45.0 | 91.1 | 3.3 / 4.1 |
  | Hailo-8 | yolo26m_sem | 1024 × 2048 | 13.6 / 16.7 | 305.6 | 4.2 / 5.1 |
  | Hailo-8L | yolo26s_sem | 1024 × 2048 | 21.3 / 23.2 | 91.1 | 1.9 / 2.1 |
  | Hailo-10H | yolo26s_sem | 1024 × 2048 | 57.2 / 80.0 | 91.1 | 5.2 / 7.3 |
  | Hailo-8 | yolov5m6 | 1280 × 1280 | 32.7 / 50.0 | 200.0 | 6.5 / 10.0 |

  The semantic models share the YOLO26 backbone but not the detection head. They show that a YOLO26
  backbone at 2.1 MP compiles and runs on Hailo-8; 2048 × 2048 is 4.2 MP.
- Input size limits. Hailo staff: "the DFC docs don't actually give you a hard upper limit for input
  tensor dimensions"; some transposes "only work if the entire tensor is smaller than 1.5MB when
  quantized"; 1280 × 720, 640 × 640 and 1280 × 1920 "compile pretty reliably"; a YOLO11l at 2592 × 1664
  for Hailo-8L failed in a matmul and in softmax reshapes (2025-05-26) [S24]. Ultralytics reports an
  attention block whose 16-bit-output mode "fails allocation" [S14].
- YOLO26-OBB has C2PSA attention at stride 32. At 2048 that is 64 × 64 = 4,096 positions, against
  2,048 for the 1024 × 2048 semantic models that compiled (estimate). This is the most likely place for
  a 2048 compile to fail. A 1024 tile has 1,024 positions, like the zoo's YOLO11-OBB.
- Hailo-10H, user report on Hailo's forum (secondary, October 2026, DFC 5.3.0, Pi 5): YOLOv8s compiled
  at 3008 × 2240 (3 contexts) and ran at 10.06 FPS at optimization level max; at 4064 × 3040 (6 contexts)
  it ran at 2.06 FPS at level 0, and failed at higher levels [S25]. That is about 470 and 863 GFLOPs per
  frame, so 4.7 and 1.8 TFLOP/s (estimate). 2560 × 1920 compiled into 3 contexts. A Hailo engineer asked
  for logs and said the failures should be "easy to solve" in later versions [S25].

## Throughput

### Hailo's published figures (x86 host, PCIe Gen 3 x4)

Model Zoo tables, measured on an Intel Core i5-9400 host at "PCIe Gen 3 x 4 lanes, room temperature"
[S4–S7]. Hailo staff on the method: "We push as many frames into the device as possible for a few
seconds and count them" [S21]. These are short bursts.

YOLO11-OBB, DOTAv1, 1024 × 1024. FPS at batch 1 / batch 8, then effective TFLOP/s:

| Model | GOPs | Hailo-8 | Hailo-8L | Hailo-10H |
| :--- | ---: | :--- | :--- | :--- |
| n | 17.25 | 100 / 176 → 1.7 / 3.0 | 78.5 / 146 → 1.4 / 2.5 | 170 / 185 → 2.9 / 3.2 |
| s | 57.94 | 59.6 / 87.9 → 3.5 / 5.1 | 45.9 / 56.5 → 2.7 / 3.3 | 80.7 / 128 → 4.7 / 7.4 |
| m | 183.59 | 23.1 / 38.5 → 4.2 / 7.1 | 15.7 / 22.3 → 2.9 / 4.1 | 34.4 / 45.5 → 6.3 / 8.4 |
| l | 232.9 | 17.0 / 27.6 → 4.0 / 6.4 | 9.97 / 13.0 → 2.3 / 3.0 | not listed |
| x | 521.61 | 6.98 / 9.42 → 3.6 / 4.9 | 3.99 / 4.35 → 2.1 / 2.3 | 11.3 / 13.9 → 5.9 / 7.3 |

YOLO26 detect, COCO, 640 × 640:

| Model | GOPs | Hailo-8 | Hailo-8L | Hailo-10H |
| :--- | ---: | :--- | :--- | :--- |
| n | 5.5 | 154 / 427 → 0.85 / 2.3 | 111 / 255 → 0.61 / 1.4 | 234 / 311 → 1.3 / 1.7 |
| s | 20.9 | 97.8 / 263 → 2.0 / 5.5 | 66.5 / 147 → 1.4 / 3.1 | 125 / 215 → 2.6 / 4.5 |
| m | 68.4 | 48.6 / 95.2 → 3.3 / 6.5 | 28.6 / 47.1 → 2.0 / 3.2 | 58.8 / 102 → 4.0 / 7.0 |

For comparison on Hailo-8: YOLO11n 1.2 / 3.5, YOLO11s 2.4 / 6.5, YOLOv8m 5.3 / 11.8, YOLOv8l
6.0 / 10.7 TFLOP/s [S4].

- Batch 8 lifts multi-context models by 1.1–2.8×, likely because each context is loaded once per batch rather than once per frame (inference). The
  live detector sends about 5–9 tiles per refresh, so batches of 4–8 are available (estimate).
- Hailo-10H is rated 20 TOPS INT8 against 26 for Hailo-8 [S16, S18], yet is faster at batch 1 on
  every multi-context model above. Its DRAM is the likely reason [S23] (inference).
- The OBB figures are in the same range as the Jetson Orin Nano Super (1.2 for n to 7.3 INT8 for l) in
  the compute-hardware note [S1].

### On a Raspberry Pi 5 (PCIe x1)

The Pi 5's external PCIe is "PCIe 2.0 x1" [S33]; Raspberry Pi gives 500 MB/s peak [S29]. The AI HAT+
and AI HAT+ 2 switch it to Gen 3 automatically [S28]. Raspberry Pi warns that "The Raspberry Pi 5 isn't
certified for Gen 3.0 speeds. PCIe Gen 3.0 connections might be unstable" [S29]. Gen 3 x1 is about
985 MB/s per direction (8 GT/s × 128/130 ÷ 8, estimate).

All Pi 5 figures found are third-party:

| Source | Chip | Model, input | Mode | FPS | TFLOP/s | Share of zoo figure |
| :--- | :--- | :--- | :--- | ---: | ---: | ---: |
| Sixfab, 2026-07 [S39] | Hailo-8 | YOLOv8l, 640 | NPU async | 19.6 | 3.2 | 54 % of b1 |
| Sixfab [S39] | Hailo-8 | YOLO11l, 640 | NPU async | 21.4 | 1.9 | 56 % of b1 |
| Sixfab [S39] | Hailo-8 | YOLO26n, 640 | NPU async | 96.7 | 0.53 | 63 % of b1 |
| Sixfab [S39] | Hailo-10H | YOLOv8l, 640 | NPU async | 40.0 | 6.6 | — |
| Sixfab [S39] | Hailo-10H | YOLO11l, 640 | NPU async | 41.6 | 3.6 | 97 % of b1 |
| Sixfab [S39] | Hailo-10H | YOLO26n, 640 | NPU async | 83.5 | 0.46 | 36 % of b1 |
| Seeed, 2024-11 [S40] | Hailo-8 | YOLOv8m, 640, batch 8 | Gen 3 / Gen 2 | 77.0 / 39.8 | 6.1 / 3.1 | 52 / 27 % of b8 |
| Hailo forum, 2025-09 [S22] | Hailo-8 | YOLO11m, 640 | `hailortcli` | 24.2 | 1.6 | 48 % of b1 |
| Hailo forum, 2026-10 [S25] | Hailo-10H | YOLOv8s, 3008 × 2240 | on device | 10.06 | 4.7 | — |

- Ultralytics' own figure, "Raspberry Pi 5 + AI HAT+ (Hailo-8)": YOLO26n detection in 21.7 ms,
  inference only, input not stated [S14]. At the default 640 that is 0.25 TFLOP/s, a third of the
  zoo's batch-1 figure. It is likely one frame at a time rather than pipelined (inference).
- Sixfab's end-to-end runs in Python were 8–15 FPS for these models on both chips, limited by the host
  [S39]. Sixfab sells a competing DEEPX board.
- Gen 3 doubled Hailo-8 throughput over Gen 2 for YOLOv8m [S40]. For ssd_mobilenet_v2 a forum user
  measured 81 FPS at Gen 2 x1 and 126 at Gen 3 x1, and 126 on an x86 PC also trained at Gen 3 x1
  (secondary) [S42].
- A third-party Hailo-8 power test found the same ResNet-50 FPS on an x1 and an x4 M.2 slot (1,371) [S41].
  ResNet-50 is single-context. The x1 penalty applies to multi-context models.

Planning factor (estimate): a Hailo-8 on a Pi 5 at Gen 3 reaches 0.5–0.6 of the zoo figure for
multi-context models. The Hailo-10H reached 0.97 for YOLO11l but 0.36 for YOLO26n; the second is
probably host overhead on a small model.

### Against the workload

Fraction of each second the accelerator is busy at 1.5 Hz, using YOLO11-OBB at 1024 as a stand-in for
YOLO26-OBB at 2048 (estimate). Ranges run from the batch-1 figure × the low planning factor to the
batch-8 figure × the high one. Over 100 % does not fit.

| Setup | Effective n / s (TFLOP/s) | n DPT 20 | n DPT 25 | s DPT 20 | s DPT 25 |
| :--- | :--- | ---: | ---: | ---: | ---: |
| Pi 5 + Hailo-8 (× 0.5–0.6) | 0.86–1.8 / 1.7–3.1 | 25–53 % | 45–95 % | 59–104 % | 98–173 % |
| Pi 5 + Hailo-8L (× 0.5–0.6) | 0.68–1.5 / 1.3–2.0 | 30–68 % | 54–121 % | 92–135 % | over |
| Pi 5 + Hailo-10H (× 0.36–0.97) | 1.1–3.1 / 4.5–7.2 | 15–44 % | 26–78 % | 25–40 % | 42–67 % |
| x86 box, Gen 3 x4, Hailo-8 (zoo) | 1.7–3.0 / 3.5–5.1 | 15–27 % | 27–47 % | 35–52 % | 59–87 % |
| x86 box, Gen 3 x4, Hailo-10H (zoo) | 2.9–3.2 / 4.7–7.4 | 14–16 % | 26–28 % | 24–38 % | 40–64 % |

The Pi 5 + Hailo-10H s range assumes the YOLO11l share (0.97) holds for s; the n range uses both
shares.

Three things could move these numbers, none of them published:

- 2048 tiles may need more contexts than 1024, and on Hailo-8 each extra context adds traffic over the
  x1 link. Effective throughput at 2048 could be lower than at 1024. On Hailo-10H the 3008 × 2240 YOLOv8s
  run kept 4.7 TFLOP/s [S25].
- YOLO26-OBB may compile into a different number of contexts than YOLO11-OBB. On Hailo-8, YOLO26 detect
  is slightly slower than YOLO11 detect at the same size: s 2.0 against 2.4 TFLOP/s at batch 1 [S4].
- The compute-hardware note plans against half the burst figure until a sustained run exists [S1].
  Hailo's throttling is a firmware step at a temperature zone, not a gradual clock loss (next section),
  but no hours-long run is published. Halving the Pi 5 + Hailo-8 row leaves only n at DPT 20 inside
  100 %.

## INT8 accuracy

- Hailo quantizes weights and activations to 4, 8 or 16 bits, with equalization, bias correction (IBC)
  and quantization-aware fine-tuning (QFT). Hailo recommends a GPU machine and at least 1,024 calibration
  images. `hailomz eval --target emulator` measures the quantized model's accuracy on the host [S13].
- The zoo's YOLO26 model scripts use optimization level 4, AdaRound, and 16-bit (`a16_w16`) for four
  depthwise layers, six convolutions and all six outputs [S9]. The YOLO11-OBB reports show level 2 and
  all layers at 8 bits [S12].
- Float against hardware mAP from the zoo [S4–S7]:

  | Model | Hailo-8 | Hailo-8L | Hailo-10H |
  | :--- | :--- | :--- | :--- |
  | YOLO11n-OBB (DOTA mAP) | 49.7 → 48.7 | 49.7 → 48.7 | 49.7 → 48.2 |
  | YOLO11s-OBB | 53.2 → 52.4 | 53.2 → 52.4 | 53.2 → 52.2 |
  | YOLO11m-OBB | 55.1 → 53.9 | 55.1 → 53.9 | 55.1 → 54.1 |
  | YOLO26n (COCO mAP) | 40.0 → 38.4 | 40.0 → 38.4 | 40.0 → 38.6 |
  | YOLO26s | 47.5 → 45.3 | 47.5 → 45.3 | 47.5 → 45.7 |
  | YOLO26m | 52.3 → 50.6 | 52.3 → 50.6 | 52.3 → 50.9 |

- Ultralytics' export (level 2, COCO128 calibration) on Hailo-8L kept about 100 % of mAP50 for YOLOv8n,
  96 % for YOLO11n and 93 % for YOLO26n, and advises: "Lower `conf` by about 0.05 for YOLO26
  deployments." On a Pi 5 + Hailo-8, YOLO26n mAP50-95 was 0.455 against 0.477 in PyTorch [S14]. It also
  warns that out-of-domain calibration images hurt accuracy [S14].
- Our ONNX Runtime static INT8 kept n and s within 2 misses of FP32 at every DPT [S3]. Hailo's
  quantizer is different, and YOLO26 loses more on Hailo than YOLO11 does. Whether n and s stay within
  2 misses is unknown. The emulator can answer it on an x86 Linux host with the held-out frames.

## Sustained load and thermals

- Power. Hailo-8 chip: "typical power consumption of 2.5W" [S15]. Hailo-8L: 1.5 W typical [S17].
  Hailo-10H M.2: 2.5 W typical [S18]. The Hailo-8 M.2 Key B+M module datasheet: TDP 8.65 W, "Maximum
  power consumption is 8.25W ... at full utilization", 3.3 W for ResNet-50 at 915 FPS and 2.4 W for
  MobileNet-SSD at 996 FPS [S19].
- Cooling guidance. The datasheet: "Proper heat dissipation must be employed to ensure that the
  Hailo-8 chip does not overheat," with most heat leaving through the top of the package [S19]. A Hailo
  engineer: "It's recommended to use thermal pads (heatsink isn't necessary)" (2025-08-04) [S26]. The
  AI HAT+ is rated for 0–50 °C ambient and ships with spacers to fit over the Active Cooler [S31].
  Raspberry Pi recommends an Active Cooler on the Pi 5 under the AI HAT+, and recommends the supplied
  heatsink on the AI HAT+ 2 for "intensive AI workloads", which it says "prevents your AI HAT+ 2 from
  slowing down due to overheating" [S27]. The Pi 5 "will perform best with active cooling" [S33].
- Throttling. HailoRT defines green, orange and red temperature-protection zones and throttling states
  from light to severe, then streams off and overheat [S20]. Hailo's public documents give no
  thresholds. A third-party power study gives green below 104 °C, frequency throttling to as low as
  50 % from 104 °C, and streams shut down from 120 °C, without citing a Hailo document (secondary)
  [S41].
- Measured temperatures. On a Pi 5 with extruded heatsinks, Hailo-8 ran at 39–51 °C and the Hailo-10H
  reached 68.1 °C on YOLOv8x on an open bench; duration not stated (secondary) [S39]. Average system
  power in sync mode: 6.53 W with Hailo-8, 7.59 W with Hailo-10H; idle 3.6–3.9 W [S39].
- Not found: any run longer than a benchmark, any fanless Pi 5 run, and any test in a closed fanless
  mini PC. At 1.5 Hz the duty cycle in the table above is 15–100 %, so the chip may sit well below its
  8.25 W maximum (estimate).

## Host link and cameras

- Tile traffic. A 2048 × 2048 RGB tile is 12.6 MB. About 5 tiles per refresh at DPT 20 and 9 at DPT 25,
  at 1.5 Hz, is 98–174 MB/s to the chip: 20–35 % of Gen 2 x1, 10–18 % of Gen 3 x1 (estimate). Output is
  about 1 MB per tile (estimate, above). The context-switch traffic adds to this and is not documented;
  the profiler reports list an `inter_context_bw` per context without a stated unit [S12].
- The Pi 5's external PCIe x1 is separate from its I/O. USB, Ethernet and the camera connectors are on
  RP1, which "connects to the main CPU (BCM2712) ... over a PCIe 2.0 x4 link" [S30]. Cameras do not share
  the Hailo's lane.
- Pi HQ cameras. Two per Pi 5 over CSI-2; two HQ cameras with 6 mm lenses give DPT 23 over the layout at
  up to 10 fps [S2]. They arrive as YUV from the Pi's ISP, so the CPU only cuts tiles.
- USB3 bodies. The Pi 5 has two USB 3.0 controllers, 5 Gbps each [S30]. A 20 MP IMX183 body reaches
  DPT 20 [S2]; at 1.5 Hz its 8-bit raw frames are about 30 MB/s (estimate). The Pi's CPU must demosaic
  them; not measured.
- iPhone over the network. Gigabit Ethernet on RP1 [S30], about 117 MB/s. A 48 MP still at 1.5 Hz fits
  if each file is under about 70 MB (estimate). Decoding 48 MP HEIF or JPEG on the Pi's CPU at 1.5 Hz is
  not measured.
- Host CPU work. The Pi's CPU cuts and converts about 8–14 tiles per second and runs the YOLO26 top-k
  over 86,016 anchors per tile. Sixfab's Python pipelines were host-limited at 8–15 FPS on 640 inputs
  [S39]; Hailo staff point to asynchronous, multi-threaded inference for full throughput [S21]. Not
  measured at this tile size.
- Mini PCs. The zoo figures assume Gen 3 x4. The fanless N150 boxes checked have x1 M.2 slots: the HUNSN
  RJ42 and RJ43 have "two M.2 2280 slots, each with PCIe NVMe x1 lanes" [S38]. A box with an x1 slot is
  in the Pi's position, at Gen 3. A Hailo-8 in an x4 slot needs a box whose spec sheet states x4.

## Prices

| Item | Price | Source |
| :--- | :--- | :--- |
| Raspberry Pi 5 4 GB | $110, out of stock | PiShop.us [S35] |
| Raspberry Pi 5 8 GB | $175 | PiShop.us [S35] |
| Raspberry Pi 5 16 GB | $305 | Raspberry Pi [S33] |
| AI HAT+ 13 TOPS (Hailo-8L) | $76.95 | PiShop.us [S35] |
| AI HAT+ 26 TOPS (Hailo-8) | $119.95; launched at $110 | PiShop.us [S35]; Raspberry Pi [S31] |
| AI HAT+ 2 (Hailo-10H, 8 GB) | $200; launched at $130 on 2026-01-15 | Raspberry Pi [S32, S43] |
| Seeed reComputer AI R2130 (Pi 5 8 GB + Hailo-8, in a case) | $385.99 | Seeed [S37] |
| Hailo-8 M.2 module (2242, 2280 M-key; B+M; A+E) | $169 | Electromaker, 2026-09-09 [S36] |
| Hailo-8L M.2 module (B+M, A+E) | $85 | Electromaker [S36] |
| Hailo-10H M.2 4 GB starter kit (2242, 2280) | $212.50 | Electromaker [S36] |
| Fanless N150 box, 2 × M.2 x1, barebones | from $218–247 (2024 price) | Liliputing (secondary) [S38] |

Raspberry Pi raised prices in December 2025, February 2026 and on 2026-04-01 because of memory costs.
The April round added $25 to the 4 GB Pi 5, $50 to the 8 GB, $100 to the 16 GB, and $50 to the AI
HAT+ 2 [S34]. Raspberry Pi states production until at least January 2030 for the AI HAT+ and January
2036 for the AI HAT+ 2 and the Pi 5 [S31–S33]. The AI Kit (Hailo-8L) "is no longer in production"
[S27].

A Pi 5 8 GB with a Hailo-8 HAT costs about $295 before case, cooler, storage and power supply; with the
AI HAT+ 2, about $375 (estimate, sums of the rows above).

## What a measurement must settle

In order of what decides the setup:

1. Does YOLO26-OBB, cut at its one-to-one head, compile for Hailo-8 at 2048 × 2048, and at 1024 × 1024?
   How many contexts, and does C2PSA fit? This needs the DFC on an x86 Linux host, not a Hailo device.
2. How many cars does the quantized model miss on the 11 held-out frames, against FP32 and ONNX Runtime
   INT8? Hailo's emulator runs this on the same host [S13], before any purchase.
3. Throughput on a Pi 5 at Gen 3 x1, batch 1 and batch 4–8, 2048 and 1024 tiles, n and s, with
   `hailortcli run` and then with the host pipeline (tiling, top-k, async). Same on an x86 box with an
   x4 slot if the Pi falls short with s.
4. 1.5 Hz for hours on the Pi 5 with the HAT, with and without a fan: chip temperature, throttling
   events from HailoRT, per-frame latency and its spread, and PCIe errors at Gen 3.
5. If s at DPT 25 is wanted on a Pi, the same on the AI HAT+ 2.

## Caveats

- No YOLO26-OBB figure exists on any Hailo chip. YOLO11-OBB at 1024 stands in for it.
- All Pi 5 figures are third-party, and the Sixfab figures come from a seller of a competing board.
- The zoo's FPS are a few seconds of pipelined frames on an x86 host at room temperature [S21].
- The planning factors (0.5–0.6 for Hailo-8, 0.36–0.97 for Hailo-10H) rest on five published Pi runs.
- Hailo's mAP losses are on DOTA and COCO, not on this layout, and mAP does not map directly to missed
  cars.
- Fanless mini PC prices were not found for late 2026; the N150 box price is from 2024.
- The thermal thresholds are third-party and uncited.

## Sources

Earlier notes and issues

- [S1] This repo, `docs/research/compute-hardware.md` on branch `research/compute-hardware` (unit,
  YOLO26-OBB GFLOPs, Jetson figures, planning against half the burst figure):
  <https://github.com/rails49/detector/blob/research/compute-hardware/docs/research/compute-hardware.md>
- [S2] This repo, `docs/research/cameras.md` on branch `research/cameras`:
  <https://github.com/rails49/detector/blob/research/cameras/docs/research/cameras.md>
- [S3] Issue #37, "Resolution" (TFLOP/s needed at 1.5 Hz) and "Accuracy by model and DPT" comments:
  <https://github.com/rails49/detector/issues/37>

Hailo Model Zoo (github.com/hailo-ai/hailo_model_zoo, read 2026-11-01; `master` at bcc11df, 2026-10-31)

- [S4] Hailo-8 object detection table (Model Zoo v2.20.0):
  <https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO8/HAILO8_object_detection.rst>
- [S5] Hailo-8 oriented object detection table:
  <https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO8/HAILO8_oriented_object_detection.rst>
- [S6] Hailo-8L object detection and oriented object detection tables:
  <https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO8L/HAILO8L_object_detection.rst>,
  <https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO8L/HAILO8L_oriented_object_detection.rst>
- [S7] Hailo-10H object detection and oriented object detection tables (Model Zoo v5.5.0):
  <https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO10H/HAILO10H_object_detection.rst>,
  <https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO10H/HAILO10H_oriented_object_detection.rst>
- [S8] Semantic segmentation tables, Hailo-8, Hailo-8L, Hailo-10H:
  <https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO8/HAILO8_semantic_segmentation.rst>,
  <https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO8L/HAILO8L_semantic_segmentation.rst>,
  <https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO10H/HAILO10H_semantic_segmentation.rst>
- [S9] Network configs and model scripts: `cfg/base/yolo26.yaml`, `cfg/networks/yolo26s.yaml`,
  `cfg/base/yolo_obb.yaml`, `cfg/networks/yolov11n_obb.yaml`, `cfg/alls/generic/yolo26s.alls` (branch
  `update-to-version-v2.20.0`):
  <https://github.com/hailo-ai/hailo_model_zoo/tree/update-to-version-v2.20.0/hailo_model_zoo/cfg>.
  The `OBB26` head is in Ultralytics' `ultralytics/cfg/models/26/yolo26-obb.yaml`:
  <https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/models/26/yolo26-obb.yaml>
- [S10] Postprocessing: `core/postprocessing/detection/yolo.py` (`yolo26_filter`) and
  `core/postprocessing/detection/yolo_obb.py` (`batch_probiou`):
  <https://github.com/hailo-ai/hailo_model_zoo/tree/master/hailo_model_zoo/core/postprocessing/detection>
- [S11] Changelog and README version badges (v2.18–v2.20 on branch `update-to-version-v2.20.0`: DFC
  3.34.0, HailoRT 4.24.0; v5.5.0 on `master`):
  <https://github.com/hailo-ai/hailo_model_zoo/blob/update-to-version-v2.20.0/docs/CHANGELOG.rst>,
  <https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/CHANGELOG.rst>
- [S12] Hailo-8 profiler reports, v2.20.0 (`number_of_contexts`, `fps`, `precision_mode`,
  `inter_context_bw`), for yolov8s, yolo26n, yolo26s, yolov11n_obb, yolov11s_obb, at
  `https://hailo-model-zoo.s3.eu-west-2.amazonaws.com/ModelZoo/Compiled/v2.20.0/hailo8/<model>_profiler_results_compiled_runtime_data.html`, e.g.
  <https://hailo-model-zoo.s3.eu-west-2.amazonaws.com/ModelZoo/Compiled/v2.20.0/hailo8/yolov11s_obb_profiler_results_compiled_runtime_data.html>
- [S13] Model optimization guide (`docs/OPTIMIZATION.rst`):
  <https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/OPTIMIZATION.rst>

Ultralytics

- [S14] Ultralytics, Hailo integration (export, task support table, Pi 5 benchmarks, quantization
  notes; read 2026-11-01): <https://docs.ultralytics.com/integrations/hailo/>

Hailo

- [S15] Hailo-8 AI accelerator product page: <https://hailo.ai/products/ai-accelerators/hailo-8-ai-accelerator/>
- [S16] Hailo-8 M.2 module product page (26 TOPS, PCIe Gen 3 x4 or x2):
  <https://hailo.ai/products/ai-accelerators/hailo-8-m-2-ai-acceleration-module/>
- [S17] Hailo-8L product page: <https://hailo.ai/products/ai-accelerators/hailo-8l-ai-accelerator-for-ai-light-applications/>
- [S18] Hailo-10H M.2 module product page (40/20 TOPS INT4/INT8, 2.5 W, 4/8 GB LPDDR4/4X, PCIe Gen 3 x4):
  <https://hailo.ai/products/ai-accelerators/hailo-10h-m-2-generative-ai-acceleration-module/>
- [S19] Hailo-8 M.2 Key B+M ET module data sheet, rev. 2.5 (2025):
  <https://hailo.ai/hailo-files/hailo-8-m-2-key-b-m-et-datasheet-en/>
- [S20] HailoRT repository: README (`master` supports Hailo-10 and Hailo-15; Hailo-8 on branch `hailo8`)
  and `hailort/libhailort/include/hailo/hailort.h` (temperature-protection zones, throttling states):
  <https://github.com/hailo-ai/hailort>
- [S21] Hailo Community, "Poor performance of Hailo8L and Rpi5", replies by Klaus_Koschinsky (Hailo),
  2024-11-09 and 2024-11-11: <https://community.hailo.ai/t/poor-performance-of-hailo8l-and-rpi5/5914>
- [S22] Hailo Community, "The performance on the Raspberry Pi 5 with the HAILO-8 chip seems not good as
  the official results", user figures and replies by omria (Hailo), 2025-09-08 and 2025-11-10:
  <https://community.hailo.ai/t/the-performance-on-the-raspberry-pi-5-with-the-hailo-8-chip-seems-not-good-as-he-official-results/17473>
- [S23] Hailo Community, "Running local LLM using Hailo-8L", replies by Klaus_Koschinsky (Hailo),
  2024-06-15 and 2025-12-29: <https://community.hailo.ai/t/running-local-llm-using-hailo-8l/1093>
- [S24] Hailo Community, "Hailo8l maximum input dimension", reply by omria (Hailo), 2025-05-26:
  <https://community.hailo.ai/t/hailo8l-maximum-input-dimension/14909>
- [S25] Hailo Community, "DFC 5.3.0 / Hailo-10H: YOLOv8s fails with Value doesn't fit in field ... at
  4064×3040 ...", user report (October 2026) and reply by Omri_Hadar (Hailo), 2026-10-13:
  <https://community.hailo.ai/t/dfc-5-3-0-hailo-10h-yolov8s-fails-with-value-doesnt-fit-in-field-1951-119-at-4064x3040-and-with-agent-infeasible-when-on-chip-nv12-i420-input-is-combined-with-compiler-optimization-level-max/19842>
- [S26] Hailo Community, "M.2 Hailo 8 heatsink", reply by omria (Hailo), 2025-08-04:
  <https://community.hailo.ai/t/m-2-hailo-8-heatsink/1367/7>

Raspberry Pi

- [S27] Raspberry Pi documentation, AI HAT+ and AI HAT+ 2:
  <https://www.raspberrypi.com/documentation/accessories/ai-hat-plus.html>
- [S28] Raspberry Pi documentation, AI software (Gen 3 applied automatically; `hailo-all` against
  `hailo-h10-all`): <https://www.raspberrypi.com/documentation/computers/ai.html>
- [S29] Raspberry Pi documentation, M.2 HAT+ ("500 MB/s peak") and Raspberry Pi hardware (PCIe Gen 3.0
  not certified): <https://www.raspberrypi.com/documentation/accessories/m2-hat-plus.html>,
  <https://www.raspberrypi.com/documentation/computers/raspberry-pi.html>
- [S30] Raspberry Pi documentation, I/O controllers (RP1 over PCIe 2.0 x4; USB 3.0, Ethernet):
  <https://www.raspberrypi.com/documentation/computers/io-controllers.html>
- [S31] Raspberry Pi, AI HAT+ product page (from $70, 0–50 °C, production until January 2030):
  <https://www.raspberrypi.com/products/ai-hat/>; launch at $110 for 26 TOPS:
  <https://www.raspberrypi.com/news/raspberry-pi-ai-hat/>
- [S32] Raspberry Pi, AI HAT+ 2 product page ($200; "comparable to the Raspberry Pi AI HAT+ (26 TOPS)"
  for computer vision): <https://www.raspberrypi.com/products/ai-hat-plus-2/>
- [S33] Raspberry Pi 5 product page (PCIe 2.0 x1, $305 for 16 GB, active cooling):
  <https://www.raspberrypi.com/products/raspberry-pi-5/>
- [S34] Raspberry Pi news, "A new 3GB Raspberry Pi 4 for $83.75, and more memory-driven price
  increases", 2026-04-01:
  <https://www.raspberrypi.com/news/a-new-3gb-raspberry-pi-4-for-83-75-and-more-memory-driven-price-increases/>
- [S43] Raspberry Pi news, "Introducing the Raspberry Pi AI HAT+ 2", 2026-01-15 ($130):
  <https://www.raspberrypi.com/news/introducing-the-raspberry-pi-ai-hat-plus-2-generative-ai-on-raspberry-pi-5/>

Retail

- [S35] PiShop.us product pages, read 2026-11-01:
  <https://www.pishop.us/product/raspberry-pi-ai-hat-26-tops/>,
  <https://www.pishop.us/product/raspberry-pi-ai-hat-13-tops/>,
  <https://www.pishop.us/product/raspberry-pi-5-8gb/>,
  <https://www.pishop.us/product/raspberry-pi-5-4gb/>
- [S36] Electromaker (distributor), "Hailo-8 vs Hailo-8L vs Hailo-10H", prices checked 2026-09-09:
  <https://www.electromaker.io/blog/article/hailo-8-vs-hailo-8l-vs-hailo-10h-which-ai-accelerator-should-you-buy>
- [S37] Seeed Studio, reComputer AI R2130-12: <https://www.seeedstudio.com/reComputer-AI-R2130-12-p-6368.html>
- [S38] Liliputing, HUNSN RJ42/RJ43 fanless N150 boxes, 2024-12-12 (secondary):
  <https://liliputing.com/these-fanless-mini-pcs-combine-intel-n150-chips-with-four-2-5-gbe-lan-ports/>

Third-party measurements (secondary)

- [S39] Sixfab, "Raspberry Pi 5 AI HAT Benchmark: DEEPX vs Hailo", 2026-07-13:
  <https://sixfab.com/blog/raspberry-pi-5-ai-hat-benchmark-deepx-vs-hailo/>
- [S40] Seeed Studio wiki, "Benchmark of multistream inference on Raspberry Pi 5 with Hailo-8",
  updated 2024-11-21: <https://wiki.seeedstudio.com/benchmark_of_multistream_inference_on_raspberrypi5_with_hailo8/>
- [S41] Mario Bergeron, "Edge AI Power Benchmarking — Part 1: Hailo-8, the Reference", 2026-05-01:
  <https://mariobergeron.com/posts/edge-ai-power-p01-hailo8/>
- [S42] Raspberry Pi Forums, "Hailo-8 on RPi CM4: 75 FPS vs 126 FPS on PC/RPi5", 2025-08-12:
  <https://forums.raspberrypi.com/viewtopic.php?t=390853>
