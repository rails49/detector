# One or two cameras at DPT 20–25 for a Pi 5 or mini PC

Researched 2026-11-01 for [#53](https://github.com/rails49/detector/issues/53). It builds on
`docs/research/cameras.md` on branch `research/cameras` [S1] and does not repeat it, except where
newer or primary sources disagree (see [Corrections to cameras.md](#corrections-to-camerasmd)).
The accelerator is [#52](https://github.com/rails49/detector/issues/52)'s subject and is not
covered here.

Nothing was measured on a device. Numbers marked (calc) are geometry or arithmetic done here, with
the method shown. Numbers marked (secondary) come from a reseller or a search-result snippet, not
from the maker. Prices were read on 2026-11-01.

## Summary

Targets, from the issue: DPT 20, with DPT 25 as margin. DPT = pixels ÷ field in mm × 9. Every
image is resampled to the model's DPT before detection [S4], so a camera with more native DPT is
scaled down; one with less is below the minimum DPT [S5].

| Option | Field to cover | DPT 20 needs | DPT 25 needs |
|---|---|---|---|
| One camera | 2,100 × 1,100 mm | 4,667 × 2,444 px | 5,833 × 3,056 px |
| Two cameras | 1,140 × 1,100 mm each | 2,533 × 2,444 px | 3,167 × 3,056 px |

(calc: px = DPT × field ÷ 9.)

1. One camera at DPT 25 is reached by the 64 MP Arducam modules (DPT 38–40 nominal), the iPhone
   16 Pro Max at 48 MP (DPT 33) and the 26 MP IMX571 in astronomy cameras from $1,619 (DPT 25.5).
   No 20–24 MP sensor reaches it: the 5,472 px of the IMX183/IMX283 give at most DPT 23.5 across
   2.10 m.
2. One camera at DPT 20 is reached by the 20 MP 1" sensors (IMX183 over USB3, IMX283 over CSI-2)
   with an 8.5 mm lens: DPT 21.2 at 1.5 m, or 23.5 if the camera hangs at 1.36 m so the lens fills
   the field. The lens that resolves 2.4 µm pixels (Kowa LM8FC24M) lists at €926, more than the
   camera.
3. The Arducam 64 MP OwlSight (OV64A40) is the cheapest one-camera option at $60 and runs on the
   Pi 5 with Raspberry Pi's own libcamera. Its driver gives 2.6 fps at full resolution. Four things
   are unknown until measured: the resolution its f/1.9 stock lens delivers on 1.0 µm pixels, its
   distortion, whether its 2.02–2.10 m field keeps the 50 mm margin, and the effect of its
   0.38–0.49 s rolling readout on L0 timestamps.
4. Two cameras at DPT 20–25 are cheap on a Pi 5. Two Pi HQ cameras with the 6 mm lens give DPT
   23.2 at 1.5 m, or 24.9 hung at 1.40 m. Two IMX519 modules give 21.5; two Camera Module 3 give
   20.8 on the short axis with 11 mm of margin. The HQ pair costs about $210 at Adafruit's prices.
5. The Pi 5 is not the limit at 1.5–2 Hz. It takes two 4-lane cameras at once [R2][R8]. The ISP
   back end runs at about 1.6 Gpixel/s [R4]; two 64 MP cameras at 2 Hz use 16 % of it (calc). The
   Pi 5 uses no CMA for camera buffers [R6]. The camera's own full-resolution rate is the limit:
   2.0–2.7 fps for the 64 MP sensors, 10 fps or more for every other candidate.
6. A mini PC is not required for USB3 machine-vision cameras. The Pi 5 has two USB 3.0 ports at
   5 Gbps each [R2], and The Imaging Source and Daheng ship ARM64 SDKs [M2][M3]. A 20 MP 8-bit
   frame crosses USB3 in about 53 ms (calc).
7. Distortion lowers DPT at the corners by about three times the distortion percentage along the
   radius (calc). Only the Kowa lens has a published figure (0.55 %, secondary). Every option
   within 10 % of DPT 20 must be checked at the layout corners on the mount.
8. Ranked picks are in [Recommendation](#recommendation). For one camera: OwlSight 64 MP first, to
   measure; IMX283 or IMX183 with the Kowa 8.5 mm second. For two cameras: two Pi HQ with 6 mm
   lenses on one Pi 5.

## Sensor aspect against the field

The one-camera field is 1.91:1. The two-camera field is 1.04:1. A sensor of another aspect covers
more area than needed, and its DPT is set by the axis that limits (calc):

- One camera: 4:3 and 3:2 sensors are width-limited. DPT = 9 × width px ÷ 2,100. The share of
  pixels on the field is 70 % for 4:3, 79 % for 3:2 and 93 % for 16:9.
- Two cameras: every non-square sensor is limited by its short axis. DPT = 9 × height px ÷ 1,100.
  The share on the field is 78 % for 4:3, 69 % for 3:2, 58 % for 16:9 and 96 % for 1:1.

So for one camera the width pixel count matters, and for two cameras the height pixel count.

## One camera, 2.10 × 1.10 m at 1.5 m

Field = sensor size × 1,500 ÷ f, or 2 × 1,500 × tan(FOV ÷ 2) where only the FOV is published
(calc). Sensor size = pixels × pitch.

| Camera (sensor) | Pixels, pitch | Lens | Field at 1.5 m (mm) | DPT width × height | DPT 20 / 25 | Full-res rate on host | Camera + lens price |
|---|---|---|---|---|---|---|---|
| iPhone 16 Pro Max, 48 MP | 8064 × 6048 | 24 mm equiv. [P1] | 2,180 × 1,630, measured [S2] | 33.3 × 33.4 | yes / yes | not published; Apple demo about 2 photos/s [P2] | owned |
| iPhone 16 Pro Max, 24 MP | 5712 × 4284 | as above | as above | 23.6 × 23.7 | yes / no | not published | owned |
| Arducam OwlSight (OV64A40), full | 9248 × 6944, 1.008 µm [A1][A2][K4] | stock 6.65 mm f/1.9 [A1] | 2,103 × 1,579 from f; 2,024 × 1,595 from the listed 68° × 56° | 39.6 × 39.6 (41.1 × 39.2 from FOV) | yes / yes, if the field covers | 2.6 fps at 456 MHz link, 2.0 at 360 MHz [A1][K4] | $59.99 [A5] |
| OwlSight, 2 × 2 binned | 4624 × 3472 | as above | as above | 19.8 × 19.8 | no / no | 10 fps [A1] | as above |
| Arducam 64 MP Hawkeye | 9152 × 6944, 0.8 µm [A3] | stock, 72° × 54.6° [A3] | 2,180 × 1,548 | 37.8 × 40.4 | yes / yes | 2.7 fps (driver mode "64 mpix 2.7fps") [K5] | €71.90 (secondary) [D5] |
| IMX283, CSI-2 on Pi 5 (Kurokesu, Arducam Klarity) | 5472 × 3648, 2.4 µm [K6][C1] | Kowa LM8FC24M, 8.5 mm | 2,318 × 1,545 | 21.2 × 21.3 | yes / no | 21.4 fps (driver, 12-bit, 720 MHz link) [K6] | €481.58 [C2] + €926 [L1] |
| as above, hung at 1.36 m | as above | as above | 2,100 × 1,400 | 23.5 × 23.5 | yes / no | as above | as above |
| IMX183, USB3 (Daheng MER2-2000-19U3C, TIS DFK 33UX183, FLIR BFS-U3-200S6C) | 5472 × 3648, 2.4 µm [M2] | Kowa LM8FC24M, 8.5 mm | 2,318 × 1,545 | 21.2 × 21.3 | yes / no | 18–19 fps [M2][M3][M1] | $613–776 [M3][M4] + €926 [L1] |
| IMX183, USB3, 8 mm lens | as above | 8 mm | 2,462 × 1,642 | 20.0 × 20.0 | at the limit / no | as above | as above + lens |
| IMX542, USB3, global shutter | 5328 × 3040, 2.74 µm | 8.5 mm, hung at 1.22 m | 2,100 × 1,198 | 22.8 × 22.8 | yes / no | 23–24 fps (secondary) [M6] | $1,495–1,895 (secondary) [M6] + lens |
| IMX571 (APS-C, astronomy cameras) | 6244 × 4168, 3.76 µm | 16 mm APS-C | 2,201 × 1,469 | 25.5 × 25.5 | yes / yes | 3.5 fps at 16-bit, 15 fps RAW8 (secondary) [M9] | $1,619 cooled (secondary) [M9] + lens |
| Pi HQ (IMX477) | 4056 × 3040 | lens that fills 2.1 m | 2,100 × 1,574 | 17.4 | no / no | 10 fps [K1] | — |
| Arducam IMX519 | 4656 × 3496 | stock 66° × 49.5° [A4] | 1,948 × 1,383 | does not cover 2.1 m; 20.0 even with a lens that does | no / no | 10 fps [K3] | — |
| Camera Module 3 (IMX708) | 4608 × 2592 | fixed 66° × 41° [R1] | 1,948 × 1,122 | does not cover 2.1 m | no / no | 14.35 fps [S1] | — |

Arithmetic for the main rows (calc):

- OwlSight: 9248 × 1.008 µm = 9.32 mm; 9.32 × 1,500 ÷ 6.65 = 2,103 mm; 9248 ÷ 2,103 × 9 = 39.6.
  From Arducam's 68° H: 2 × 1,500 × tan 34° = 2,024 mm, which is 76 mm short of 2,100. The two
  figures disagree; 2 × atan(4.66 ÷ 6.65) = 70.1° from the listed focal length.
- Hawkeye: 2 × 1,500 × tan 36° = 2,180 mm; 9152 ÷ 2,180 × 9 = 37.8.
- IMX183/IMX283: 5472 × 2.4 µm = 13.13 mm. The lens that fills 2,100 mm at 1.5 m is
  13.13 × 1,500 ÷ 2,100 = 9.38 mm. No 24 MP-rated 1.1" lens near 9.4 mm was found; Kowa's line
  goes 6.5, 8, 12 mm [L1]. With 8.5 mm: 13.13 × 1,500 ÷ 8.5 = 2,318 mm; 5472 ÷ 2,318 × 9 = 21.2.
  The height at which 8.5 mm fills 2,100 mm is 2,100 × 8.5 ÷ 13.13 = 1,359 mm; there DPT =
  5472 ÷ 2,100 × 9 = 23.5.
- The LM8FC24M is listed as 8 mm by Kowa [L1] and as 8.5 mm with 79.2° × 63.8° at 1.1" by a
  distributor [L3]. 7.05 ÷ tan 39.6° = 8.5 mm (calc), so 8.5 mm is used here.
- iPhone: 8064 ÷ 2,180 × 9 = 33.3; 5712 ÷ 2,180 × 9 = 23.6 [S2].

Notes:

- A camera may hang below the 1.5 m ceiling. For a lens that fills the field, DPT is
  pixels ÷ field and does not depend on height. Hanging lower makes a shorter stock lens fit. It
  raises obliquity: the farthest layout corner moves from 36.7° off nadir at 1.5 m to 41.2° at
  1.28 m, and a car there looks 2.17× its width instead of 1.99× (calc, method in [S1]).
- The OwlSight at 1.5 m covers the 2.0 m layout. Whether it covers the 50 mm margin on both ends
  depends on which field figure is right (2,024 or 2,103 mm). Measure it.
- The 64 MP sensors' pixels are 1.0 and 0.8 µm. A perfect f/1.9 lens has an Airy disc of 2.55 µm
  and passes 37 % contrast at the 1.0 µm pixel's Nyquist frequency, 67 % at half of it (calc,
  550 nm). Half of Nyquist is what survives the resampling from DPT 40 to DPT 20. The stock lens's
  MTF is not published.
- Kowa's cheaper 1" 8 mm lens, the LM8HC (€452), is rated 5 MP [L4], a quarter of the IMX183's
  pixel count.
- Global shutter is not needed [S1]. IMX542 bodies cost $1,495–1,895 [M6] and reach DPT 22.8 at a
  fitted height, less than the IMX183's 23.5, at two to three times its price. The 24 MP IMX540
  has the same 5,328 px width, so the same DPT, at €2,279 [S1].
- The IMX571 is the only sensor found that gives DPT 25 from one camera without 1 µm pixels. The
  cameras found with it are cooled astronomy cameras from $1,619, plus an APS-C lens. Not pursued.

## Two cameras, 1.14 × 1.10 m each at 1.5 m

| Camera (sensor) | Pixels | Lens | Field at 1.5 m (mm) | DPT on the limiting axis | DPT 20 / 25 | Full-res rate, two at once | Price per camera, with lens |
|---|---|---|---|---|---|---|---|
| Pi HQ (IMX477) | 4056 × 3040, 1.55 µm [R1] | Pi 6 mm CS, f/1.2 | 1,572 × 1,178 | 23.2 | yes / no | 10 fps each [K1] | $55 [D1] + $49.30 [D2] |
| Pi HQ, hung at 1.40 m | as above | as above | 1,468 × 1,100 | 24.9 | yes / at the limit | as above | as above |
| Pi HQ | as above | 8 mm | 1,179 × 884 | does not cover 1.10 m | — | — | — |
| Arducam IMX519, autofocus | 4656 × 3496, 1.22 µm [A4] | stock 66° × 49.5° [A4] | 1,948 × 1,383 | 21.5 (width), 22.8 (height) | yes / no | about 9.6 fps each [K3] | $35.67 [D4] |
| Camera Module 3 (IMX708) | 4608 × 2592, 1.4 µm [R1] | fixed 66° × 41° [R1] | 1,948 × 1,122 | 20.8 (height) | yes, 4 % over / no | 14.35 fps each [S1] | $29.25 [D3] |
| IMX283 (CSI-2) or IMX183 (USB3) | 5472 × 3648 | Kowa LM12FC24M, 12 mm | 1,642 × 1,094 | 30.0 | yes / yes | IMX283: two 4-lane ports; IMX183: 18–19 fps | €482 or $613–776, + €813 [L1] |
| IMX226, USB3 (Basler acA4024-29uc) | 4000 × 3000, 1.85 µm | 6 mm, hung at 1.19 m | 1,467 × 1,100 | 24.5 | yes / no | 31 fps [S1] | €479 [M5] + lens |
| IMX226, USB3 | as above | 6 mm at 1.5 m | 1,850 × 1,388 | 19.5 | no / no | as above | as above |

Arithmetic (calc):

- HQ: 4.712 mm × 1,500 ÷ 6 = 1,178 mm; 3040 ÷ 1,178 × 9 = 23.2. The height at which 6 mm fills
  1,100 mm is 1,100 × 6 ÷ 4.712 = 1,401 mm; there DPT = 3040 ÷ 1,100 × 9 = 24.9. The ideal lens
  at 1.5 m is 4.712 × 1,500 ÷ 1,100 = 6.4 mm.
- IMX519: 2 × 1,500 × tan 33° = 1,948 mm, 4656 ÷ 1,948 × 9 = 21.5; 2 × 1,500 × tan 24.75° =
  1,383 mm, 3496 ÷ 1,383 × 9 = 22.8. Its line length 12,650 px at 426.67 MHz gives 29.65 µs per
  line and about 9.6 fps at 3496 lines plus minimum blanking [K3].
- CM3: 2 × 1,500 × tan 20.5° = 1,122 mm; 2592 ÷ 1,122 × 9 = 20.8. 1,122 mm leaves 11 mm each
  side beyond the 1,100 mm field, against the 50 mm margin already inside it.
- IMX183 with 12 mm: 8.76 × 1,500 ÷ 12 = 1,094 mm, 6 mm short of 1,100, so the margin shrinks
  from 50 to 47 mm per side. 3648 ÷ 1,094 × 9 = 30.0.
- IMX226: the earlier note's 7.6 mm [S1] is not a stock focal length. With 8 mm the short side is
  5.55 × 1,500 ÷ 8 = 1,041 mm, which does not cover; with 6 mm it is 1,388 mm and DPT 19.5. Hung
  at 1,100 × 6 ÷ 5.55 = 1,189 mm, 6 mm gives 24.5.

Notes:

- The Pi 6 mm lens is sold as a 1/2", "3MP" lens with a 63° field angle on that format [D2]. Its
  sharpness on 1.55 µm pixels and its distortion are not published. Adafruit's listing warns of
  distortion at the edges [D2].
- Two fixed-lens 64 MP modules gain nothing over one: each covers the same 2.0–2.2 m field.
- With two cameras the farthest layout corner is 25.2° off nadir at 1.5 m and 26.8° at 1.40 m
  (calc).

## DPT at the corners

A rectilinear lens pointed straight down has one scale over the railhead plane, so DPT at the
corners equals DPT at the centre [S1]. Barrel distortion breaks this. For distortion D (as a
fraction) growing with the square of the radius, the local scale along the radius is about
1 + 3D and across it 1 + D (calc, from r' = r(1 + kr²)). Along the radius:

| Distortion at the layout corner | Radial DPT factor | HQ 23.2 becomes | IMX183 + 8.5 mm 21.2 becomes |
|---|---|---|---|
| −0.55 % (Kowa LM8FC24M, secondary [L2]) | 0.984 | 22.8 | 20.9 |
| −2 % | 0.94 | 21.8 | 19.9 |
| −5 % | 0.85 | 19.7 | 18.0 |

The layout corners lie inside the image corners, so the figures are a bound. Published distortion
was found only for the Kowa lens. The Pi 6 mm lens, the CM3, the IMX519 stock lens and both 64 MP
stock lenses have none. Each must be measured on the mount by calibrating a capture, as #38 did
for the phone [S2].

## The Raspberry Pi 5 as host

### Ports and lanes

- Two four-lane 1.5 Gbps MIPI transceivers, "supporting any combination of up to two cameras or
  displays" [R2]. "For Raspberry Pi 5, you can connect two cameras directly to the board using the
  dual MIPI connectors ... you can use both cameras simultaneously" [R8].
- The CSI-2 receiver and part of the ISP (the front end) are in the RP1 chip; most of the ISP (the
  back end) is in the BCM2712 [R4].
- A Raspberry Pi engineer: the CSI-to-front-end interface takes 2 pixels per cycle, which at the
  200 MHz RP1 clock and RAW10 is 4 Gbps across all lanes [R5]. That is 400 Mpixel/s per port
  (calc).
- One front end serves one camera; simultaneous cameras need one front end each [R3]. The PiSP
  specification's example has two front ends so that two cameras run at once [R3].

### ISP throughput and size limits

- The back end runs at two pixels per clock at about 800 MHz: "you can get 1.6 billion pixels a
  second" (Eben Upton) [R4]. The specification targets 200–700 MHz at 2 pixels/cycle [R3]; the
  1.6 Gpixel/s figure is a spoken estimate.
- Load at the rates here (calc): two 64 MP cameras at 2 Hz are 256 Mpixel/s, 16 % of 1.6
  Gpixel/s. One 64 MP frame takes at least 40 ms of back-end time.
- The back end processes images in tiles of up to 640 px width [R3], so it has no frame-width
  limit. The front end has full function up to 6,144 px wide; wider frames need statistics crop or
  decimation [R3]. The OV64A40 is 9,248 px wide. Raspberry Pi ships a Pi 5 tuning file for it
  [K7], so its libcamera handles this.
- Sensor data rates are within the front end's limit (calc): the OV64A40 at 2.6 fps delivers
  170 Mpixel/s (9248 px per 54.4 µs line); its 456 MHz two-lane link carries at most 182 Mpixel/s
  at RAW10. The IMX283 at 21.4 fps reads a line in 12.3 µs, 444 Mpixel/s, above the 400
  Mpixel/s figure; its driver also offers a 360 MHz link [K6], which carries 240 Mpixel/s at
  RAW12 and about 11 fps at full resolution. At 1.5–2 Hz either works.
- The front end writes to DRAM across RP1's PCIe link, which has "two gigabytes a second" [R4].
  Two 64 MP cameras at 2 Hz write 257 MB/s compressed or 514 MB/s uncompressed (calc).

### Raw or processed capture, and memory

- On the Pi 5 the raw stream is either PiSP-compressed (8 bits per pixel, "visually lossless") or
  uncompressed 16-bit [R6]. Compression in the front end is optional [R4].
- The processed stream (YUV or RGB) comes from the back end. The detector needs RGB, so the
  processed stream is the one to use. Raw capture would move demosaicing to the CPU.
- "For Raspberry Pi 5 (and later models) CMA memory is not used" [R6]. Buffers come from system
  memory. Per 64 MP frame (calc): 64 MB compressed raw, 96 MB YUV420, 193 MB RGB888. Two cameras
  with two buffers of raw and RGB each need about 1 GB. Pi 5 list prices are $110 for 4 GB and
  $175 for 8 GB [R2].
- rpicam-apps run two cameras in separate processes [R8]. Picamera2 opens two cameras as two
  `Picamera2` objects in one process [R6]. Raspberry Pi's libcamera can synchronise two cameras'
  frame starts in software [R6].

### Sensor support on the Pi 5

| Sensor | Kernel driver in Raspberry Pi's tree | Pi 5 tuning file in Raspberry Pi's libcamera | What the maker says |
|---|---|---|---|
| IMX477 (HQ) | yes [K1] | `imx477.json`, `imx477_6mm.json`, `imx477_16mm.json` [K7] | Raspberry Pi product |
| IMX708 (CM3) | yes [K2] | yes [K7] | Raspberry Pi product |
| IMX519 (Arducam 16 MP) | yes [K3] | `imx519.json` [K7] | Pi 5 supported on Bookworm and Trixie; autofocus models need Arducam's own libcamera build [A4] |
| OV64A40 (Arducam OwlSight 64 MP) | yes [K4] | `ov64a40.json` [K7] | "fully supported by the mainstream software", Pi 5 on Bookworm and Trixie [A1] |
| Arducam 64 MP Hawkeye | yes, `arducam_64mp.c` [K5] | none [K7] | "cannot be natively supported by the Raspberry Pi platform"; needs Arducam's libcamera build [A1][A3] |
| IMX283 (Kurokesu, OneInchEye, Arducam Klarity) | yes [K6] | `imx283.json` [K7] | Kurokesu: 4-lane, 22-pin [C1]; OneInchEye: "compatible with RPI5" [C3] |

The issue names the "64 MP Hawkeye". Arducam's successor, the OwlSight, has the larger pixel
(1.008 against 0.8 µm), a larger sensor (1/1.32" against 1/1.7") and native support [A1][A3]. The
OwlSight is the one to use on a Pi 5.

## USB3 on a mini PC or a Pi 5

- USB3 machine-vision cameras send raw Bayer, uncompressed [S1]. Per frame (calc): 20 MB for a
  20 MP 8-bit frame, 30 MB for 12-bit. At the 380 MB/s FLIR uses for its frame-rate figures [S1],
  transfer takes 53 ms or 79 ms. Two cameras at 2 Hz need 80–120 MB/s, a third of one 5 Gbps port.
- The host demosaics. That CPU cost for 20 MP was not found and must be measured.
- The Pi 5's two USB 3.0 ports run 5 Gbps each at the same time [R2]. The Imaging Source ships
  its `tiscamera` library for ARM64 [M2]; Daheng lists SDKs for "ARM V7 & ARM V8" [M3]. A USB3
  camera therefore does not by itself require a mini PC.

## Rate, readout and latency

| Camera | Full-res rate | Readout (rolling skew) | 50 / 100 mm/s during readout | Source |
|---|---|---|---|---|
| OwlSight OV64A40 | 2.6 fps (456 MHz), 2.0 fps (360 MHz) | 378 ms / 491 ms (frame time × 6944 ÷ 7072 lines) | 19 / 38 mm; 25 / 49 mm | [K4] (calc) |
| Hawkeye 64 MP | 2.7 fps | 361 ms (46,770 px line at 900 MHz × 6944) | 18 / 36 mm | [K5] (calc) |
| IMX519 | 9.6 fps | 104 ms (29.65 µs × 3496) | 5.2 / 10.4 mm | [K3] (calc) |
| Pi HQ IMX477 | 10 fps | 84 ms | 4.2 / 8.4 mm | [S1] |
| CM3 IMX708 | 14.35 fps | 68 ms | 3.4 / 6.8 mm | [S1] |
| IMX283 | 21.4 fps | 45 ms (12.3 µs × 3648) | 2.2 / 4.5 mm | [K6] (calc) |
| IMX183 USB3 | 18–19 fps | ≤ 56 ms | ≤ 2.8 / 5.6 mm | [S1] |

- Every candidate meets 1.5–2 Hz. The 64 MP sensors meet 2 Hz with little to spare; at the
  360 MHz link the OwlSight runs at 2.0 fps.
- The 64 MP readout of 0.36–0.49 s matters for timestamps. #31 gives each L0 its frame's capture
  time. With one time per frame, the last row is captured up to 0.49 s after the first. At 2 Hz,
  frame period plus that spread is 0.87–0.99 s, at the 1 s station budget [S1]. Each row's time is
  known (first-row time plus row × line time), so L0 could carry per-detection times instead. That
  is a design choice for occupancy, not settled here.
- Pi capture latency: a frame is complete after readout, then the back end needs at least 40 ms
  for 64 MP (calc). The time from `SensorTimestamp` to buffer was not found; it must be measured.
  The Picamera2 manual defines `SensorTimestamp` as the time "the first pixel was read out of the
  sensor", and says to subtract the exposure time to find exposure start [R6]. The libcamera
  control definition cited in [S1] says the time the first row is exposed. The two disagree; check
  on the device.
- USB3 latency: readout, then 53–79 ms transfer for 20 MP (calc), then demosaicing on the host.

## Exposure, white balance, focus and depth of field

### Exposure and white balance under changing daylight

- Pi (libcamera): the AGC sets shutter time and analogue gain. Each exposure mode in the tuning
  file is a list of shutter times and gains; the shutter ramps to the first value, then the gain,
  then the next pair [R7]. A custom mode whose shutter list ends at 4,000 µs (1/250 s) holds blur
  under 1 px at 50 mm/s [S1] and lets gain rise as light falls. `AeExposureMode`, `AeEnable`,
  `AwbMode` and `FrameDurationLimits` are the controls [R6].
- USB3 (GenICam): `ExposureAuto` = Continuous with `AutoExposureTimeUpperLimit`, and
  `BalanceWhiteAuto` = Continuous, as Basler documents them [M7][M8].
- iPhone: `activeMaxExposureDuration` caps auto exposure without leaving auto mode [S1].
- At 1/250 s the gain needed at the lowest daylight level is not known. Measure lux on the layout
  through the day.

### Fixed focus at 1.5 m

- CM3, IMX519 and both 64 MP modules have motorised lenses. Set `AfMode` to Manual and
  `LensPosition` in dioptres: 1 ÷ 1.5 m = 0.67 [R6]. The value that is sharp on the mount must be
  found per unit.
- C and CS lenses (HQ, IMX283, IMX183, IMX226) have a focus ring that is locked once set.

### Depth of field

Near and far limits for focus at 1.5 m, blur circle 2 pixels, from the hyperfocal distance
H = f² ÷ (N × c) + f (calc). Heights are above or below the railhead plane.

| Camera, lens, aperture | Blur circle | In focus from | to |
|---|---|---|---|
| Pi HQ, 6 mm, f/2.8 | 3.1 µm | 845 mm below | 397 mm above |
| Pi HQ, 6 mm, f/4 | 3.1 µm | 1,590 mm below | 510 mm above |
| CM3, 4.74 mm, f/1.8 | 2.8 µm | 757 mm below | 377 mm above |
| OwlSight, 6.65 mm, f/1.9 (fixed) | 2.0 µm (2 px at DPT 40) | 223 mm below | 172 mm above |
| OwlSight, as above, judged at DPT 20 | 4.0 µm | 523 mm below | 308 mm above |
| IMX183, 8.5 mm, f/4 | 4.8 µm | 985 mm below | 426 mm above |
| IMX183, 12 mm, f/5.6 | 4.8 µm | 577 mm below | 326 mm above |

Every option keeps at least ±170 mm in focus. The layout's height range was not available here;
compare it with these limits. Diffraction sets a floor: the Airy disc is 3.8 µm at f/2.8 and
5.4 µm at f/4 (calc), so stopping down a 2.4 µm sensor past f/4 costs resolution. A 100 mm height
step changes the scale by 6.7 % at 1.5 m and 7.4 % at 1.36 m (calc).

## Corrections to cameras.md

- The iPhone 16 figures (2.00 m field, DPT 36 / 26) were replaced by #38's measurement of the
  iPhone 16 Pro Max on the mount: 2.18 × 1.63 m, DPT 33 / 24 [S2].
- Two IMX226 cameras at DPT 24.5 assumed a 7.6 mm lens, which is not a stock focal length. With
  stock 6 mm or 8 mm at 1.5 m they give DPT 19.5 or miss the 1.10 m field. A 6 mm lens hung at
  1.19 m gives 24.5.
- Prices have risen. The Pi 6 mm lens was $25 at launch [S1]; Adafruit lists it at $49.30 and the
  HQ camera at $55 [D1][D2]. The Camera Module 3 is $29.25 [D3].
- `SensorTimestamp`: see [Rate, readout and latency](#rate-readout-and-latency).
- New since that note: the Pi 5 front-end and back-end limits above, the OwlSight and IMX283 as
  Pi 5 options, and the corner-DPT effect of distortion.

## Recommendation

### One camera

1. Arducam OwlSight 64 MP (OV64A40) on a Pi 5. $60. DPT 39.6 nominal, 2.6 fps, native libcamera.
   Buy one and measure before anything else: delivered resolution after resampling to DPT 20,
   field and margin, distortion, readout time. If it passes, it is the only Pi option that meets
   DPT 25 with one camera.
2. IMX283 on the Pi 5's CSI-2 port (Kurokesu, Arducam Klarity) or IMX183 over USB3 (Daheng,
   The Imaging Source, FLIR), with the Kowa LM8FC24M. DPT 21.2 at 1.5 m, 23.5 hung at 1.36 m.
   18–21 fps. About €1,400–1,700 for camera and lens. The choice if the OwlSight's optics fail;
   it meets DPT 20 and not 25.
3. Arducam 64 MP Hawkeye. DPT 37.8, 2.7 fps, but 0.8 µm pixels and Arducam's own libcamera
   build. Only if the OwlSight's field is too narrow (Hawkeye: 2.18 m).
4. iPhone 16 Pro Max at 48 MP, for comparison: DPT 33, owned, still rate unpublished.

Not recommended: Pi HQ, IMX519 and CM3 (below DPT 20 or too narrow for one camera); IMX542 and
IMX540 (less DPT than the IMX183 at two to three times the price); IMX571 astronomy cameras (over budget).

### Two cameras

1. Two Pi HQ cameras with the Pi 6 mm lens on one Pi 5. DPT 23.2 at 1.5 m, 24.9 hung at 1.40 m.
   10 fps each. About $210 for both. Raspberry Pi's libcamera has a tuning file named for a 6 mm lens on
   this sensor, `imx477_6mm.json` [K7].
2. Two Arducam IMX519 with the stock autofocus lens. DPT 21.5. $36 each. Margin to DPT 20 is 7 %,
   which −2.5 % distortion would use up (calc).
3. Two Camera Module 3. DPT 20.8 on the short axis, $29 each, native support. Smallest margin, both
   in DPT and in field (11 mm each side).
4. Two IMX283 or IMX183 with the Kowa 12 mm, if DPT 25 or more is required with two cameras.
   DPT 30. About €2,600 for both with lenses.

### What must be measured on the mount

- Field at 1.5 m (or the chosen height) for each camera: all four layout corners plus 50 mm in the
  frame. For the OwlSight this decides between 2,024 and 2,103 mm.
- DPT at the centre and at the four layout corners, from a calibrated capture as in #38. Pass if
  every corner is at least DPT 20.
- Lens distortion, for every lens without a published figure.
- Delivered resolution: frames from the candidate, resampled to DPT 20 and 25, scored with the
  held-out method of #37 [S3]. This is what decides the 64 MP modules.
- Full-resolution frame rate with one and with two cameras at once on the Pi 5, and the time from
  `SensorTimestamp` to buffer, with its spread.
- Rolling readout time of the 64 MP sensors (378–491 ms by the driver), and whether L0 needs
  per-row times.
- Exposure: lux on the layout through the day; the gain needed at 1/250 s; AWB stability.
- Focus: the sharp `LensPosition` per motorised module, and whether it holds as the room warms.
- Depth of field against the layout's highest and lowest points.
- CPU and memory load on the Pi 5 with two cameras streaming at full resolution; CPU cost of
  demosaicing 20 MP for a USB3 camera.

## Sources

Repository
- [S1] `docs/research/cameras.md`, branch `research/cameras`.
  https://github.com/rails49/detector/blob/research/cameras/docs/research/cameras.md
- [S2] #38, Resolution (iPhone 16 Pro Max at 1.5 m: 2.18 × 1.63 m, DPT 33 / 24).
  https://github.com/rails49/detector/issues/38#issuecomment-6499973227
- [S3] #37, "Accuracy by model and DPT". https://github.com/rails49/detector/issues/37
- [S4] ADR 0014, "DPT-normalized input, padded and never resized".
  https://github.com/rails49/detector/blob/main/docs/adr/0014-dpt-normalized-input-padded-never-resized.md
- [S5] `SPEC.md` § Minimum DPT. https://github.com/rails49/detector/blob/main/SPEC.md#minimum-dpt

Raspberry Pi
- [R1] Camera hardware documentation (IMX477, IMX708 specs, FOV).
  https://www.raspberrypi.com/documentation/accessories/camera.html
- [R2] Raspberry Pi 5 product brief ("pair of four-lane 1.5Gbps MIPI transceivers ... up to two
  cameras or displays"; "2 × USB 3.0 ports, supporting simultaneous 5Gbps operation"; list prices).
  https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-product-brief.pdf
- [R3] Raspberry Pi Image Signal Processor (PiSP) Specification, draft (sections 1–3, 6.3: 2
  pixels/cycle at 200–700 MHz, one front end per camera, 640 px back-end tiles, 6,144 px front-end
  width). https://datasheets.raspberrypi.com/camera/raspberry-pi-image-signal-processor-specification.pdf
- [R4] Raspberry Pi news, "Image processing on Raspberry Pi 5: our new hardware image signal
  processor" (800 MHz, 1.6 Gpixel/s; front end in RP1; compression optional; 2 GB/s PCIe).
  https://www.raspberrypi.com/news/image-processing-on-raspberry-pi-5-our-new-hardware-image-signal-processor/
- [R5] Raspberry Pi forums, "What is the maximum MIPI rate can Raspberry Pi 5 support?" (njh:
  CSI to front end 2 pixels per cycle, 4 Gbps at 200 MHz RAW10; trejan: 1.5 Gbps per lane).
  https://forums.raspberrypi.com/viewtopic.php?p=2329562
- [R6] The Picamera2 Library guide, release 7, build 27/10/2026 (Pi 5 raw formats, no CMA on Pi 5,
  multiple cameras, `SensorTimestamp`, `LensPosition`, controls).
  https://datasheets.raspberrypi.com/camera/picamera2-manual.pdf
- [R7] Raspberry Pi Camera Algorithm and Tuning Guide, § 5.9.6 Exposure Modes.
  https://datasheets.raspberrypi.com/camera/raspberry-pi-camera-guide.pdf
- [R8] Camera software documentation (two cameras on Pi 5; separate processes for rpicam-apps).
  https://www.raspberrypi.com/documentation/computers/camera_software.html

Kernel drivers and libcamera (Raspberry Pi trees)
- [K1] `drivers/media/i2c/imx477.c`, rpi-6.12.y. https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/media/i2c/imx477.c
- [K2] `drivers/media/i2c/imx708.c`, rpi-6.12.y. https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/media/i2c/imx708.c
- [K3] `drivers/media/i2c/imx519.c`, rpi-6.12.y (4656 × 3496, line length 0x316a, pixel rate
  426,666,667, "16 mpix 10fps"). https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/media/i2c/imx519.c
- [K4] `drivers/media/i2c/ov64a40.c`, rpi-6.12.y (9248 × 6944, VTS 7072, 2.6 fps at 456 MHz,
  2 fps at 360 MHz). https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/media/i2c/ov64a40.c
- [K5] `drivers/media/i2c/arducam_64mp.c`, rpi-6.12.y (9152 × 6944, line length 0xb6b2, pixel
  rate 900 MHz, "64 mpix 2.7fps"). https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/media/i2c/arducam_64mp.c
- [K6] `drivers/media/i2c/imx283.c`, rpi-6.12.y (5472 × 3648, "20MPix 21.40 fps readout mode 0",
  min HMAX 5914 at 480 MHz, links 720 and 360 MHz).
  https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/media/i2c/imx283.c
- [K7] Raspberry Pi libcamera, `src/ipa/rpi/pisp/data` (Pi 5 tuning files).
  https://github.com/raspberrypi/libcamera/tree/main/src/ipa/rpi/pisp/data

Arducam
- [A1] Arducam docs, 64MP OwlSight (OV64A40): 9248 × 6944, 1.008 µm, 1/1.32", 6.65 mm f/1.9,
  84° × 68° × 56°, mode table, native libcamera.
  https://docs.arducam.com/Raspberry-Pi-Camera/Native-camera/64MP-OV64A40/
- [A2] Arducam, 64MP OwlSight product brief, December 2023.
  https://core-electronics.com.au/attachments/uploads/Arducam-64mp-ov64a40-product-brief.pdf
- [A3] Arducam docs, 64MP Hawkeye: 9152 × 6944, 0.8 µm, 1/1.7", 72° × 54.6°, custom libcamera.
  https://docs.arducam.com/Raspberry-Pi-Camera/Native-camera/64MP-Hawkeye/
- [A4] Arducam docs, 16MP IMX519: 4656 × 3496, 1.22 µm, 66° × 49.5°, Pi 5 setup.
  https://docs.arducam.com/Raspberry-Pi-Camera/Native-camera/16MP-IMX519/
- [A5] Arducam store, 1/1.32" 64MP Auto Focus Camera Module, $59.99 (read from a search snippet;
  the page refused direct fetches).
  https://www.arducam.com/product/arducam-1-1-32-64mp-autofocus-camera-module-for-raspebrry-pi/

Other CSI-2 camera makers
- [C1] Kurokesu, "20M IMX283 1″ CSI-2 camera module" (4 lanes, 22-pin, 2.4 µm, CS-mount box).
  https://www.kurokesu.com/blog/20m-imx283-1-csi-2-camera-module
- [C2] Kurokesu store, 283C-CSI-CS, €481.58 incl. VAT (shown on a configurator page; confirm the
  variant). https://www.kurokesu.com/item/283C-CSI-CS
- [C3] OneInchEye (IMX283 board, "compatible with RPI5"). https://github.com/will127534/OneInchEye

Retail prices
- [D1] Adafruit, Raspberry Pi HQ Camera, $55.00, out of stock on 2026-11-01. https://www.adafruit.com/product/4561
- [D2] Adafruit, 6 mm wide-angle lens for HQ camera, $49.30 (1/2", f/1.2, CS, 63°); 16 mm lens
  $77.50 as add-on. https://www.adafruit.com/product/4563
- [D3] Adafruit, Camera Module 3, $29.25. https://www.adafruit.com/product/5657
- [D4] DigiKey, Arducam B0371-1 (IMX519 autofocus), $35.67. https://www.digikey.com/en/products/detail/arducam/B0371-1/22598757
- [D5] Welectron, Arducam B0399 64MP Hawkeye, €71.90 incl. VAT (secondary, search snippet).
  https://www.welectron.com/Arducam-B0399-64MP-Autofocus-Camera-Module-for-Raspberry-Pi

Machine vision
- [M1] Teledyne FLIR, BFS-U3-200S6 specification. https://softwareservices.flir.com/BFS-U3-200S6/latest/Model/spec.html
- [M2] The Imaging Source, DFK 33UX183 (IMX183, 5472 × 3648, 2.4 µm, 18 fps, rolling; tiscamera
  for ARM64). https://www.theimagingsource.com/en-us/product/industrial/33u/dfk33ux183/
- [M3] VA Imaging, Daheng MER2-2000-19U3C (IMX183, 19 fps, $613; SDK for ARM V7 and V8)
  (reseller). https://va-imaging.com/en-us/products/usb3-camera-20mp-color-sony-imx183-mer2-2000-19u3c-va
- [M4] Wilco Imaging, DFK 33UX183, $776 (reseller, search snippet). https://wilcoimaging.com/products/dfk-33ux183
- [M5] Basler shop, acA4024-29uc, €479 net (from [S1]). https://www.baslerweb.com/en/shop/acA4024-29uc
- [M6] IMX542 cameras: VA Imaging, ME2S-1610-24U3C, $1,736, 24 fps; Dynacolor FB-M1-C, $1,495,
  23 fps; Scorpion Vision, 16.1MP IMX542 USB3.1, $1,895 (resellers, search snippets).
  https://va-imaging.com/en-us/blogs/camera-image-sensors/cameras-with-sony-imx542-sensor-specs-prices-life-cycle
  https://light186.com/product/dynacolor-16mp-23fps-usb-camera-with-an-imx542-sensor/
  https://scorpionvision.com/products/16-1-mp-1-1-imx542-usb-3-1-camera
- [M7] Basler documentation, Exposure Auto. https://docs.baslerweb.com/exposure-auto
- [M8] Basler documentation, Balance White Auto. https://docs.baslerweb.com/balance-white-auto
- [M9] Astronomics, ZWO ASI2600MC Duo (IMX571, $1,619; 15 fps RAW8 at full resolution)
  (reseller, search snippet). https://astronomics.com/products/zwo-asi2600mc-duo-usb-3-0-cooled-color-astronomy-imaging-camera-with-built-in-guider

Lenses
- [L1] Kowa, 1.1" industrial lenses (LM6FC24M 6.5 mm €1,370; LM8FC24M €926; LM12FC24M €813; all
  24 MP, 2.5 µm minimum pixel; net prices). https://www.kowa-lenses.com/Industrial-Lenses/Industrial-Lenses/1.1/
- [L2] 1stVision, Kowa LM8FC24M (distortion 0.55 %, 24 MP, MOD 0.1 m) (distributor).
  https://1stvision.com/lens/spec/Kowa/LM8FC24M
- [L3] Machine Vision Direct, Kowa LM8FC24M (8.5 mm, f/2.5–16, 79.2° × 63.8° at 1.1")
  (distributor, search snippet). https://machinevisiondirect.com/products/kowa-lm8fc24m
- [L4] Kowa, industrial lenses (LM8HC, 1", 8 mm, rated 5 MP, €452). https://www.kowa-lenses.com/Industrial-Lenses/

Apple
- [P1] Apple, iPhone 16 Pro Max technical specifications ("48MP Fusion: 24 mm, ƒ/1.78";
  "24MP and 48MP" photos). https://support.apple.com/en-us/121032
- [P2] WWDC23 session 10105, "Create a more responsive camera experience" ("about two photos per
  second"). https://developer.apple.com/videos/play/wwdc2023/10105/

The Arducam store, the Basler shop and the Edmund Optics pages refused direct fetches. Their
figures were read from search-result snippets or carried over from [S1], as marked.
