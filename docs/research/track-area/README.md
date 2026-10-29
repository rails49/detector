# Area the detector must see on the 2×1 m N layout

For [Task: measure the area the detector must see on the 2×1 m layout](https://github.com/rails49/detector/issues/33).
Not for merging.

## Method

- Track is approximated from the 1,026 labeled cars in `ceiling-2026-10-28` and `ceiling-2026-10-29`,
  mapped to layout mm with each archive's calibration (z ignored, good to about 3%).
- Track no car stood on is traced by hand on the top-down view (`TRACED` in `track_area.py`).
- The band is the track centre line ± one car width, 38 mm. Parallel track centres are 33 mm apart, so
  a wider band only takes in cars on the next track.
- Excluded, on the 100 mm grid of `marked.jpg`: A0–E3, A4–B15, F0–J0. Cells without track need no
  detection.
- Tiles are the full-layout grid at canvas 2048, 1024 or 640 with a 188 mm overlap (`tile_overlap_mm`).
  A tile counts if any band pixel falls in it.

Run from `detector/`: `uv run python ../docs/research/track-area/track_area.py <out dir>`.

## Results

- 38 mm band outside the exclusions: 0.61 m², 31% of the layout. The traced track adds 0.04 m².
- Whole 100 mm cells with track: 123 of 200, 1.23 m².
- Square tiles touching the band:

  | DPT, canvas | tiles | tiled px ÷ band px |
  |---|---|---|
  | 20 @2048 | 6 of 6 | 8.3× |
  | 20 @1024 | 20 of 21 | 6.9× |
  | 20 @640 | 154 of 171 | 20.8× |
  | 33 @2048 | 15 of 15 | 7.6× |
  | 33 @1024 | 161 of 180 | 20.5× |
  | 33 @640 | overlap larger than canvas | |

- Before the exclusions and the traced track, at three band widths: `table.md`.

## Drawings

- `marked.jpg`: exclusions (blue), band from labeled cars (yellow), traced track (magenta).
- `tiles-dpt20-2048.jpg`, `tiles-dpt33-2048.jpg`, `tiles-dpt20-1024.jpg`: the tile grids over the band
  before the exclusions.
