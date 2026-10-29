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
| yolo26n-obb | 33 | 189 | n/a | 1324 | 514 | n/a |
| yolo26s-obb | 20 | 267 | 1859 | 595 | 738 | 1190 |
| yolo26s-obb | 25 | 417 | 9350 | 1558 | 984 | 1967 |
| yolo26s-obb | 33 | 726 | n/a | 5098 | 1844 | n/a |
| yolo26m-obb | 20 | 870 | 6137 | 1940 | 2275 | 3879 |
| yolo26m-obb | 25 | 1359 | 30863 | 5080 | 3033 | 6066 |
| yolo26m-obb | 33 | 2368 | n/a | 16625 | 5687 | n/a |
| yolo26l-obb | 20 | 1094 | 7707 | 2439 | 2874 | 4877 |
| yolo26l-obb | 25 | 1709 | 38762 | 6387 | 3832 | 7664 |
| yolo26l-obb | 33 | 2978 | n/a | 20902 | 7185 | n/a |
| yolo26x-obb | 20 | 2448 | 17288 | 5458 | 6369 | 10917 |
| yolo26x-obb | 25 | 3825 | 86948 | 14296 | 8492 | 16983 |
| yolo26x-obb | 33 | 6665 | n/a | 46787 | 15922 | n/a |

## GFLOPs per refresh per metre of strip (2 m strip / 2), square vs rectangular canvas

