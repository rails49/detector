"""Area the detector must see on the 2x1 m N layout, approximated from labelled cars.

Each archive's four calibration points give a homography from pixels to layout mm
(z ignored, good to about 3% per the archive README). Every labelled span of both
archives is drawn in layout mm as a band around its centre line, at three band
widths. The band area is reported in m^2 and as a fraction of the layout, and the
2048 / 1024 / 640 canvas tiles that touch it are counted at DPT 20 and 33.

Usage, from detector/:  uv run python <this file> <out dir>
"""

import json
import math
import sys
import zipfile
from pathlib import Path

import cv2
import numpy as np

DATA = Path.home() / "rails49/data"
ARCHIVES = ["ceiling-2026-10-28", "ceiling-2026-10-29"]
BACKGROUND = ("ceiling-2026-10-29", "IMG_2878.jpg")
W_MM, H_MM = 2000, 1000
GAUGE_MM = 9.0
CAR_MM = GAUGE_MM * 3000.0 / 1435  # car width, 18.8 mm
OVERLAP_PROTO_MM = 30000.0
S = 2  # raster px per layout mm
BANDS = {"car only (1 car width)": 1, "centre line ± 1 car width": 2, "car ± 1 car width": 3}
CANVASES = [2048, 1024, 640]
DPTS = [20, 33]
OUT = Path(sys.argv[1])


def homography(manifest) -> np.ndarray:
    pts = manifest["layout"]["calibration"]["points"]
    src = np.float32([[p["px"]["x"], p["px"]["y"]] for p in pts])
    dst = np.float32([[p["world"]["x"], p["world"]["y"]] for p in pts])
    return cv2.getPerspectiveTransform(src, dst)


def to_raster(xy_mm: np.ndarray) -> np.ndarray:
    """Layout mm (y up) to raster px (row down)."""
    return np.stack([xy_mm[:, 0] * S, (H_MM - xy_mm[:, 1]) * S], axis=1)


def native_dpt(h: np.ndarray, manifest) -> float:
    """Pixels per gauge at the layout centre."""
    inv = np.linalg.inv(h)
    c = np.float32([[[1000, 500], [1001, 500], [1000, 501]]])
    p = cv2.perspectiveTransform(c, inv)[0]
    return GAUGE_MM * math.sqrt(abs((p[1] - p[0])[0] * (p[2] - p[0])[1] - (p[1] - p[0])[1] * (p[2] - p[0])[0]))


spans = []  # (archive, image, p0 mm, p1 mm)
for name in ARCHIVES:
    z = zipfile.ZipFile(DATA / name / f"{name}.r49")
    manifest = json.loads(z.read("manifest.json"))
    h = homography(manifest)
    print(f"{name}: native DPT {native_dpt(h, manifest):.1f}, "
          f"{sum(len(i['labels']) for i in manifest['images'])} cars")
    for image in manifest["images"]:
        for label in image["labels"]:
            px = np.float32([[[label["p0"]["x"], label["p0"]["y"]], [label["p1"]["x"], label["p1"]["y"]]]])
            mm = cv2.perspectiveTransform(px, h)[0]
            spans.append((name, image["filename"], mm[0], mm[1]))

lengths = np.array([np.linalg.norm(b - a) for _, _, a, b in spans])
print(f"{len(spans)} spans, length median {np.median(lengths):.0f} mm, max {lengths.max():.0f} mm")


def band(widths: float) -> np.ndarray:
    mask = np.zeros((H_MM * S, W_MM * S), np.uint8)
    t = max(1, round(widths * CAR_MM * S))
    for _, _, a, b in spans:
        p = to_raster(np.array([a, b])).round().astype(int)
        cv2.line(mask, tuple(p[0]), tuple(p[1]), 1, t, cv2.LINE_8)
    return mask


def tiles(dpt: float, canvas: int) -> list[tuple[float, float, float]] | None:
    """Tiles of the full-layout grid as (left mm, top mm, side mm), or None if the overlap fills the canvas."""
    px_mm = dpt / GAUGE_MM
    overlap = dpt * OVERLAP_PROTO_MM / 1435
    if overlap >= canvas:
        return None

    def starts(d):
        if d <= canvas:
            return [0.0]
        n = math.ceil((d - overlap) / (canvas - overlap))
        return [min(i * (canvas - overlap), d - canvas) for i in range(n)]

    return [(x0 / px_mm, y0 / px_mm, canvas / px_mm)
            for y0 in starts(H_MM * px_mm) for x0 in starts(W_MM * px_mm)]


