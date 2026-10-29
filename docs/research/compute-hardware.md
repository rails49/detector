# Compute hardware candidates for live YOLO26-OBB

Written 2026-10-29. Research for [issue #34](https://github.com/rails49/detector/issues/34), under map
[#31](https://github.com/rails49/detector/issues/31).

Sources are listed at the end and cited as [S1], [S2], and so on. Numbers marked "estimate" are
arithmetic or inference done here, with the method shown. Nothing here was measured on a device for this
note.

## The question

Which devices can run a fine-tuned YOLO26-OBB (n to l) with the NMS-free `end2end` head, how fast when
sustained, at what power and 2026 price? The workload is about 0.07 to 6 TFLOP per frame (Ultralytics
GFLOPs). The timing targets, as revised on 2026-10-29:

- Stations: frame period plus latency variation ≤ 1 s (train enters at 50 mm/s, stops within 50 mm).
- Shunting areas: ≤ 2 s (25 mm/s).
- ≥ 1 Hz everywhere. 10 Hz is a goal to cost, not a requirement.

So the ranking case is 1–2 Hz. At 2 Hz the frame period is 0.5 s, which leaves 0.5 s for latency
variation at a station.

## How throughput is expressed

Effective throughput = Ultralytics GFLOPs of the model at the stated input ÷ measured inference time.
It is in TFLOP/s, so a per-frame cost from the compute-per-m² table
([#32](https://github.com/rails49/detector/issues/32)) divides straight into it:

    inference time per frame ≈ (TFLOP per frame) ÷ (effective TFLOP/s)
    sustained throughput needed ≈ (TFLOP per frame) × (frames per second)

Reference FLOPs, from Ultralytics [S1, S2]:

| Model | Detect, 640 (GFLOPs) | OBB, 1024 (GFLOPs) |
| :--- | ---: | ---: |
| n | 5.5 | 14.8 |
| s | 20.9 | 56.7 |
| m | 68.4 | 184.9 |
| l | 86.8 | 232.4 |
| x | 194.4 | 520.1 |

The OBB-to-detect ratio for l is 2.68, close to the pixel ratio (1024/640)² = 2.56. The OBB head adds
little compute, so a detect benchmark's effective throughput carries over to OBB at the same scale
(estimate).

Three things move these numbers:

1. Model size. Small models do not fill the accelerator. On every device with n-to-x data, n reaches
   10–30 % of the effective throughput of l or x. Use the l or x figure for large frames and the n figure
   for small ones.
2. What the timing covers. Ultralytics' Jetson, OpenVINO and MIGraphX tables exclude pre- and
   post-processing [S3, S4, S5]. The phone tables include them [S6, S7]. Qualcomm AI Hub times the NPU
   alone [S8].
3. Burst against sustained. All vendor tables are short bursts on a cool device. On the iPhone 17 Pro,
   Ultralytics measured about 7 ms model time inside the live camera app against 1.8 ms in Xcode's
   isolated Performance Report, a 3.9× gap they put down to thermal and pipeline contention [S7].

Our own browser baseline, for comparison: YOLO26n INT8 at 960×544 is about 7.0 GFLOPs
(5.5 × 960·544 / 640²) and ran in 120 ms on the iPhone 16 under ORT-web WASM (`SPEC.md` § Inference cost).
That is about 0.06 TFLOP/s.

## Summary table

Effective throughput for the largest measured model, then for n. FP16 unless noted. "Price" is the 2026
price of the compute only, without camera.

| Device | Runtime path | Effective, l or x (TFLOP/s) | Effective, n (TFLOP/s) | Power | Price, 2026 |
| :--- | :--- | ---: | ---: | :--- | :--- |
| NVIDIA T4 (reference only) | TensorRT 10 | 17.9 (l-obb 1024) | 5.3 (n-obb 1024) | 70 W | not a candidate |
| Small PC + RTX 5060 | TensorRT | ~15–25 (estimate) | not published | 145 W card | $448 card (Sep) + host |
| Intel Core Ultra X7 358H (Panther Lake) | OpenVINO, iGPU | 10.2; 13.9 INT8 (l) | 1.4 | not checked | $1,490–1,900 mini PC |
| Intel Core Ultra 7 258V (Lunar Lake) | OpenVINO, iGPU | 7.6; 11.7 INT8 (l) | 1.6 | 17 W base, 37 W turbo | $670–1,199 mini PC |
| Intel 258V | OpenVINO, NPU | 2.4; 2.7 INT8 (l) | 0.2 | as above | as above |
| Jetson Orin NX 16GB | TensorRT | 5.9; 8.3 INT8 (l) | 1.3 | 10–40 W, MAXN SUPER | $999 module + carrier |
| Jetson Orin Nano Super | TensorRT | 5.0; 7.3 INT8 (l) | 1.2 | 25 W, MAXN SUPER | $399 dev kit |
| iPhone 17 Pro (A19 Pro) | Core ML, ANE | ~7.5–11 (depth l, estimate) | 1.5 | not published | no longer sold new |
| iPhone 18 Pro (A20 Pro) | Core ML, ANE | Apple claims 2× A19 Pro | none | not published | $1,199 |
| iPhone 16 (A18) | Core ML, ANE | none published | none | not published | $829 unlocked |
| Snapdragon 8 Elite / 8 Elite Gen 5 | QNN, HTP | 5.8–6.7 W8A16; 12–15 W8A8 (YOLOv8n, NPU only) | 1.1 (YOLO26n-obb, app) | not published | ~$700 gaming phone (China launch) |
| Mac mini M4 / M6 / M5 Pro | Core ML or Core AI, ANE | none published | 1.3 (M4, Core AI) | 4 W idle; 65–145 W max | M6 $899; M5 Pro $1,699 |
| Ryzen AI Max+ 395 (Radeon 8060S) | ONNX Runtime MIGraphX, FP32 | 7.0 (l-obb 1024) | 3.6 | not checked | $1,700–3,400, over budget |
| Ryzen AI 300 (HX 370) | MIGraphX iGPU or Vitis AI NPU | none published | none | not checked | ~$760–1,170 mini PC |
| Browser WASM (iPhone 16, measured) | ORT-web 1.26 | — | 0.06 | — | owned |

What the 1–2 Hz case needs from this table:

- 6 TFLOP per frame at 1 Hz needs about 6 TFLOP/s sustained, at 2 Hz about 12. At 1 Hz the whole
  1 s station budget goes to the period, so 2 Hz is the realistic station rate for the largest frames.
- 1 TFLOP per frame at 2 Hz needs 2 TFLOP/s. Every native accelerator path above meets this on paper.
- 0.07 TFLOP per frame at 1 Hz needs 0.07 TFLOP/s. The measured WASM path, at 0.06, is just short.

10 Hz multiplies each figure by 5 to 10. The top of the range, 6 TFLOP per frame, would need
60 TFLOP/s, which no candidate in budget reaches: a T4-class GPU at ~18 TFLOP/s handles about
1.8 TFLOP per frame at 10 Hz, an Orin NX or Lunar Lake iGPU at INT8 about 0.8–1.2, and an Orin Nano Super
at FP16 about 0.5 (estimates, burst figures).

## Per candidate

### iPhone 16 and the current iPhone Pro (Core ML, Neural Engine)

Runtime path. Core ML `.mlpackage`, loaded with `.cpuAndNeuralEngine`. Ultralytics' iOS SDK uses that
setting rather than `.all` because the GPU is busy with the camera preview [S9]. iOS 27 adds Apple Core
AI (`.aimodel`), which Ultralytics exports too. Measured end to end it is level with Core ML, not faster,
and the iOS 27.0 runtime still returns wrong results for some graphs [S6].

OBB head. The NMS-free OBB export works on Core ML (`nms=False`) [S10]. The in-graph decode (top-k,
gather, box decode) adds about 19–21 ops that Core ML places on the CPU; the rest runs on the ANE
(92.9 % of ops for YOLO26n detect). On the A19 Pro the end2end head was faster than the legacy head plus
Vision NMS: 1.81 ms against 1.90 ms median for YOLO26n in the Xcode Performance Report [S7]. On iOS 27.0.1,
`.cpuOnly` inference of l and x OBB models crashes in Core ML's CPU kernels; the ANE path runs them [S6].
Core ML INT8 is weight-only (W8A16), so the ANE computes in FP16 [S11].

Throughput. Published figures are for the iPhone 17 Pro only:

- YOLO26n-obb, 640, INT8 weights, ANE: 3.9 ms end to end, 15-run burst [S6]. 5.8 GFLOPs ÷ 3.9 ms ≈
  1.5 TFLOP/s.
- YOLO26n-obb at 1024 in the sustained live-camera app (older model binaries): 24.1 ms per frame [S7].
  14.8 GFLOPs ÷ 24.1 ms ≈ 0.6 TFLOP/s for the whole pipeline.
- No l-size OBB or detect timing is published. The closest is depth: YOLO26l-depth 10.87 ms and
  YOLO26x-depth 19.38 ms on the ANE [S7]. Ultralytics lists depth-l at 157.0 and depth-x at 301.7 GFLOPs at
  768 [S12]. Scaled to the 640 export, that is about 109 and 210 GFLOPs, or 10.0 and 10.8 TFLOP/s; if the
  input was 480×640, 7.5 and 8.1. Estimate: the A19 Pro ANE delivers 7.5–11 TFLOP/s in burst on l-size
  YOLO26 graphs.

iPhone 18 Pro (A20 Pro): Apple claims a dual 16-core Neural Engine with twice the AI performance of the
A19 Pro, and a vapor chamber bonded to the chip [S13]. Nothing is measured.

iPhone 16 (A18): no published YOLO26 ANE figure. The project owns one, so this is a measurement, not a
purchase.

Thermal. Phone throttling data is for the GPU at full load, not the ANE at low duty. In a 20-minute
3DMark Wild Life Extreme stress test, Tom's Guide measured 65.2 % stability for the iPhone 17 Pro Max and
54.7 % for the iPhone 16 Pro Max on the first run [S14]. Notebookcheck reports 61.4 % for the iPhone 17
Pro and 66.2 % for the iPhone 17 in Solar Bay Extreme [S15]. At 1–2 Hz with a 100 ms frame, the ANE duty
cycle is 10–20 %, so throttling may be milder (estimate). The 3.9× gap between isolated and in-app model
time above is the best published hint of the sustained penalty. The map already lists 30-minute phone
measurements as open.

Power. Apple publishes no ANE or per-inference power.

Price, apple.com on 2026-10-29: iPhone 16 128 GB $829 unlocked ($799 with carrier activation) [S16];
iPhone 17 from $899 with a $30 carrier discount [S17]; iPhone 18 Pro from $1,199 [S13]. Apple no longer
lists the iPhone 17 Pro [S18].

### Snapdragon 8 Elite phones, including gaming phones (QNN, Hexagon NPU)

Runtime path. Ultralytics exports `format="qnn"`: an ONNX file with an embedded QNN context binary for
one Hexagon HTP version (v79 for 8 Elite, v81 for 8 Elite Gen 5), run through ONNX Runtime's QNN
execution provider. Export forces W8A16 (INT8 weights, 16-bit activations) [S19]. Ultralytics' Flutter
plugin can use it on Android [S19].

OBB head. QNN does not get the NMS-free head. Ultralytics lists QNN among the formats that fall back to
the one-to-many head "when their operators cannot support end-to-end output" [S10]. The model then
returns raw candidates, and the app must run rotated-box NMS on the CPU. The OBB graph itself runs on the
HTP: YOLO26n-obb measured on the NPU [S19]. MediaTek's NPU compiler rejects OBB's exponential and
trigonometric ops and LiteRT moves the graph to the GPU [S6]; this rules out Dimensity-based gaming phones
for the NPU path.

Throughput.

- YOLO26n-obb, 640, W8A16 QNN on a Xiaomi 17 (8 Elite Gen 5): 8.1 ms end to end, 5.1 ms inference
  [S19]. 5.8 GFLOPs ÷ 5.1 ms ≈ 1.1 TFLOP/s.
- Qualcomm AI Hub, YOLOv8n (8.7 GFLOPs at 640 [S20]), NPU time only, QNN_DLC [S8]:

  | Chip | float | W8A16 | W8A8 |
  | :--- | ---: | ---: | ---: |
  | 8 Elite (Galaxy) | 2.15 ms, 4.0 TFLOP/s | 1.51 ms, 5.8 | 0.70 ms, 12.4 |
  | 8 Elite Gen 5 (Galaxy) | 1.76 ms, 4.9 | 1.30 ms, 6.7 | 0.59 ms, 14.8 |

  The gap between 5.1 ms (Ultralytics, ORT) and 1.3 ms (AI Hub) for similar n-size work is runtime and
  I/O overhead. W8A8 is not what Ultralytics exports; its accuracy cost is unmeasured here.
- No l-size YOLO figure on a Snapdragon NPU was found.

Ultralytics found that `htp_performance_mode` burst and sustained give the same clocks under ONNX Runtime
[S6].

Thermal. No published NPU sustained test was found. Gaming phones add fans or liquid loops; the RedMagic
11 Pro (8 Elite Gen 5) has a fan, liquid metal and a vapor chamber; the 11 Pro+ adds a pumped liquid loop [S21]. A reviewer
remained doubtful about its sustained performance over long sessions [S22].

Price. The RedMagic 11 Pro launched in China in October 2025 at 4,999 CNY, about $700 [S21]. No current
US price was verified.

### Mac mini M4 and M4 Pro, now M6 and M5 Pro (Core ML, Core AI, MPS)

Apple replaced the M4 Mac mini on 2026-08-25. The current models are M6 from $899 (16 GB) and M5 Pro
from $1,699 [S23]. The M4 appears only as a comparison baseline on apple.com [S24]. The M6 has a dual
16-core Neural Engine that Apple says is up to 2× the previous generation, and up to 4× the M4 Mac mini's
AI performance [S23]. The M5 Pro keeps a single 16-core Neural Engine and adds Neural Accelerators to each
GPU core [S23, S25].

Runtime path and OBB head. Same Core ML or Core AI export as the iPhone. On a Mac host, Ultralytics loads
Core ML with `CPU_AND_NE` because `ALL` and `CPU_AND_GPU` abort with an MLIR pass-manager error in
coremltools 9.x [S9]. That is a Python-host limitation; a native app may still use the GPU (not verified).

Throughput. Only n is published, on a Mac mini M4 [S26]:

- YOLO26n-obb, 640, FP16: Core ML ANE 15.2 ms inference; Core AI ANE 4.3 ms. 5.8 GFLOPs ÷ 4.3 ms ≈
  1.3 TFLOP/s.
- No l-size figure. Apple stated 38 TOPS for the M4 Neural Engine at launch [S27]; it publishes no TOPS
  for the M6 or M5 Pro [S23]. The owned M2 Max can be measured.

Power, Apple at the wall [S28]: M6 4 W idle, 70 W max; M5 Pro 6 W, 145 W; M4 4 W, 65 W; M4 Pro 5 W, 140 W.

### Jetson Orin Nano Super and Orin NX (TensorRT)

Runtime path. TensorRT engine built on the device. Ultralytics benchmarks with JetPack 6.1 on the Orin
Nano Super dev kit and JetPack 6.0 on a Seeed reComputer J4012 (Orin NX 16GB) [S3]. Super modes need
JetPack 6.2 [S29], so the Orin NX figures may predate them.

OBB head. TensorRT supports NMS-free exports [S10]. TensorRT 10.3.0 in JetPack 6 cannot build INT8
engines with the NMS-free or embedded-NMS outputs. Ultralytics then selects the one-to-many head, and the
app must run rotated NMS on the CPU [S3, S10]. FP16 keeps the end2end head.

Throughput, YOLO26 detect at 640, inference only [S3]:

| Model | Orin Nano Super FP16 | INT8 | Orin NX 16GB FP16 | INT8 |
| :--- | ---: | ---: | ---: | ---: |
| n | 4.57 ms, 1.2 TFLOP/s | 3.80 ms | 4.13 ms, 1.3 | 3.49 ms |
| s | 7.17 ms | 5.25 ms | 6.41 ms | 4.78 ms |
| m | 13.59 ms | 9.30 ms | 11.66 ms | 8.22 ms |
| l | 17.42 ms, 5.0 | 11.83 ms, 7.3 | 14.77 ms, 5.9 | 10.49 ms, 8.3 |
| x | 32.60 ms, 6.0 | 19.99 ms, 9.7 | 26.76 ms, 7.3 | 17.32 ms, 11.2 |

INT8 mAP fell from 0.622 to 0.592 for l in these runs, calibrated on coco128 [S3].

Power. Orin Nano gains a 25 W mode and an uncapped MAXN SUPER mode; Orin NX 16GB supports 10, 15, 25,
40 W and MAXN SUPER. In MAXN SUPER the module throttles when it exceeds its TDP [S29]. The dev kit has a
fan; Jetson throttling is governed by the chosen power mode rather than by a phone-style skin limit.

Price. NVIDIA raised Jetson prices in July 2026: Orin Nano Super dev kit $249 → $399; Orin NX 16GB module
$599 → $999 (1KU), before a carrier board [S30].

### x86 mini PCs with an NPU or iGPU (OpenVINO, ONNX Runtime)

Runtime path. OpenVINO IR, with device `intel:gpu`, `intel:npu` or `intel:cpu` [S4]. YOLO26 on the NPU is
supported only on Core Ultra 2xxV (Lunar Lake) and 3xx (Panther Lake) and later [S4]. AMD: ONNX Runtime
with the MIGraphX execution provider on Radeon iGPUs; Ryzen AI NPUs have no Ultralytics path, only
AMD's external Vitis AI tooling [S5].

OBB head. OpenVINO and MIGraphX both take `nms=False` [S4, S5]. Ultralytics' OpenVINO tables are for
detect; OBB on the Intel NPU is not benchmarked, so whether TopK and the angle decode stay on the NPU is
unverified.

Throughput, YOLO26 detect at 640, inference only, OpenVINO 2026.2.1 [S4]:

| Device | n FP16 | l FP16 | l INT8 | x FP16 | x INT8 |
| :--- | ---: | ---: | ---: | ---: | ---: |
| 358H Arc iGPU (Panther Lake) | 4.03 ms, 1.4 | 8.49 ms, 10.2 | 6.25 ms, 13.9 | 12.98 ms, 15.0 | 8.74 ms, 22.2 |
| 358H NPU | 7.71 ms, 0.7 | 14.55 ms, 6.0 | 15.64 ms, 5.5 | 23.41 ms, 8.3 | 21.56 ms, 9.0 |
| 258V Arc 140V iGPU (Lunar Lake) | 3.34 ms, 1.6 | 11.36 ms, 7.6 | 7.45 ms, 11.7 | 19.63 ms, 9.9 | 13.69 ms, 14.2 |
| 258V NPU | 23.7 ms, 0.2 | 35.77 ms, 2.4 | 32.64 ms, 2.7 | 49.69 ms, 3.9 | 41.75 ms, 4.7 |
| 258V CPU | 16.73 ms | 233.7 ms | 67.73 ms, 1.3 | 561.4 ms | 151.1 ms |

On both chips the iGPU beats the NPU. The NPU gains little from INT8.

AMD Radeon 8060S (Ryzen AI Max+ PRO 395), MIGraphX FP32, OBB at 1024 [S5]: n-obb 4.1 ms (3.6 TFLOP/s),
l-obb 33.4 ms (7.0), x-obb 65.9 ms (7.9). Strix Halo machines cost $1,700–3,400 in 2026 [S31], over
budget. No Ultralytics figure exists for the smaller Ryzen AI 300 (Strix Point) iGPU.

Power. Core Ultra 7 258V: 17 W base, 37 W turbo [S32]. Not checked for the others.

Price. Memory costs pushed mini PC prices up in 2026 [S33]. Examples: GMKtec NucBox K13 (Core Ultra 7
256V) from $670; Khadas Mind (258V) $1,099–1,199 [S34]; Core Ultra X7 358H mini PCs $1,490–1,900, for
example Lenovo Yoga Mini i at $1,489.99 on sale [S35]; Ryzen AI 9 HX 370 mini PCs from $759 (a February
2026 deal) to about $999 (GEEKOM A9 Max, 2025) [S33].

### Small discrete-GPU PC (TensorRT)

Runtime path. TensorRT on Linux or Windows, FP16 or INT8. NMS-free exports supported [S10]. Recent
TensorRT does not have JetPack 6's INT8 limitation (estimate; the limitation is stated for TensorRT
10.3.0 [S10]).

Throughput. Ultralytics measures on a T4 [S2]: YOLO26l-obb at 1024 in 13.0 ms (17.9 TFLOP/s), x-obb in
30.5 ms (17.1), n-obb in 2.8 ms (5.3). The T4 is rated 65 TFLOPS FP16, 130 TOPS INT8, 70 W [S36]. No
Ultralytics YOLO26 figure exists for a current GeForce card. The RTX 5060 is rated 614 AI TOPS (FP4 with
sparsity), 145 W [S37]. Halving three times for dense FP4 → FP8 → FP16 gives about 77 TFLOPS FP16, near
the T4's 65, with more memory bandwidth. Estimate: 15–25 TFLOP/s effective on l-size OBB.

Price. RTX 5060 8 GB: $299 MSRP, $448 lowest US street price on 2026-09-01; RTX 5060 Ti 16 GB $761
against $429 MSRP [S38]. Add a host PC; a small-form-factor host plus card likely exceeds $800 (estimate, not priced).

## Caveats

- No YOLO26-OBB l-size figure exists on any phone, Mac, or Snapdragon NPU. The phone and Mac numbers for
  large frames rest on depth models and on n-size scaling. These are the largest gaps, and two of them
  (iPhone 16, M2 Max) can be measured on owned hardware.
- All vendor figures are bursts of 15–100 runs on a cool device. Sustained in-app model time on the
  iPhone 17 Pro was 3.9× the isolated figure. Plan against at most half the burst figure until measured
  (estimate).
- Timings differ in scope: inference only (Jetson, Intel, AMD), end to end (phones), NPU only (AI Hub).
- The input sizes here are 640 and 1024. The detector uses a 2048 canvas, about 4× the work of 1024.
  Effective throughput at 2048 should be at least the l figure, but activation memory may limit 8 GB
  devices (estimate, unverified).
- INT8 changes accuracy. Ultralytics' INT8 runs used coco128 for calibration. Every INT8 path needs
  checking on the accuracy map's held-out images.
- Three paths lose the NMS-free head: QNN (always), TensorRT INT8 on JetPack 6, LiteRT INT8 [S10].
  Each then needs rotated NMS on the CPU over all anchors. At a 2048 canvas that is
  (2048/8)² + (2048/16)² + (2048/32)² = 86,016 candidates before the confidence filter (estimate).
- Prices are from late 2026, after memory-driven increases, and many are retailer or launch figures.

## Sources

- [S1] Ultralytics, YOLO26 model page, detection table:
  <https://docs.ultralytics.com/models/yolo26/>
- [S2] Ultralytics, OBB task page, YOLO26-obb table (DOTAv1, 1024, T4 TensorRT10):
  <https://docs.ultralytics.com/tasks/obb/>
- [S3] Ultralytics, NVIDIA Jetson guide, YOLO26 benchmarks (Ultralytics 8.4.33) and the JetPack 6 INT8 FAQ:
  <https://docs.ultralytics.com/guides/nvidia-jetson/>
- [S4] Ultralytics, OpenVINO integration, YOLO26 benchmarks on Core Ultra X7 358H, 7 258V, 7 155H:
  <https://docs.ultralytics.com/integrations/openvino/>
- [S5] Ultralytics, AMD integration (ROCm, MIGraphX), Radeon 8060S benchmarks and support table:
  <https://docs.ultralytics.com/integrations/amd/>
- [S6] Ultralytics yolo-flutter-app, `doc/performance.md`:
  <https://github.com/ultralytics/yolo-flutter-app/blob/main/doc/performance.md>
- [S7] Ultralytics yolo-ios-app, `docs/performance.md` (iPhone 17 Pro, iOS 27.0.1):
  <https://github.com/ultralytics/yolo-ios-app/blob/main/docs/performance.md>
- [S8] Qualcomm AI Hub, YOLOv8-Detection model card:
  <https://huggingface.co/qualcomm/YOLOv8-Detection>
- [S9] Ultralytics, CoreML integration, "Targeting the Neural Engine":
  <https://docs.ultralytics.com/integrations/coreml/>
- [S10] Ultralytics, End-to-End Detection guide, "Export Format Compatibility":
  <https://docs.ultralytics.com/guides/end2end-detection/>
- [S11] Ultralytics, Export mode, quantization table: <https://docs.ultralytics.com/modes/export/>
- [S12] Ultralytics, YOLO26 depth performance table (`docs/macros/yolo-depth-perf.md`):
  <https://docs.ultralytics.com/models/yolo26/>
- [S13] 9to5Mac, "iPhone 18 Pro officially announced", 2026-09-09:
  <https://9to5mac.com/2026/09/09/iphone-18-pro-officially-announced-heres-whats-new/>
- [S14] Tom's Guide, iPhone 17 Pro Max sustained performance test:
  <https://www.tomsguide.com/phones/iphones/iphone-17-pro-max-endurance-tested-does-the-new-design-actually-improve-performance>
- [S15] Notebookcheck, iPhone 17 Pro stability in GPU ray-tracing stress test:
  <https://www.notebookcheck.net/Apple-iPhone-17-Pro-shows-lower-stability-than-iPhone-17-in-GPU-ray-tracing-stress-test.1117338.0.html>
- [S16] Apple Store, buy iPhone 16 (read 2026-10-29): <https://www.apple.com/shop/buy-iphone/iphone-16>
- [S17] Apple Store, buy iPhone 17 (read 2026-10-29): <https://www.apple.com/shop/buy-iphone/iphone-17>
- [S18] Apple, iPhone lineup (read 2026-10-29): <https://www.apple.com/iphone/>
- [S19] Ultralytics, Qualcomm QNN integration, measured performance and export arguments:
  <https://docs.ultralytics.com/integrations/qnn/>
- [S20] Ultralytics, YOLOv8 model page (YOLOv8n 8.7 GFLOPs at 640): <https://docs.ultralytics.com/models/yolov8/>
- [S21] Liliputing, RedMagic 11 Pro launch, 2025-10-18:
  <https://liliputing.com/redmagic-11-pro-gaming-phone-features-liquid-cooling-80-watt-wireless-charging-and-snapdragon-8-elite-gen-5/>
- [S22] TechRadar, RedMagic 11 Pro review: <https://www.techradar.com/phones/redmagic-11-pro-review>
- [S23] Apple Newsroom, Mac mini with M6 and M5 Pro, 2026-08-25:
  <https://www.apple.com/newsroom/2026/08/apple-unveils-a-more-powerful-mac-mini-featuring-the-all-new-m6-and-m5-pro/>
- [S24] Apple, Mac mini page (read 2026-10-29): <https://www.apple.com/mac-mini/>
- [S25] Apple Support, Mac mini (M6 or M5 Pro) tech specs: <https://support.apple.com/en-us/128108>
- [S26] Ultralytics, Apple Core AI integration, Mac mini M4 measured performance:
  <https://docs.ultralytics.com/integrations/coreai/>
- [S27] Apple Newsroom, "Apple introduces M4 chip", 2024-05-07:
  <https://www.apple.com/newsroom/2024/05/apple-introduces-m4-chip/>
- [S28] Apple Support, Mac mini power consumption and thermal output: <https://support.apple.com/en-us/103253>
- [S29] NVIDIA Developer Blog, "JetPack 6.2 brings Super Mode to Jetson Orin Nano and Orin NX":
  <https://developer.nvidia.com/blog/nvidia-jetpack-6-2-brings-super-mode-to-nvidia-jetson-orin-nano-and-jetson-orin-nx-modules/>
- [S30] CNX Software, "NVIDIA increases the price of Jetson modules and devkits by up to 101%", 2026-07-22:
  <https://www.cnx-software.com/2026/07/22/nvidia-increases-the-price-of-jetson-modules-and-devkits-by-up-to-101/>
- [S31] TweakTown, Corsair AI Workstation 300 price increase:
  <https://www.tweaktown.com/news/110905/corsairs-ryzen-ai-max-strix-halo-ai-workstation-300-pc-is-now-a-lot-more-expensive/index.html>
- [S32] Notebookcheck, Intel Core Ultra 7 258V specs:
  <https://www.notebookcheck.net/Intel-Core-Ultra-7-258V-Processor-Benchmarks-and-Specs.892883.0.html>
- [S33] Guru3D, GEEKOM A9 Max 2026 review (HX 470; HX 370 price history):
  <https://www.guru3d.com/review/geekom-a9-max-2026-mini-pc-review-ryzen-ai-9-hx-470/>;
  Slickdeals, Minisforum XG1-370 at $759 (Feb 2026):
  <https://slickdeals.net/f/19199530-minisforum-aiberzy-xg1-370-mini-pc-ryzen-ai-9-hx-370-32gb-ddr5-1tb-gen4-ssd-dual-usb4-2-5g-lan-win11h-759-f-s>
- [S34] Liliputing, GMKtec NucBox K13: <https://liliputing.com/gmk-launches-nucbox-k13-mini-pc-with-intel-lunar-lake/>;
  Notebookcheck, Khadas Mind 258V at $1,199:
  <https://www.notebookcheck.net/Khadas-mini-PC-with-Intel-Core-Ultra-258V-Lunar-Lake-CPU-debuts-at-1-199.883133.0.html>
- [S35] Notebookcheck, Lenovo Yoga Mini i with Core Ultra X7 358H:
  <https://www.notebookcheck.net/Lenovo-s-new-0-65L-mini-PC-with-Intel-Core-Ultra-X7-358H-and-32GB-RAM-gets-a-380-discount.1355611.0.html>
- [S36] NVIDIA, T4 product page: <https://www.nvidia.com/en-us/data-center/tesla-t4/>
- [S37] NVIDIA, GeForce RTX 5060 family: <https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5060-family/>
- [S38] Capital & Compute, NVIDIA GPU prices (street prices from Tom's Hardware, as of 2026-09-01):
  <https://capitalandcompute.net/gpu-prices/nvidia/>