| model | region | DPT | square @640 | square @1024 | square @2048 | rect @w=640 | rect @w=1024 | rect @w=2048 |
|---|---|---|---|---|---|---|---|---|
| yolo26n-obb | 1-track strip | 20 | 52.8 | 51.5 | 102.8 | 5.2 | 3.1 | 2.6 |
| yolo26n-obb | 1-track strip | 25 | 119.4 | 80.9 | 137.0 | 11.7 | 4.8 | 3.5 |
| yolo26n-obb | 1-track strip | 33 | n/a | 147.1 | 171.3 | n/a | 13.1 | 6.6 |
| yolo26n-obb | 2-track strip | 20 | 52.8 | 51.5 | 102.8 | 10.4 | 6.1 | 5.3 |
| yolo26n-obb | 2-track strip | 25 | 119.4 | 80.9 | 137.0 | 23.5 | 9.6 | 7.1 |
| yolo26n-obb | 2-track strip | 33 | n/a | 147.1 | 171.3 | n/a | 26.4 | 13.3 |
| yolo26n-obb | 4-track strip | 20 | 52.8 | 51.5 | 102.8 | 18.2 | 10.8 | 9.4 |
| yolo26n-obb | 4-track strip | 25 | 119.4 | 80.9 | 137.0 | 53.1 | 21.9 | 16.2 |
| yolo26n-obb | 4-track strip | 33 | n/a | 147.1 | 171.3 | n/a | 48.8 | 24.9 |
| yolo26s-obb | 1-track strip | 20 | 206.6 | 198.3 | 368.9 | 20.4 | 12.1 | 10.4 |
| yolo26s-obb | 1-track strip | 25 | 467.5 | 311.6 | 491.8 | 46.3 | 19.0 | 13.8 |
| yolo26s-obb | 1-track strip | 33 | n/a | 566.5 | 614.8 | n/a | 51.7 | 25.9 |
| yolo26s-obb | 2-track strip | 20 | 206.6 | 198.3 | 368.9 | 40.9 | 24.2 | 20.8 |
| yolo26s-obb | 2-track strip | 25 | 467.5 | 311.6 | 491.8 | 92.7 | 38.0 | 27.7 |
| yolo26s-obb | 2-track strip | 33 | n/a | 566.5 | 614.8 | n/a | 103.8 | 52.2 |
| yolo26s-obb | 4-track strip | 20 | 206.6 | 198.3 | 368.9 | 71.8 | 42.4 | 36.6 |
| yolo26s-obb | 4-track strip | 25 | 467.5 | 311.6 | 491.8 | 209.1 | 85.8 | 62.9 |
| yolo26s-obb | 4-track strip | 33 | n/a | 566.5 | 614.8 | n/a | 191.1 | 96.5 |
| yolo26m-obb | 1-track strip | 20 | 681.8 | 646.5 | 1137.3 | 68.0 | 40.1 | 34.4 |
| yolo26m-obb | 1-track strip | 25 | 1543.1 | 1016.0 | 1516.4 | 153.8 | 63.0 | 45.8 |
| yolo26m-obb | 1-track strip | 33 | n/a | 1847.2 | 1895.5 | n/a | 171.8 | 86.0 |
| yolo26m-obb | 2-track strip | 20 | 681.8 | 646.5 | 1137.3 | 136.0 | 80.2 | 68.8 |
| yolo26m-obb | 2-track strip | 25 | 1543.1 | 1016.0 | 1516.4 | 307.8 | 126.0 | 91.8 |
| yolo26m-obb | 2-track strip | 33 | n/a | 1847.2 | 1895.5 | n/a | 343.9 | 172.2 |
| yolo26m-obb | 4-track strip | 20 | 681.8 | 646.5 | 1137.3 | 238.1 | 140.5 | 120.6 |
| yolo26m-obb | 4-track strip | 25 | 1543.1 | 1016.0 | 1516.4 | 693.1 | 284.0 | 207.0 |
| yolo26m-obb | 4-track strip | 33 | n/a | 1847.2 | 1895.5 | n/a | 631.3 | 316.6 |
| yolo26l-obb | 1-track strip | 20 | 856.4 | 812.8 | 1436.9 | 85.3 | 50.3 | 43.1 |
| yolo26l-obb | 1-track strip | 25 | 1938.1 | 1277.3 | 1915.9 | 193.1 | 79.1 | 57.5 |
| yolo26l-obb | 1-track strip | 33 | n/a | 2322.4 | 2394.9 | n/a | 215.7 | 107.9 |
| yolo26l-obb | 2-track strip | 20 | 856.4 | 812.8 | 1436.9 | 170.7 | 100.7 | 86.4 |
| yolo26l-obb | 2-track strip | 25 | 1938.1 | 1277.3 | 1915.9 | 386.3 | 158.2 | 115.2 |
| yolo26l-obb | 2-track strip | 33 | n/a | 2322.4 | 2394.9 | n/a | 431.8 | 216.3 |
| yolo26l-obb | 4-track strip | 20 | 856.4 | 812.8 | 1436.9 | 298.9 | 176.4 | 151.5 |
| yolo26l-obb | 4-track strip | 25 | 1938.1 | 1277.3 | 1915.9 | 870.2 | 356.6 | 260.1 |
| yolo26l-obb | 4-track strip | 33 | n/a | 2322.4 | 2394.9 | n/a | 792.9 | 397.9 |
| yolo26x-obb | 1-track strip | 20 | 1920.9 | 1819.5 | 3184.3 | 191.6 | 113.0 | 96.9 |
| yolo26x-obb | 1-track strip | 25 | 4347.4 | 2859.2 | 4245.8 | 433.7 | 177.5 | 129.2 |
| yolo26x-obb | 1-track strip | 33 | n/a | 5198.5 | 5307.2 | n/a | 484.3 | 242.3 |
| yolo26x-obb | 2-track strip | 20 | 1920.9 | 1819.5 | 3184.3 | 383.3 | 226.0 | 193.9 |
| yolo26x-obb | 2-track strip | 25 | 4347.4 | 2859.2 | 4245.8 | 867.6 | 355.2 | 258.6 |
| yolo26x-obb | 2-track strip | 33 | n/a | 5198.5 | 5307.2 | n/a | 969.2 | 485.2 |
| yolo26x-obb | 4-track strip | 20 | 1920.9 | 1819.5 | 3184.3 | 671.1 | 395.8 | 339.8 |
| yolo26x-obb | 4-track strip | 25 | 4347.4 | 2859.2 | 4245.8 | 1953.4 | 800.1 | 583.0 |
| yolo26x-obb | 4-track strip | 33 | n/a | 5198.5 | 5307.2 | n/a | 1778.8 | 891.5 |