def tiles_touching(mask: np.ndarray, dpt: float, canvas: int) -> tuple[int, int] | None:
    """Tiles of the full-layout grid that touch the band, and the grid's total."""
    grid = tiles(dpt, canvas)
    if grid is None:
        return None
    touched = sum(bool(mask[int(y * S):math.ceil((y + d) * S), int(x * S):math.ceil((x + d) * S)].any())
                  for x, y, d in grid)
    return touched, len(grid)


OUT.mkdir(parents=True, exist_ok=True)
layout_m2 = W_MM * H_MM / 1e6
rows = []
masks = {}
for label, k in BANDS.items():
    mask = band(k)
    masks[k] = mask
    m2 = mask.sum() / S**2 / 1e6
    row = [label, f"{k * CAR_MM:.0f}", f"{m2:.3f}", f"{100 * m2 / layout_m2:.0f}%"]
    for dpt in DPTS:
        band_px = m2 * 1e6 * (dpt / GAUGE_MM) ** 2
        for canvas in CANVASES:
            r = tiles_touching(mask, dpt, canvas)
            if r is None:
                row.append("n/a")
            else:
                t, total = r
                row.append(f"{t}/{total} ({t * canvas**2 / band_px:.1f}×)")
    rows.append(row)

head = ["band", "width mm", "m²", "of layout"] + [f"DPT {d} @{c}" for d in DPTS for c in CANVASES]
lines = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
lines += ["| " + " | ".join(r) + " |" for r in rows]
table = "\n".join(lines)
print(table)
(OUT / "table.md").write_text(table + "\n")

# Top-down view of one photo with the band and the detector's tiles.
name, filename = BACKGROUND
z = zipfile.ZipFile(DATA / name / f"{name}.r49")
manifest = json.loads(z.read("manifest.json"))
img = cv2.imdecode(np.frombuffer(z.read(filename), np.uint8), cv2.IMREAD_COLOR)
flip = np.array([[S, 0, 0], [0, -S, H_MM * S], [0, 0, 1]], float)
top = cv2.warpPerspective(img, flip @ homography(manifest), (W_MM * S, H_MM * S))
view = top.copy()
overlay = top.copy()
overlay[masks[3] > 0] = (0, 0, 255)
overlay[masks[1] > 0] = (0, 200, 255)
view = cv2.addWeighted(overlay, 0.45, top, 0.55, 0)
COLOURS = [(255, 80, 0), (0, 220, 0), (255, 0, 255), (0, 255, 255), (255, 255, 255)]
for dpt, canvas in [(20, 2048), (33, 2048), (20, 1024)]:
    tiled = view.copy()
    grid = tiles(dpt, canvas)
    for n, (x, y, d) in enumerate(grid):
        colour = COLOURS[n % len(COLOURS)]
        inset = 4 + 10 * (n % 2)
        p0 = (round(x * S) + inset, round(y * S) + inset)
        p1 = (min(round((x + d) * S), W_MM * S) - inset, min(round((y + d) * S), H_MM * S) - inset)
        cv2.rectangle(tiled, p0, p1, colour, 6)
        cv2.putText(tiled, f"T{n + 1}", (p0[0] + 20, p0[1] + 70),
                    cv2.FONT_HERSHEY_SIMPLEX, 2.2, colour, 5, cv2.LINE_AA)
    side = grid[0][2]
    cv2.putText(tiled, f"DPT {dpt}, canvas {canvas} px = {side:.0f} mm, overlap 188 mm, {len(grid)} tiles",
                (40, H_MM * S - 40), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (255, 255, 255), 5, cv2.LINE_AA)
    out = OUT / f"tiles-dpt{dpt}-{canvas}.jpg"
    cv2.imwrite(str(out), tiled, [cv2.IMWRITE_JPEG_QUALITY, 85])
    cv2.imwrite(str(out.with_suffix(".small.jpg")), cv2.resize(tiled, (W_MM, H_MM)))
    print(f"drawn in {out}")
np.save(OUT / "band3.npy", masks[3])

