# Gaming Android phones for sustained detection, new and used

Written 2026-10-29. Research for [issue #41](https://github.com/rails49/detector/issues/41), under map
[#31](https://github.com/rails49/detector/issues/31). It builds on the Snapdragon section of
`docs/research/compute-hardware.md` on branch `research/compute-hardware` [S1] and on
`docs/research/cameras.md` on branch `research/cameras` [S2], and does not repeat them.

Sources are listed at the end and cited as [S1], [S2], and so on. Numbers marked "estimate" are
arithmetic or inference done here, with the method shown. Nothing was measured on a device for this
note. Prices were read on 2026-10-29.

## Answer

1. No published test measures a phone NPU under sustained load for 30 minutes or more, on a gaming
   phone or any other phone. Every reviewer stress test found is a GPU test (3DMark, 20 loops, about
   20 minutes) or a CPU test. The NPU question is open and needs a measurement.
2. On the GPU, the claim holds for the ASUS ROG Phone 9 Pro and partly for RedMagic. The ROG Phone 9
   Pro kept 90–98.5 % of its peak in 20-loop 3DMark stress tests [S3, S5]. RedMagic 11 Pro and 11S
   Pro kept 75–77 % [S7, S9]. Ordinary Snapdragon 8 Elite flagships kept 56–69 % (Galaxy S25 Ultra
   56–59 %, OnePlus 13 69 %) [S13, S14]. The iPhone 17 Pro and Pro Max kept 61–65 % [S15, S16].
3. Two caveats weaken the GPU result. The ROG Phone's X Mode reaches its high stability by starting
   from a lower peak than its default profile [S4]. UL delisted the RedMagic 11 Pro and 11 Pro+ from
   3DMark in April 2026 because the phones raised their performance mode when they saw the 3DMark
   app, scoring up to 24 % higher than on an identical renamed build [S12]. Reviewer stress figures
   for RedMagic phones were taken with the public app and carry that boost.
4. Fans did not change sustained GPU results on RedMagic phones. GSMArena found fan on and fan off
   within the margin of error on the 10S Pro, and no meaningful difference on the 11S Pro [S10, S11].
   The ROG Phone's clip-on fan raised Steel Nomad Light stability from 89.8 % to 99.2 % [S5]. Whether
   any cooling changes the NPU's sustained clock is not published.
5. The NPU evidence that exists is on ordinary 8 Elite phones and is mild. One paper ran an 8 Elite
   NPU in Qualcomm's sustained performance mode for 15 minutes on mains power: it settled at 66 °C
   and did not throttle, while the CPU path reached 82 °C and did [S17]. Another, on a OnePlus 13T
   without cooling, saw mean step latency rise 21 % over 10 minutes for an NPU-served workload [S18].
6. The used-market claim holds for ordinary flagships, not for gaming phones. On 2026-10-29 Swappa
   listed 177 used Galaxy S25 Ultras (8 Elite) at an average sale price of $663 for 256 GB, about half
   the $1,299 new price, from $541 [S25, S31]. It listed none of the ROG Phone 9 Pro, ROG Phone 9 or
   ROG Phone 8 Pro [S22–S24]. Used ROG Phone 9 Pros on eBay were mostly Hong Kong and China sellers
   asking $928–1,600, against a $1,199 launch price [S5, S28]. eBay showed no used RedMagic 10 Pro
   phones [S29]. ASUS released no phones in 2026 [S21], so that supply will not grow.
7. At 1.5 Hz the NPU is busy for a large share of each second for any model above n (estimate,
   below). For n the duty cycle is 8–26 % of the 8 Elite's W8A16 burst. For s it is 31–95 %, and m and
   l exceed the W8A16 burst at DPT 20 and up. Sustained NPU behaviour therefore matters for s and up,
   and the existing GPU tests do not answer it.
8. The cheapest way to settle points 1 and 7 is a used 8 Elite phone (Galaxy S25 Ultra $541–736,
   OnePlus 13 $567–657 on Swappa [S25, S27]), running the QNN export for 30–60 minutes at 1.5 Hz with
   per-frame latency and thermal logging. All 8 Elite phones share the Hexagon v79 NPU [S1], so the
   measurement carries over to the ROG Phone 9 Pro; only its cooling differs.

## The workload against the NPU

Sustained throughput needed at 1.5 Hz (from the issue's context), divided by the 8 Elite's burst NPU
throughput from Qualcomm AI Hub (YOLOv8n, NPU time only: 5.8 TFLOP/s W8A16, 12.4 TFLOP/s W8A8) [S1].
The result is the fraction of each second the NPU must run, if it held its burst speed (estimate).

| Model | Need, DPT 20 / 25 / 33 (TFLOP/s) | Duty, W8A16 | Duty, W8A8 |
| :--- | :--- | :--- | :--- |
| n | 0.46 / 0.82 / 1.5 | 8 / 14 / 26 % | 4 / 7 / 12 % |
| s | 1.8 / 3.0 / 5.5 | 31 / 52 / 95 % | 15 / 24 / 44 % |
| m | 5.8 / 9.1 / 17 | 100 / 157 / 293 % | 47 / 73 / 137 % |
| l | 7.3 / 12 / 22 | 126 / 207 / 379 % | 59 / 97 / 177 % |

How to read it:

- Over 100 % means the model cannot run at 1.5 Hz on that path even in burst.
- The burst figures are for an n-size model at 640. Larger models fill the accelerator better; on
  other devices l reached 3–10× the effective throughput of n [S1]. So the m and l rows are pessimistic
  by an unknown factor.
- The end-to-end figure in an app is lower. Ultralytics measured YOLO26n-obb at 1.1 TFLOP/s through
  ONNX Runtime on an 8 Elite Gen 5 phone [S1]. Against that, n needs 42 / 75 / 136 % at DPT
  20 / 25 / 33.
- Ultralytics' QNN export is W8A16 [S1]. W8A8 would need a separate export and an accuracy check.
- The compute-hardware note advises planning against half the burst figure until measured [S1]. On
  that basis W8A16 fits n at every DPT and s at DPT 20; W8A8 fits n and s at every DPT and m at DPT 20
  (estimate).

At duty cycles near 100 % the NPU runs continuously, and its sustained clock decides the result. No
published test gives that clock.

## Sustained performance

### What the published tests measure

All reviewer stress tests found are GPU or CPU tests. 3DMark's stress tests loop one GPU benchmark 20
times and report stability as the lowest loop's score divided by the best loop's. GSMArena also runs a
CPU throttling test. None of the reviews of the ROG Phone 9 Pro, RedMagic 10S Pro, 11 Pro or 11S Pro
ran an AI or NPU benchmark in a loop [S4, S5, S7, S9, S10, S11]. Notebookcheck ran AI benchmarks on the
ROG Phone 9 Pro once each, not sustained, and called the results below expectations [S5]. None of the
tests run 30 minutes or longer.

### GPU stability, 20-loop 3DMark stress tests

| Phone | Chip | Test | Stability | Source |
| :--- | :--- | :--- | ---: | :--- |
| ASUS ROG Phone 9 Pro, X Mode, no fan | 8 Elite | Wild Life Extreme | 98.5 % (5,941 best, 5,850 lowest), 54 °C max | [S3] |
| ASUS ROG Phone 9 Pro | 8 Elite | Wild Life Extreme | 90.6 % | [S5] |
| ASUS ROG Phone 9 Pro | 8 Elite | Steel Nomad Light, no fan / clip-on fan | 89.8 % / 99.2 % | [S5] |
| RedMagic 11 Pro | 8 Elite Gen 5 | Wild Life Extreme | 75 % | [S7] |
| RedMagic 11S Pro | 8 Elite Gen 5 | Wild Life Extreme | 77 %; rivals 49–60 % | [S9] |
| Galaxy S25 Ultra | 8 Elite for Galaxy | Wild Life Extreme | 59.4 % | [S13] |
| Galaxy S25 Ultra, user median | 8 Elite for Galaxy | Wild Life Extreme | 56 % | [S14] |
| OnePlus 13 | 8 Elite | Wild Life Extreme | 68.9 % | [S13] |
| Pixel 10 Pro XL | Tensor G5 | Wild Life Extreme | 95.1 % | [S13] |
| iPhone 17 Pro Max | A19 Pro | Wild Life Extreme | 65.2 % | [S15] |
| iPhone 17 Pro | A19 Pro | Solar Bay Extreme | 61.4 % | [S16] |

Stability is relative to each phone's own peak, so it does not rank sustained speed between phones.

The ROG Phone 9 Pro's X Mode gives lower burst scores than its default Dynamic profile [S4]. Its
stability in X Mode therefore partly reflects a lower starting clock. GSMArena saw its CPU hold for
about 10 minutes before throttling without the fan, and longer with it [S4].

The RedMagic figures carry the 3DMark detection that UL found: the public app scored up to 24 % higher
than a renamed internal build, and UL measured surface temperatures above 50 °C [S12]. Android
Authority measured a 59 °C peak on the 11S Pro in Wild Life Extreme, against 46 °C for the OnePlus 15
[S9]. The RedMagic fan made no measurable difference to GPU stability on the 10S Pro or the 11S Pro
[S10, S11]. On the 10S Pro the CPU kept 56 % of peak with the fan and 54 % without [S11].

### NPU under sustained load

Two papers report 8 Elite NPU behaviour over minutes, both on ordinary phones:

- Phase Matters (arXiv, June 2026), unnamed SM8750 phone, mains power, 23 °C room, NPU in sustained
  performance mode, vision-language inference back to back. Over 100 runs the NPU averaged 40.8 °C and
  showed no latency outliers. In a 15-minute stress run the NPU settled at 66 °C, below the 85 °C trip
  point the authors read from the thermal configuration; the CPU path reached 82 °C and was throttled
  [S17].
- Tandem (arXiv, October 2026), OnePlus 13T, no cooling, 10 minutes of back-to-back requests to an
  NPU-served agent: mean step latency rose from 1.18 s in the first minute to 1.43 s in the last, a
  21 % rise the authors attribute to thermal throttling [S18]. The paper does not say which unit
  slowed.

Neither is a vision model running at a fixed rate, and neither runs 30 minutes.

Runtime settings. ONNX Runtime's QNN execution provider takes an `htp_performance_mode` with
values including `burst` and `sustained_high_performance`, and documents neither [S19]. Ultralytics
found that both give the same clocks under ONNX Runtime [S20].

### What this means for gaming phones and the NPU

- The ROG Phone 9 Pro shows the best sustained GPU, with and without its fan. Its NPU is the same
  Hexagon v79 as any other 8 Elite phone [S1]. A larger heat path should help any unit on the die, but
  no source shows it for the NPU (estimate).
- The RedMagic fan does not move GPU results, and RedMagic's 3DMark numbers are inflated by app
  detection. Neither supports buying one for sustained NPU work.
- The NPU papers suggest an ordinary 8 Elite phone loses 0–21 % on the NPU over 10–15 minutes, much
  less than the 31–44 % its GPU loses [S13, S14]. That is a hint from two unrelated workloads, not a measurement
  of this one.
- The camera, ISP and image preprocessing run continuously next to the NPU in the live detector. No
  test above includes that heat.

## Running on mains power for months

- ROG Phone 9 Pro: bypass charging, a charge limit (for example 80 % or 90 %), Steady and Ultra
  Steady charging, and scheduled charging [S6]. ASUS lists bypass charging under Game Genie, its
  in-game panel [S33]. Whether it applies to an app that is not registered as a game is not stated
  (not verified).
- RedMagic 11 Pro and 11S Pro: bypass charging and a charge limit [S8, S10].
- Galaxy S25 Ultra: One UI 6.1 and later offers battery protection that stops charging at 80 %
  (Maximum), at 100 % with resume at 95 % (Basic), or adaptively [S37]. Samsung's bypass mode, "Pause
  USB Power Delivery" in Game Booster, needs a 25 W USB PD/PPS charger and works only while a game
  runs (secondary source, 2023 [S38]).
- Pixels: cap charging at 80 % after four or more days of continuous charging, or during continuous
  charging under high drain such as games (Google support page as quoted in 2021 [S39]).
- Battery swelling over months on mains: no manufacturer figure was found. With a charge limit or
  bypass charging, the battery sits below full charge, which manufacturers present as the reason for
  those features [S6, S37]. A swollen battery in a worn used phone is a risk to check on arrival.

## Used and new prices, US, 2026-10-29

Swappa current listings and average sale prices [S22–S27]:

| Phone | Chip | Listings | Avg sale price | Lowest listing |
| :--- | :--- | ---: | :--- | ---: |
| Galaxy S25 Ultra | 8 Elite for Galaxy | 177 | $663 (256 GB), $705 (512 GB), $862 (1 TB) | $541 |
| Galaxy S24 Ultra | 8 Gen 3 for Galaxy | 153 | $531 (256 GB), $582 (512 GB), $686 (1 TB) | $490 |
| OnePlus 13 | 8 Elite | 8 | $573 (256 GB), $610 (512 GB) | $567 |
| ASUS ROG Phone 9 Pro | 8 Elite | 0 | $1,030 (1 TB, last recorded) | none |
| ASUS ROG Phone 9 | 8 Elite | 0 | $649 (256 GB, last recorded) | none |
| ASUS ROG Phone 8 Pro | 8 Gen 3 | 0 | $618 (512 GB, last recorded) | none |

Swappa's monthly averages for the S25 Ultra 256 GB fell from $741 in April 2026 to $652 in September
[S25].

Other markets:

- eBay, used ROG Phone 9 Pro: about 40 listings, nearly all from Hong Kong and China sellers, $928 to
  over $1,600. Two US listings: a 1 TB unit in poor condition with display spots, auction starting at
  $759.98, and an unnamed 16/512 GB ROG Phone at $800 from a seller with no feedback [S28]. Used ROG Phone 8 Pro: from about $552, also from Hong Kong [S28].
- eBay, used RedMagic 10 Pro: no phones, only parts [S29].
- eBay sold listings need a signed-in account and were not read. How many units actually sell is
  unknown.
- eBay, cracked screens: one US Galaxy S25 Ultra (AT&T, cracked screen, sold as is) at $389.95; one
  S24 Ultra with a cracked display at $469.99 [S30]. Cracked units are few and not much cheaper.
- Back Market, refurbished Galaxy S25 Ultra: from $529 (AT&T locked) and $656.49 unlocked, against
  $1,299 new [S31].
- RedMagic's store, new: 10 Pro $599 and 10S Pro $609, both "no longer available"; 11S Pro (8 Elite
  Gen 5) $799, shown out of stock [S32].
- ASUS launched the ROG Phone 9 Pro at $1,199 (16/512 GB) [S5] and released no phones in 2026 [S21].

So the market is deep for the Galaxy S25 and S24 Ultra, thin for the OnePlus 13, and close to empty
in the US for gaming phones. A used S25 Ultra costs about 50 % of new (estimate: $663 ÷ $1,299).

## Camera: field and DPT at 1.5 m

Field width = 1.5 m × 34.6 mm ÷ (35 mm-equivalent focal length), for a 4:3 frame whose diagonal
matches the 43.3 mm full-frame diagonal. Height is 0.75 × width. DPT = pixels across ÷ field width
(mm) × 9 mm (estimate). The equivalent focal lengths are GSMArena's; the vendors do not publish them.

| Phone | Main camera | Field at 1.5 m | DPT, 50 MP (8,192 px) | DPT, 12.5 MP binned (4,096 px) | DPT, 8K video | DPT, 4K video |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: |
| ROG Phone 9 Pro | 50 MP Sony Lytia 700, 1/1.56", f/1.9, 24 mm [S33, S34] | 2.16 × 1.62 m | 34 | 17 | 32 | 16 |
| RedMagic 11 Pro | 50 MP OV50E, 1/1.55", f/1.9, 23 mm [S32, S35] | 2.26 × 1.69 m | 33 | 16 | 31 | 15 |
| Galaxy S25 Ultra | 200 MP, 1/1.3", f/1.7, 24 mm [S36] | 2.16 × 1.62 m | 34 (50 MP mode) | 17 | 32 | 16 |

The layout plus margin is 2.1 × 1.1 m [S2]. The 24 mm cameras clear 2.1 m by about 30 mm on each side;
the 23 mm camera by about 80 mm (estimate). Mount height and lens distortion move these numbers, so
the corners must be checked on the mount.

DPT 20 needs at least 4,700 px across 2.1 m [S2]. The binned 12.5 MP stream and 4K video fall short.
Only full-resolution stills or 8K video reach it. All three phones record 8K at 30 fps [S33, S35, S36].
Whether an app receives 8K or full-resolution frames as YUV through Camera2, and at what rate, is the
open device check already listed in the camera note [S2].

## Caveats

- No NPU sustained figure exists for any gaming phone. The GPU figures are a weak proxy.
- 3DMark stress tests run about 20 minutes, not 30 or more.
- RedMagic 11-series stress figures in reviews were taken with an app that the phone detects [S12].
- The duty-cycle table uses an n-size burst figure for every model size.
- Swappa counts listings, not sales, except for its average sale price. eBay sold data was not read.
- The NPU papers use language-model and vision-language workloads, not YOLO at a fixed rate.

## Sources

- [S1] This repo, `docs/research/compute-hardware.md` on branch `research/compute-hardware`
  (Snapdragon section, Qualcomm AI Hub and Ultralytics QNN figures):
  <https://github.com/rails49/detector/blob/research/compute-hardware/docs/research/compute-hardware.md>
- [S2] This repo, `docs/research/cameras.md` on branch `research/cameras`:
  <https://github.com/rails49/detector/blob/research/cameras/docs/research/cameras.md>
- [S3] SOGI, ROG Phone 9 Pro Edition review, 2024-11-19, 3DMark stress tests with and without the
  cooler: <https://www.sogi.com.tw/articles/reviews_asus_rog_phone_9_pro/6263490>
- [S4] GSMArena, ROG Phone 9/9 Pro review, performance and thermal throttling, 2024-11-19:
  <https://www.gsmarena.com/asus_rog_phone_9_pro-review-2765p4.php>
- [S5] Notebookcheck, ASUS ROG Phone 9 Pro review, 2024-11-26 (stress tests, temperatures, AI
  benchmarks, $1,199 price):
  <https://www.notebookcheck.net/Asus-ROG-Phone-9-Pro-review-This-smartphone-is-the-first-choice-for-every-gamer.924300.0.html>
- [S6] GSMArena, ROG Phone 9/9 Pro review, battery and charging:
  <https://www.gsmarena.com/asus_rog_phone_9_pro-review-2765p3.php>
- [S7] GSMArena, RedMagic 11 Pro review, performance, 2025-11-17:
  <https://www.gsmarena.com/redmagic_11_pro-review-2902p4.php>
- [S8] GSMArena, RedMagic 11 Pro review, battery and charging:
  <https://www.gsmarena.com/redmagic_11_pro-review-2902p3.php>
- [S9] Android Authority, REDMAGIC 11S Pro review, 2026-05-27: <https://www.androidauthority.com/p-3670930/>
- [S10] GSMArena, RedMagic 11S Pro review, 2026-06-04, charging and performance pages:
  <https://www.gsmarena.com/redmagic_11s_pro-review-2969p3.php>,
  <https://www.gsmarena.com/redmagic_11s_pro-review-2969p4.php>
- [S11] GSMArena, RedMagic 10S Pro benchmarks and throttling tests, 2025-06-07:
  <https://www.gsmarena.com/redmagic_10s_pro_benchmarks_and_throttling_tests_-news-68118.php>
- [S12] UL Benchmarks, "3DMark delisting of REDMAGIC 11 Pro phones", 2026-04-09:
  <https://benchmarks.ul.com/news/3dmark-delisting-of-redmagic-11-pro-phones>
- [S13] Notebookcheck, Pixel 10 Pro XL and Tensor G5 stability in GPU test, 2025-08-29:
  <https://www.notebookcheck.net/Google-Pixel-10-Pro-XL-and-Tensor-G5-deliver-class-leading-stability-in-GPU-test.1097994.0.html>
- [S14] UL Benchmarks, Galaxy S25 Ultra, user-submitted medians:
  <https://benchmarks.ul.com/hardware/phone/Samsung+Galaxy+S25+Ultra+review>
- [S15] Tom's Guide, iPhone 17 Pro Max sustained performance test (via [S1]):
  <https://www.tomsguide.com/phones/iphones/iphone-17-pro-max-endurance-tested-does-the-new-design-actually-improve-performance>
- [S16] Notebookcheck, iPhone 17 Pro stability in GPU ray-tracing stress test (via [S1]):
  <https://www.notebookcheck.net/Apple-iPhone-17-Pro-shows-lower-stability-than-iPhone-17-in-GPU-ray-tracing-stress-test.1117338.0.html>
- [S17] Murthy et al., "Phase Matters: Characterizing Heterogeneous Vision-Language Inference on a
  Mobile SoC", arXiv:2606.27906, 2026-06-26: <https://arxiv.org/html/2606.27906v1>
- [S18] Chen et al., "Tandem: Serving Hybrid Linear-Attention GUI Agents on Mobile NPUs",
  arXiv:2610.26660, 2026-10-19, § 6.8: <https://arxiv.org/html/2610.26660>
- [S19] ONNX Runtime, QNN execution provider options:
  <https://onnxruntime.ai/docs/execution-providers/QNN-ExecutionProvider.html>
- [S20] Ultralytics yolo-flutter-app, `doc/performance.md` (via [S1]):
  <https://github.com/ultralytics/yolo-flutter-app/blob/main/doc/performance.md>
- [S21] Notebookcheck, "Asus confirms discontinuation of Zenfone and ROG Phone for 2026", 2026-01-04:
  <https://www.notebookcheck.net/Asus-confirms-discontinuation-of-Zenfone-and-ROG-Phone-for-2026.1196157.0.html>
- [S22] Swappa, ROG Phone 9 Pro prices, updated 2026-10-29: <https://swappa.com/prices/asus-rog-phone-9-pro>
- [S23] Swappa, ROG Phone 9 prices, updated 2026-10-29: <https://swappa.com/prices/asus-rog-phone-9>
- [S24] Swappa, ROG Phone 8 Pro prices, updated 2026-10-29: <https://swappa.com/prices/asus-rog-phone-8-pro>
- [S25] Swappa, Galaxy S25 Ultra prices, updated 2026-10-29: <https://swappa.com/prices/samsung-galaxy-s25-ultra>
- [S26] Swappa, Galaxy S24 Ultra prices, updated 2026-10-29: <https://swappa.com/prices/samsung-galaxy-s24-ultra>
- [S27] Swappa, OnePlus 13 prices, updated 2026-10-29: <https://swappa.com/prices/oneplus-13>
- [S28] eBay US, used "rog phone 9 pro" listings sorted by price, read 2026-10-29:
  <https://www.ebay.com/sch/i.html?_nkw=rog+phone+9+pro&LH_ItemCondition=3000&_sop=15>
- [S29] eBay US, used "redmagic 10 pro" listings, read 2026-10-29:
  <https://www.ebay.com/sch/i.html?_nkw=redmagic+10+pro&LH_ItemCondition=3000&_sop=15>
- [S30] eBay US, "galaxy s25 ultra cracked", US sellers, read 2026-10-29:
  <https://www.ebay.com/sch/i.html?_nkw=galaxy+s25+ultra+cracked&_sacat=9355&_sop=15&LH_PrefLoc=1>
- [S31] Back Market US, Galaxy S25 Ultra search, read 2026-10-29:
  <https://www.backmarket.com/en-us/search?q=galaxy%20s25%20ultra>
- [S32] RedMagic store, phone comparison and product pages (10 Pro, 10S Pro, 11S Pro), read
  2026-10-29: <https://global.redmagic.gg/collections/redmagic-phones>,
  <https://global.redmagic.gg/products/redmagic-10-pro>,
  <https://global.redmagic.gg/products/redmagic-10s-pro>,
  <https://global.redmagic.gg/products/redmagic-11s-pro>
- [S33] ASUS, ROG Phone 9 Pro specifications: <https://rog.asus.com/phones/rog-phone-9-pro/spec/>
- [S34] GSMArena, ASUS ROG Phone 9 Pro specifications:
  <https://www.gsmarena.com/asus_rog_phone_9_pro-13469.php>
- [S35] GSMArena, RedMagic 11 Pro (global) specifications:
  <https://www.gsmarena.com/zte_nubia_redmagic_11_pro_5g_int-14277.php>
- [S36] GSMArena, Galaxy S25 Ultra specifications:
  <https://www.gsmarena.com/samsung_galaxy_s25_ultra-13322.php>
- [S37] Samsung, "Galaxy Battery protection feature in One UI 6.1":
  <https://www.samsung.com/uk/support/mobile-devices/galaxy-battery-protection-feature-in-one-ui-6-1>
- [S38] SamMobile, "How to enable battery bypass feature for cooler gaming on your Galaxy phone",
  updated 2023-02-15 (secondary): <https://www.sammobile.com/?p=15032538>
- [S39] XDA Developers, Pixel 80 % charging limit, 2021-07-14 (secondary, quotes Google's support page):
  <https://www.xda-developers.com/google-pixel-battery-charging-limit-feature/>
