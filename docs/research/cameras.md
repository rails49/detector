# Cameras for 1–10 Hz at DPT 20–33

Researched 2026-10-29 for [#35](https://github.com/rails49/detector/issues/35), under
[Map: hardware for live detection at ≥1 Hz](https://github.com/rails49/detector/issues/31).
Nothing was measured on a device. Numbers marked (calc) are first-order geometry done here;
numbers marked (unverified) come from a secondary source or were not found in a primary one.

## Setup and requirements

- N scale, gauge 9 mm. DPT is pixels per track gauge, so DPT = 9 mm × pixels per mm on the
  railhead plane.
- Layout 2.0 × 1.0 m. Cameras 1.5 m above it, looking straight down. Up to about 4 cameras.
- Field margin assumed here: 50 mm beyond each layout edge, and 100 mm overlap between cameras.
  The field each camera must cover is then 2.1 × 1.1 m (1 camera), 1.1 × 1.1 m (2 cameras) or
  1.1 × 0.6 m (4 cameras).
- Timing, as revised by the coordinator on 2026-10-29: frame period plus latency variation
  ≤ 1 s in stations (train enters at 50 mm/s, stops within 50 mm) and ≤ 2 s in shunting areas
  (25 mm/s). ≥ 1 Hz everywhere. 10 Hz is a goal to cost, not a requirement. Worst case for blur
  and skew is 100 mm/s.
- Budget about $1,500 for camera and compute together.

## Summary

| Option | Cameras | Field per camera at 1.5 m | DPT (centre = corners) | Rate at that resolution | Shutter | Rolling skew, 50 / 100 mm/s | Delivered as | Interface | Camera price |
|---|---|---|---|---|---|---|---|---|---|
| iPhone 16, 48 MP still | 1 | 2.00 × 1.50 m | 36 | not published; Apple demo ~2 photos/s [A5] | rolling | not published | HEIF/JPEG or uncompressed buffer | in-process | owned |
| iPhone 16, 24 MP still | 1 | 2.00 × 1.50 m | 26 | not published | rolling | not published | as above | in-process | owned |
| iPhone 16, 4K video | 1 | 2.00 × 1.12 m | 17 | 60 fps [A1] | rolling | ≤ 0.8 / 1.7 mm (calc) | YUV buffer | in-process | owned |
| Android 200 MP class (Galaxy S26 Ultra), 50 MP still | 1 | ~2.16 × 1.62 m (unverified) | ~34 | ≥ 24 MP may be < 10 fps [G3] | rolling | reported per frame [G1] | YUV or JPEG | in-process | ~$1,300–1,400 [P6] |
| Android 8K video (S26 Ultra) | 1 | ~2.16 × 1.22 m (unverified) | ~32 if 8K uses the full width (unverified) | 30 fps [P5] | rolling | reported per frame [G1] | encoder; app YUV at 8K unverified | in-process | as above |
| Pi Camera Module 3 (IMX708), fixed lens | 2 | 1.95 × 1.12 m [R1] | 21 | 14.35 fps (calc from [R3]) | rolling | 3.4 / 6.8 mm (calc) | raw → ISP → YUV | CSI-2, 2 per Pi 5 [R4] | $25 [R6] |
| Pi HQ (IMX477) + 6 mm lens | 2 | 1.57 × 1.18 m (calc) | 23 | 10 fps [R2] | rolling | 4.2 / 8.4 mm (calc) | raw → ISP → YUV | CSI-2, 2 per Pi 5 [R4] | $50 + $25 lens [R5] |
| Pi HQ (IMX477) + 8 mm lens | 4 | 1.18 × 0.88 m (calc) | 31 | 10 fps [R2] | rolling | 4.2 / 8.4 mm (calc) | as above | as above | $50 + lens |
| USB3, Sony IMX226 12 MP (Basler acA4024-29uc, FLIR BFS-U3-120S4C) | 2 | 1.1 × 1.1 m, 7.6 mm lens (calc) | 24.5 | 31 fps, 8-bit [M2] | rolling, global reset [M2] | ≤ 1.6 / 3.2 mm (calc) | raw Bayer, uncompressed | USB3 Vision | €479 [M4] + lens |
| USB3, IMX226, 10 mm lens | 4 | 1.1 × 0.6 m (calc) | 32.7 | 31 fps | as above | as above | as above | as above | as above |
| USB3, Sony IMX183 20 MP (FLIR BFS-U3-200S6C, LUCID TRI200S) | 1 | 2.46 × 1.64 m, 8 mm lens (calc) | 20.0 | 18 fps [M1] | rolling, global reset [M1] | ≤ 2.8 / 5.6 mm (calc) | raw Bayer | USB3 Vision | $555–700 [M3][M5] + lens |
| USB3, IMX183, 12 mm lens | 2 | 1.64 × 1.09 m (calc) | 30 | 18 fps | as above | as above | as above | as above | as above |
| USB3, Sony IMX541 20 MP global (Basler a2A4504-18ucBAS) | 2 | 1.1 × 1.1 m, ~17 mm lens (calc) | 37 | 18 fps [M6] | global | 0 | raw Bayer | USB3 Vision | $1,969 [M6] + lens |
| USB3, Sony IMX540 24 MP global (Basler a2A5328-15ucBAS) | 1 | 2.1 × 1.82 m, ~10 mm lens (calc) | 22.8 | 15 fps [M7] | global | 0 | raw Bayer | USB3 Vision | €2,279 [M7] + lens |
| 4K webcam (Logitech Brio), fixed lens | any | 2.65 × 1.40 m (calc) | 14 | 30 fps [W1] | rolling (unverified) | not published | MJPEG/H.264 (unverified) | UVC | ~$200 (unverified) |

DPT for a camera with a chosen lens is set by the lens and height; the table gives the lens that
fits the field. For a fixed lens, DPT is set by height alone, and more cameras add coverage, not
DPT.

## Conclusions

1. Camera timing does not limit the choice under the revised requirement. Every option above runs
   at ≥ 10 fps at full resolution except phone stills, whose rate Apple and Android do not
   publish. Apple's own demo of zero shutter lag plus responsive capture reached "about two photos
   per second" [A5]. At 2 Hz, a station has 0.5 s left for latency variation, and a shunting area
   1.5 s.
2. Global shutter is not needed. The worst rolling-shutter skew here is the Pi HQ's 84 ms readout:
   8.4 mm at 100 mm/s, 4.2 mm at 50 mm/s. That is under a tenth of the 50 mm stopping tolerance.
   Each row's capture time is known from the frame timestamp plus row × line time, so even that
   error can be removed. The global-shutter cameras that reach DPT 20+ cost $1,969 and up for the
   body alone, which uses the whole budget.
3. DPT 20 with one camera needs ≥ 4,700 px across 2.1 m. Only phone stills (24 MP and up), the
   20 MP IMX183 (DPT 20 with a stock 8 mm lens) and the 24 MP IMX540 reach it. No 4K video source
   does: 4K gives DPT 16–17 on any phone, 14 on a webcam.
4. The iPhone 16 main camera at 1.5 m covers 2.00 × 1.50 m. That is the layout's length with no
   margin. Issue #8 measured nothing; it scaled from the nominal 26 mm, and at 1.57 m it gave
   2.09 m. At 1.5 m the corners of the 2 m side sit on the frame edge. Check on the mount before
   relying on one phone. If it fits: DPT 36 at 48 MP, 26 at 24 MP, 17 in 4K video.
5. Android 8K video (Galaxy S26 Ultra, 7680 px) would give DPT ~32 from one phone. Two things are
   unconfirmed: that 8K reads the full sensor width, and that a third-party app can get 8K frames
   as YUV through Camera2 rather than only as encoded video. Both are a query on the device
   (`StreamConfigurationMap.getOutputSizes(YUV_420_888)` and `getHighResolutionOutputSizes`).
   The phone costs $1,300–1,400 and is also the compute.
6. The cheapest path to DPT 23–33 is several Raspberry Pi HQ cameras. Two with the $25 6 mm lens
   give DPT 23 over the whole layout. Four with an 8 mm lens give DPT 31. A Pi 5 takes two
   cameras [R4]. Camera cost is about $75 each. The 10 fps full-resolution limit and the 84 ms
   readout are both inside the requirement.
7. The next step up is two USB3 IMX226 cameras (DPT 24.5, 31 fps, about $500 each plus lens) or
   two IMX183 cameras (DPT 30, 18 fps, $555–700 each plus lens). Both send uncompressed raw Bayer
   to a host that must also run the detector.
8. Fixed wide lenses cap DPT. The Camera Module 3 gives DPT 21 everywhere at 1.5 m, and its
   1.95 m field is 50 mm short of the layout, so it needs two. Webcams give DPT 14 and fail.
9. More cameras reduce obliquity. The farthest layout corner is 37° off nadir with one camera,
   25° with two and 20° with four. Cars there look about 2.0×, 1.6× and 1.5× their nadir width.

## Geometry

### DPT at the centre and the corners

A distortion-corrected (rectilinear) lens pointed straight down maps the railhead plane to the
sensor at one scale, because every point on that plane is the same distance (1.5 m) from the lens
along the optical axis. DPT at the corners equals DPT at the centre (calc). What changes at the
corners is obliquity: the camera sees the side of each car as well as its roof. iOS applies
geometric distortion correction by default on devices that support it [A3]. A barrel-distorted
lens without correction gives lower DPT at the corners; Pi's 6 mm lens has been reported to show
noticeable barrel distortion (forum report, unverified).

Car roofs are about 25 mm above the railhead, so they appear 1.7% larger than the track (calc).

### Field angle and corner obliquity

Camera centred over its area, looking straight down, 1.5 m above (calc).

| Cameras | Area per camera | Field to cover (with margin) | Field angle, H × V (diagonal) | Farthest layout corner off nadir | Apparent car width at that corner |
|---|---|---|---|---|---|
| 1 | 2.0 × 1.0 m | 2.1 × 1.1 m | 70.0° × 40.3° (76.6°) | 36.7° | 2.0× |
| 2 | 1.0 × 1.0 m | 1.1 × 1.1 m | 40.3° × 40.3° (54.8°) | 25.2° | 1.6× |
| 4 | 1.0 × 0.5 m | 1.1 × 0.6 m | 40.3° × 22.6° (45.3°) | 20.4° | 1.5× |

Apparent width = (car width 18.75 mm + 25 mm height × tan(angle)) / 18.75 mm. Issue #8 found the
same 2× for one camera.

### Focal length for each sensor

f = sensor dimension × 1.5 m / field dimension, taking the axis that limits (calc).

| Sensor | Pixels | Pitch | Area | 1 camera: f, DPT | 2 cameras: f, DPT | 4 cameras: f, DPT |
|---|---|---|---|---|---|---|
| IMX477 (Pi HQ) | 4056 × 3040 [R1] | 1.55 µm | 6.29 × 4.71 mm | 4.5 mm, 17.4 | 6.4 mm, 24.9 | 8.6 mm, 33.2 |
| IMX226 | 4000 × 3000 [M2] | 1.85 µm | 7.40 × 5.55 mm | 5.3 mm, 17.1 | 7.6 mm, 24.5 | 10.1 mm, 32.7 |
| IMX183 | 5472 × 3648 [M1] | 2.4 µm | 13.1 × 8.8 mm | 9.4 mm, 23.5 | 11.9 mm, 29.8 | 17.9 mm, 44.8 |
| IMX541 | 4504 × 4504 [M6] | 2.74 µm | 12.3 × 12.3 mm | 8.8 mm, 19.3 | 16.8 mm, 36.9 | 16.8 mm, 36.9 |
| IMX540 | 5328 × 4608 [M7] | 2.74 µm | 14.6 × 12.6 mm | 10.4 mm, 22.8 | 17.2 mm, 37.7 | 19.9 mm, 43.6 |

Stock focal lengths change these a little. Pi HQ with 6 mm: field 1.57 × 1.18 m, DPT 23.2. With
8 mm: 1.18 × 0.88 m, DPT 31.0. IMX183 with 8 mm: 2.46 × 1.64 m, DPT 20.0; with 12 mm: 1.64 ×
1.09 m, DPT 30.0; with 16 mm: 1.23 × 0.82 m, DPT 40.0 (calc). The lens must resolve the pixel
pitch: a 12 MP-rated 1.1" 8 mm C-mount lens (Computar V0828-MPY) lists at about $600 [M8].
Pi sells a 6 mm CS-mount lens for $25 and a 16 mm C-mount lens for $50 [R5].

## Motion blur and rolling-shutter skew

Blur is exposure time × speed. It does not depend on the camera.

| Exposure | 25 mm/s | 50 mm/s | 100 mm/s | Pixels at 50 mm/s, DPT 25 |
|---|---|---|---|---|
| 1/60 s | 0.42 mm | 0.83 mm | 1.67 mm | 2.3 px |
| 1/250 s | 0.10 mm | 0.20 mm | 0.40 mm | 0.6 px |
| 1/1000 s | 0.03 mm | 0.05 mm | 0.10 mm | 0.1 px |

1 mm is 2.8 px at DPT 25 and 3.7 px at DPT 33. Exposure ≤ 1/250 s keeps blur under 1 px at 50 mm/s.

On iOS, a manual exposure turns zero shutter lag off [A5]. `activeMaxExposureDuration` caps the
exposure the auto-exposure algorithm picks without leaving auto mode [A4], so it bounds blur and
keeps zero shutter lag.

Rolling-shutter skew is the time between the first and last row starting exposure. A train moves
speed × skew during it. Within one car, which spans a few percent of the rows, the shape change is
negligible. What matters is that the capture time differs by row by up to the skew.

| Camera | Readout (skew) | Source | 50 mm/s | 100 mm/s |
|---|---|---|---|---|
| Pi HQ, IMX477, 4056 × 3040, 12-bit | 84 ms (27.6 µs line × 3040) | driver [R2] (calc) | 4.2 mm | 8.4 mm |
| Pi CM3, IMX708, 4608 × 2592 | 68 ms (26.3 µs line × 2592) | driver [R3] (calc) | 3.4 mm | 6.8 mm |
| IMX226 at 31 fps | ≤ 32 ms (bounded by frame period) | [M2] (calc) | ≤ 1.6 mm | ≤ 3.2 mm |
| IMX183 at 18 fps | ≤ 56 ms (bounded by frame period) | [M1] (calc) | ≤ 2.8 mm | ≤ 5.6 mm |
| iPhone 16, 4K60 | ≤ 16.7 ms (bounded by frame period) | [A1] (calc) | ≤ 0.8 mm | ≤ 1.7 mm |
| iPhone 16, 48 MP still | not published | | | |
| Android | reported per frame in `SENSOR_ROLLING_SHUTTER_SKEW` | [G1] | | |
| IMX540, IMX541 | 0 (global shutter) | [M6][M7] | 0 | 0 |

The IMX226 and IMX183 are "rolling shutter with global reset" [M1][M2]: all rows start exposing
together and are read out in turn, so later rows expose longer under steady light. Run them in
plain rolling mode or keep exposure short relative to readout.

The Android figure is defined as the time from the first row's exposure start to one past the
last row's, which for a rolling shutter is the frame readout time. Scale it by N/H when only N of
H rows are used [G1].

## Capture-to-buffer latency and timestamps

Every L0 carries its frame's capture time (#31), so a fixed latency can be subtracted. What counts
against the 1 s and 2 s budgets is the frame period plus the spread of latency.

### iPhone (AVFoundation)

- All capture output sample buffers are timestamped on the session's `synchronizationClock`
  [A6]. `AVCapturePhoto.timestamp` is "the time at which the image was captured", on the same
  clock [A7].
- Each photo's `photoProcessingTimeRange` gives the minimum and maximum expected time to deliver
  it [A8]. That is the latency spread for stills, read per capture.
- With zero shutter lag (iOS 17+, on by default for formats where `isHighestPhotoQualitySupported`
  is true) the pipeline keeps a ring buffer of past frames and builds the photo from frames at the
  moment of the request [A5]. Responsive capture lets a new capture start while the previous one
  is still processing [A5]. Fast capture prioritization lowers quality to hold shot-to-shot time
  when captures come quickly [A5].
- `maxPhotoQualityPrioritization` trades quality for shot-to-shot time [A9].
- `AVCaptureVideoDataOutput` drops late frames by default (`alwaysDiscardsLateVideoFrames`)
  [A10], so a slow detector sees the newest frame rather than a growing queue.
- The 48 MP shot-to-shot rate and the readout time are not published. They must be measured.

### Android (Camera2)

- `SENSOR_TIMESTAMP` is the start of exposure of the first row, in the `elapsedRealtimeNanos`
  timebase when the timestamp source is `REALTIME` [G1].
- `REQUEST_PIPELINE_MAX_DEPTH` is the number of frame intervals from exposure to the buffer
  reaching the framework, normally ≤ 8 [G2]. At 30 fps that is ≤ 267 ms (calc).
- Output sizes that cannot reach 20 fps are listed in `getHighResolutionOutputSizes`. Sizes there
  under 24 MP still reach 10 fps; sizes ≥ 24 MP may run below 10 fps [G3].
- 50 and 200 MP sensors expose their full resolution through the `ULTRA_HIGH_RESOLUTION_SENSOR`
  capability, a separate "max resolution" mode with its own stream configuration map; the default
  mode bins pixels [G4].

### Raspberry Pi (libcamera)

- `SensorTimestamp` is the time the first row of the active array is exposed, in nanoseconds on
  `CLOCK_BOOTTIME` [R7].
- `FrameDurationLimits` fixes the frame period [R7].
- Pipeline delay was not found in a primary source. It must be measured.

### USB3 and GigE machine-vision cameras

- Raw frames go to a buffer on the camera (240 MB on the Blackfly S [M1][M2]) and then to the host.
  Transfer of a 12 MP 8-bit frame over USB3 at the 380 MB/s link limit FLIR uses for its frame-rate
  figures takes about 32 ms (calc).
- These cameras take a hardware trigger and return a camera-side timestamp per frame. Trigger
  latency is not listed in the Blackfly S sheets [M1][M2]. Not researched further.
- GigE at about 115 MB/s carries a 12 MP 8-bit frame in about 0.1 s (calc), so ~9 fps; enough for
  the requirement.

### Webcams (UVC)

- 4K arrives compressed (MJPEG or H.264) and must be decoded on the host (unverified). Latency was
  not researched.

## Compression and interface

- Phones, native app: frames reach the app uncompressed in memory (YUV from video outputs). Stills
  arrive as HEIF/JPEG, or as an uncompressed pixel buffer if the app asks for one through
  `AVCapturePhotoSettings` (not read here). No cable is
  needed when the phone also runs the detector.
- Pi cameras: raw over MIPI CSI-2 into the Pi's ISP, delivered as YUV or RGB. The HQ driver uses
  2 CSI-2 lanes [R2]. A Pi 5 has two 4-lane camera/display connectors, so two cameras per Pi [R4].
- Machine vision: uncompressed raw Bayer over USB3 Vision or GigE Vision; the host demosaics.
- Webcams: UVC, compressed at 4K.

## Phones in detail

### iPhone 16 (owned)

- Main camera: 48 MP, 26 mm, f/1.6, sensor-shift stabilisation. Photos at 24 MP and 48 MP. Video
  4K at 24/25/30/60 fps. No 8K. Ultra wide: 12 MP, 13 mm, 120° [A1].
- Field at 1.5 m, scaled from #8's 2.09 × 1.57 m at 1.57 m: 2.00 × 1.50 m for 4:3 stills, 2.00 ×
  1.12 m for 16:9 video (calc).
- DPT: 36.3 at 48 MP (8064 px), 25.7 at 24 MP (5712 px), 18.2 at 12 MP, 17.3 in 4K (calc).
- The ultra wide covers about 4 m and halves DPT (#8).
- The largest video-data-output format and its frame rates are listed in `AVCaptureDevice.formats`
  on the device. The largest still size per format is `supportedMaxPhotoDimensions` [A2]. Neither
  was read here.

### Android

- Galaxy S26 Ultra: 200 MP wide f/1.4, 50 MP ultra wide, 50 MP 5× and 10 MP 3× telephoto [P5].
  8K at 30 fps and 4K at 120 fps [P5]. Launch price $1,299.99, later reported at $1,399.99 [P6].
- The wide camera's field is not on Samsung's pages. The S25 Ultra's wide is listed as 24 mm
  equivalent by a third party (unverified); at 1.5 m that is about 2.16 × 1.62 m (calc). DPT then:
  ~34 at 50 MP, ~68 nominal at 200 MP (0.6 µm pixels, likely lens-limited), ~32 in 8K, ~16 in 4K.
- Pixel 10 Pro: 50 MP high-res capture; 4K at up to 60 fps; 8K only through Video Boost [P7],
  which processes the video after recording, so it is not a live source. With an 82° diagonal
  field (unverified), 50 MP gives DPT ~35 and 4K ~17 (calc).

## Raspberry Pi in detail

- Camera Module 3: IMX708, 4608 × 2592, 1.4 µm, 4.74 mm, 66° × 41° (standard) or 102° × 67°
  (wide), autofocus [R1]. $25 standard, $35 wide [R6]. Full resolution at 14.35 fps (driver line
  length 0x3d20 at 595.2 MHz pixel rate, 2650 lines) [R3]. Field at 1.5 m: 1.95 × 1.12 m, DPT 21
  (calc).
- HQ Camera: IMX477, 4056 × 3040, 1.55 µm, 1/2.3", C/CS or M12 mount [R1]. Launched at $50 with
  lenses from $25 [R5]. The driver's full-resolution mode is "12MPix 10fps" [R2]. Its 12-bit line
  time is 27.6 µs, giving 84 ms readout and an 11.7 fps ceiling at minimum blanking (calc from
  [R2]).
- Global Shutter Camera: IMX296, 1456 × 1088 [R1]. Too few pixels: 4 cameras give DPT ~12 (calc).

## What to measure on the device

- iPhone 16 on the mount at 1.5 m: whether all four layout corners are in the 1× frame; the 48 MP
  and 24 MP shot-to-shot interval with zero shutter lag and responsive capture on; the spread of
  `photoProcessingTimeRange`; the formats in `AVCaptureDevice.formats`.
- Any Android candidate: `getOutputSizes(YUV_420_888)` and `getHighResolutionOutputSizes` in
  default and max-resolution mode; whether 8K reaches the app as YUV; `SENSOR_ROLLING_SHUTTER_SKEW`;
  `REQUEST_PIPELINE_MAX_DEPTH`.
- Pi: time from `SensorTimestamp` to buffer arrival, and its spread, at full resolution.
- All: the exposure that room lighting allows at ≤ 1/250 s.

## Sources

Apple
- [A1] Apple, iPhone 16 tech specs. https://www.apple.com/iphone-16/specs/
- [A2] AVFoundation, `AVCaptureDevice.Format.supportedMaxPhotoDimensions`.
  https://developer.apple.com/documentation/avfoundation/avcapturedevice/format/supportedmaxphotodimensions
- [A3] AVFoundation, `AVCaptureDevice.isGeometricDistortionCorrectionEnabled`: "When the device
  supports geometric distortion correction (GDC), the default value is true."
  https://developer.apple.com/documentation/avfoundation/avcapturedevice/isgeometricdistortioncorrectionenabled
- [A4] AVFoundation, `AVCaptureDevice.activeMaxExposureDuration`.
  https://developer.apple.com/documentation/avfoundation/avcapturedevice/activemaxexposureduration
- [A5] WWDC23 session 10105, "Create a more responsive camera experience" (zero shutter lag,
  responsive capture, fast capture prioritization; "I can capture about two photos per second";
  manual exposure disables zero shutter lag). https://developer.apple.com/videos/play/wwdc2023/10105/
- [A6] AVFoundation, `AVCaptureSession.synchronizationClock`.
  https://developer.apple.com/documentation/avfoundation/avcapturesession/synchronizationclock
- [A7] AVFoundation, `AVCapturePhoto.timestamp`.
  https://developer.apple.com/documentation/avfoundation/avcapturephoto/timestamp
- [A8] AVFoundation, `AVCaptureResolvedPhotoSettings.photoProcessingTimeRange`.
  https://developer.apple.com/documentation/avfoundation/avcaptureresolvedphotosettings/photoprocessingtimerange
- [A9] AVFoundation, `AVCapturePhotoOutput.maxPhotoQualityPrioritization`.
  https://developer.apple.com/documentation/avfoundation/avcapturephotooutput/maxphotoqualityprioritization
- [A10] AVFoundation, `AVCaptureVideoDataOutput.alwaysDiscardsLateVideoFrames`.
  https://developer.apple.com/documentation/avfoundation/avcapturevideodataoutput/alwaysdiscardslatevideoframes

Android
- [G1] `CaptureResult.SENSOR_ROLLING_SHUTTER_SKEW`, `SENSOR_TIMESTAMP`.
  https://developer.android.com/reference/android/hardware/camera2/CaptureResult
- [G2] `CameraCharacteristics.REQUEST_PIPELINE_MAX_DEPTH`.
  https://developer.android.com/reference/android/hardware/camera2/CameraCharacteristics
- [G3] `StreamConfigurationMap.getHighResolutionOutputSizes`; `CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_BURST_CAPTURE`.
  https://developer.android.com/reference/android/hardware/camera2/params/StreamConfigurationMap
- [G4] `CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_ULTRA_HIGH_RESOLUTION_SENSOR`.
  https://developer.android.com/reference/android/hardware/camera2/CameraMetadata

Phones
- [P5] Samsung, Galaxy S26 Ultra pages (camera list; 8K at 30 fps).
  https://www.samsung.com/uk/smartphones/galaxy-s26-ultra/ and
  https://www.samsung.com/my/smartphones/galaxy-s26-ultra/
- [P6] TechRepublic, "Samsung Raises US Galaxy S26 Prices by Up to $200" (secondary).
  https://www.techrepublic.com/article/news-samsung-galaxy-s26-price-hike-us/
- [P7] Google Store, Pixel 10 Pro tech specs. https://store.google.com/product/pixel_10_pro_specs

Raspberry Pi
- [R1] Raspberry Pi documentation, Camera hardware.
  https://www.raspberrypi.com/documentation/accessories/camera.html
- [R2] Raspberry Pi Linux kernel, `drivers/media/i2c/imx477.c` (branch rpi-6.12.y): pixel rate
  840 MHz, link 450 MHz × 2 lanes, mode "12MPix 10fps", 4056 × 3040, minimum vertical blanking 48.
  https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/media/i2c/imx477.c
- [R3] Raspberry Pi Linux kernel, `drivers/media/i2c/imx708.c`: 4608 × 2592 mode, line length
  0x3d20, pixel rate 595.2 MHz, minimum vertical blanking 58.
  https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/media/i2c/imx708.c
- [R4] Raspberry Pi 5 product page ("2 × 4-lane MIPI camera/display transceivers").
  https://www.raspberrypi.com/products/raspberry-pi-5/
- [R5] Raspberry Pi news, "New product: Raspberry Pi High Quality Camera on sale now at $50"
  (6 mm CS lens $25, 16 mm C lens $50).
  https://www.raspberrypi.com/news/new-product-raspberry-pi-high-quality-camera-on-sale-now-at-50/
- [R6] Raspberry Pi news, "New autofocus camera modules!" ($25 standard, $35 wide).
  https://www.raspberrypi.com/news/new-autofocus-camera-modules/
- [R7] libcamera, `src/libcamera/control_ids_core.yaml` (`SensorTimestamp`, `FrameDurationLimits`).
  https://github.com/raspberrypi/libcamera/blob/main/src/libcamera/control_ids_core.yaml

Machine vision
- [M1] Teledyne FLIR, BFS-U3-200S6 specification. https://softwareservices.flir.com/BFS-U3-200S6/latest/Model/spec.html
- [M2] Teledyne FLIR, BFS-U3-120S4 specification. https://softwareservices.flir.com/BFS-U3-120S4/latest/Model/spec.html
- [M3] Edmund Optics, BFS-U3-200S6C-C listing ($700). https://www.edmundoptics.com/p/bfs-u3-200s6c-c-usb3-blackflyreg-s-color-camera/45718/
- [M4] Basler shop, acA4024-29uc (net list €479, read from a search snippet). https://www.baslerweb.com/en/shop/acA4024-29uc
- [M5] Edmund Optics, LUCID Triton TRI200S-CC ($555). https://www.edmundoptics.com/p/lucid-vision-labs-tritontrade-tri200s-cc-sony-imx183-200mp-color-camera/41827/
- [M6] Basler shop, a2A4504-18ucBAS ($1,969 US net list; 4504 × 4504, 2.74 µm, 18 fps, global;
  read from a search snippet). https://www.baslerweb.com/en-us/shop/a2a4504-18ucbas
- [M7] Basler shop, a2A5328-15ucBAS (€2,279 net list; IMX540, 15 fps; read from a search
  snippet). https://www.baslerweb.com/en/shop/a2A5328-15ucBAS
- [M8] LUCID, Computar 1.1" 8 mm f/2.8 C-mount lens ($600). https://thinklucid.com/product/computar-c-mount-1-1-8mm-f-2-8/

Webcams
- [W1] Logitech, Brio 4K webcam (4K at 30 fps up to 4096 × 2160; 65°, 78° or 90° diagonal).
  https://logitech.com/en-my/products/webcams/brio4kwebcam.html

The Basler shop pages refused direct fetches; their prices and specs were read from search-result
snippets of those pages. The Brio's 90° field is used for the 2.65 m width; its narrower settings
are digital crops of the same sensor (unverified), so they do not raise DPT.