# The user's exclusions, as (first row, last row, first column, last column) of the 100 mm grid.
ROWS = "ABCDEFGHIJ"
EXCLUDED = [("A", "E", 0, 3), ("A", "B", 4, 15), ("F", "J", 0, 0)]
# Track no car stood on, traced by hand on the top-down view: layout mm, x right, y down from the far edge.
TRACED = [
    [(1330, 775), (1400, 803), (1500, 838)],  # diagonal H13-I14
    [(1350, 815), (1475, 835)],  # second track I13-I14
    [(1935, 640), (1930, 690), (1920, 750), (1875, 815), (1800, 875), (1700, 920), (1600, 950), (1450, 960),
     (1260, 950)],  # outer curve G19-J12
    [(1875, 205), (1900, 290), (1907, 380), (1905, 455)],  # inner curve C18-E19
    [(1745, 608), (1795, 585)],  # turnout G17
    [(1595, 57), (1660, 55)],  # spur A16
    [(1045, 175), (1100, 215)],  # C10-C11
    [(1075, 575), (1100, 610)],  # track end G11
    [(1020, 768), (1050, 778)],  # track end H10
    [(50, 525), (75, 600), (110, 680), (145, 750)],  # left tail G0-H1
    [(95, 930), (190, 930)],  # yard track end J1
    [(95, 893), (120, 893)],  # yard track end J1
]
traced = np.zeros((H_MM * S, W_MM * S), np.uint8)
for line in TRACED:
    cv2.polylines(traced, [np.int32(np.array(line) * S)], False, 1, round(2 * CAR_MM * S))
keep = np.ones((H_MM * S, W_MM * S), bool)
for r0, r1, c0, c1 in EXCLUDED:
    keep[ROWS.index(r0) * 100 * S:(ROWS.index(r1) + 1) * 100 * S, c0 * 100 * S:(c1 + 1) * 100 * S] = False
kept = ((masks[2] > 0) | (traced > 0)) & keep
cells = sum(bool(kept[j * 100 * S:(j + 1) * 100 * S, i * 100 * S:(i + 1) * 100 * S].any())
            for i in range(W_MM // 100) for j in range(H_MM // 100))
print(f"100 mm cells with track outside the exclusions: {cells} of 200, {cells / 100:.2f} m²")
m2 = kept.sum() / S**2 / 1e6
print(f"38 mm band outside the exclusions: {m2:.3f} m², {100 * m2 / layout_m2:.0f}% of the layout")
for dpt in DPTS:
    for canvas in CANVASES:
        r = tiles_touching(kept, dpt, canvas)
        if r:
            print(f"  DPT {dpt} @{canvas}: {r[0]}/{r[1]} tiles, {r[0] * canvas**2 / (m2 * 1e6 * (dpt / GAUGE_MM) ** 2):.1f}×")

marked = top.copy()
added = (traced > 0) & (masks[2] == 0) & keep
marked[kept & ~added] = (0.5 * marked[kept & ~added] + 0.5 * np.array([0, 220, 255])).astype(np.uint8)
marked[added] = (0.4 * marked[added] + 0.6 * np.array([255, 0, 255])).astype(np.uint8)
dropped = ((masks[2] > 0) | (traced > 0)) & ~keep
marked[dropped] = (0.5 * marked[dropped] + 0.5 * np.array([160, 160, 160])).astype(np.uint8)
marked[~keep] = (0.45 * marked[~keep] + 0.55 * np.array([120, 40, 0])).astype(np.uint8)
for x in range(0, W_MM + 1, 100):
    cv2.line(marked, (x * S, 0), (x * S, H_MM * S), (255, 255, 255), 1)
for y in range(0, H_MM + 1, 100):
    cv2.line(marked, (0, y * S), (W_MM * S, y * S), (255, 255, 255), 1)
for i in range(W_MM // 100):
    for j in range(H_MM // 100):
        cv2.putText(marked, f"{ROWS[j]}{i}", (i * 100 * S + 6, j * 100 * S + 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
for r0, r1, c0, c1 in EXCLUDED:
    cv2.rectangle(marked, (c0 * 100 * S, ROWS.index(r0) * 100 * S),
                  ((c1 + 1) * 100 * S, (ROWS.index(r1) + 1) * 100 * S), (255, 120, 0), 8)
cv2.imwrite(str(OUT / "marked.jpg"), marked, [cv2.IMWRITE_JPEG_QUALITY, 85])
cv2.imwrite(str(OUT / "marked.small.jpg"), cv2.resize(marked, (W_MM, H_MM)))
print(f"drawn in {OUT / 'marked.jpg'}")
