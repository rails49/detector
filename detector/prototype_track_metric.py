"""PROTOTYPE, throwaway: occupancy over track sections, scored on the held-out frames.

Question: how do false clear and false occupied change with the length L of
the track section a sensor reports on, and with the confidence threshold?

Track is approximated from the cars: every labelled span in every image of the
archive is sampled every 1 mm, and samples closer than LINK_MM are joined, so
distance along the graph is distance along the track. Track that never carried
a car is missing.

For each held-out frame, a track point is covered by a car when it lies inside
the car's box (span, car width), and covered by a detection when it lies
inside the detection's box with its width replaced by the car width (the L1
rule). The section of length L centred on a track point is occupied when any
covered point lies within L/2 along the track. A section a car only reaches
within MARGIN_MM of its labelled ends counts as neither error, so click error
in the labels is not scored as model error.

Usage, from detector/:
    uv run python prototype_track_metric.py runs/ceiling-l/weights/best.pt runs/ceiling-x/weights/best.pt
"""

import heapq
import json
import sys
import zipfile
from pathlib import Path

import cv2
import numpy as np
import torch
import yaml
from ultralytics import YOLO
from ultralytics.utils.ops import xywhr2xyxyxyxy

from evaluate import contains, frame_detections, frame_image

ARCHIVE = Path.home() / "rails49/data/ceiling-2026-10-28/ceiling-2026-10-28.r49"
DATA = Path("../dataset/yolo")
GAUGE_MM = 9.0  # N
STEP_MM = 1.0
LINK_MM = 2.5
MARGIN_MM = 2.0
SECTIONS_MM = [0, 5, 10, 20, 30, 50, 100, 200]
THRESHOLDS = [0.01, 0.05, 0.1, 0.25, 0.5]
OUT = Path("runs/prototype-track")

config = yaml.safe_load(Path("../config.yaml").read_text())
standard_width = config["layout"]["standard_width"]
nms_iou = config["detector"]["nms_iou"]
held_out = json.loads((DATA / "test/tiles.json").read_text())
canvas = held_out["canvas"]
dpt = held_out["frames"][0]["dpt"]
px_mm = dpt / GAUGE_MM
car_width = dpt * standard_width / 1435


def span_box(car) -> np.ndarray:
    p0 = np.array([car["p0"]["x"], car["p0"]["y"]], float)
    p1 = np.array([car["p1"]["x"], car["p1"]["y"]], float)
    d = (p1 - p0) / np.linalg.norm(p1 - p0)
    n = np.array([-d[1], d[0]]) * car_width / 2
    return np.array([p0 + n, p1 + n, p1 - n, p0 - n])


# Track points from every span in the archive.
manifest = json.loads(zipfile.ZipFile(ARCHIVE).read("manifest.json"))
samples = []
for image in manifest["images"]:
    for label in image["labels"]:
        p0 = np.array([label["p0"]["x"], label["p0"]["y"]], float)
        p1 = np.array([label["p1"]["x"], label["p1"]["y"]], float)
        n = max(2, int(np.linalg.norm(p1 - p0) / (STEP_MM * px_mm)) + 1)
        samples.append(p0 + np.linspace(0, 1, n)[:, None] * (p1 - p0))
samples = np.concatenate(samples)
_, first = np.unique(np.round(samples / (STEP_MM * px_mm)), axis=0, return_index=True)
points = samples[np.sort(first)]

# Join points closer than LINK_MM.
link = LINK_MM * px_mm
cells: dict[tuple[int, int], list[int]] = {}
for i, (x, y) in enumerate(points):
    cells.setdefault((int(x // link), int(y // link)), []).append(i)
edges: list[list[tuple[int, float]]] = [[] for _ in points]
for (cx, cy), members in cells.items():
    near = [j for dx in (-1, 0, 1) for dy in (-1, 0, 1) for j in cells.get((cx + dx, cy + dy), [])]
    for i in members:
        d = np.linalg.norm(points[near] - points[i], axis=1)
        edges[i] = [(j, float(dj) / px_mm) for j, dj in zip(near, d) if j != i and dj <= link]


def distance_from(sources: np.ndarray) -> np.ndarray:
    """Distance along the track, in mm, from each point to the nearest source."""
    dist = np.full(len(points), np.inf)
    heap = [(0.0, int(i)) for i in np.flatnonzero(sources)]
    for _, i in heap:
        dist[i] = 0.0
    heapq.heapify(heap)
    while heap:
        d, i = heapq.heappop(heap)
        if d > dist[i]:
            continue
        for j, w in edges[i]:
            if d + w < dist[j]:
                dist[j] = d + w
                heapq.heappush(heap, (d + w, j))
    return dist


def covered(boxes: np.ndarray) -> np.ndarray:
    if len(boxes) == 0:
        return np.zeros(len(points), bool)
    inside = contains(torch.tensor(boxes, dtype=torch.float32), torch.tensor(points, dtype=torch.float32))
    return inside.any(dim=0).numpy()


def l1_boxes(xywhr: torch.Tensor) -> np.ndarray:
    """Detection boxes with the width replaced by the car width."""
    b = xywhr.clone()
    w_short = b[:, 2] < b[:, 3]
    b[w_short, 2] = car_width
    b[~w_short, 3] = car_width
    return xywhr2xyxyxyxy(b).numpy()


def connected_components() -> int:
    seen = np.zeros(len(points), bool)
    count = 0
    for s in range(len(points)):
        if seen[s]:
            continue
        count += 1
        stack = [s]
        seen[s] = True
        while stack:
            i = stack.pop()
            for j, _ in edges[i]:
                if not seen[j]:
                    seen[j] = True
                    stack.append(j)
    return count


print(f"DPT {dpt:.1f}, {px_mm:.2f} px/mm, car width {car_width:.0f} px")
print(f"track approximation: {len(points)} points (~{len(points) * STEP_MM / 1000:.1f} m), {connected_components()} pieces")

OUT.mkdir(parents=True, exist_ok=True)
truths = []
car_of = []
for frame in held_out["frames"]:
    cover = covered(np.array([span_box(c) for c in frame["cars"]]))
    inner = distance_from(~cover) > MARGIN_MM  # covered, and not within MARGIN of a car end
    outer = distance_from(cover) <= MARGIN_MM
    truths.append((distance_from(cover & inner), distance_from(outer)))
    car_of.append(
        [covered(np.array([span_box(c)])) & cover & inner for c in frame["cars"]]
    )
    image = frame_image(frame, DATA / "images/test", canvas)
    for (x, y), c in zip(points.astype(int), cover):
        cv2.circle(image, (x, y), 3, (0, 0, 255) if c else (255, 160, 0), -1)
    cv2.imwrite(str(OUT / f"{frame['stem']}.jpg"), image, [cv2.IMWRITE_JPEG_QUALITY, 85])
print(f"track drawn on each held-out frame in {OUT}/: red under a car, blue clear\n")

for weights in sys.argv[1:]:
    model = YOLO(weights)
    detections = [frame_detections(model, f, DATA / "images/test", canvas, "mps", nms_iou) for f in held_out["frames"]]
    print(f"{weights}: false clear % / false occupied %, over held-out track positions")
    print("section mm  " + "".join(f"{f'conf {t}':>16}" for t in THRESHOLDS))
    for section in SECTIONS_MM:
        h = section / 2
        row = f"{section:10d}  "
        for t in THRESHOLDS:
            fc = fo = occ = clr = 0
            for (d_inner, d_outer), (xywhr, conf) in zip(truths, detections):
                d_pred = distance_from(covered(l1_boxes(xywhr[conf >= t])))
                sure_occ = d_inner <= h
                sure_clr = d_outer > h
                pred = d_pred <= h
                fc += int((sure_occ & ~pred).sum())
                fo += int((sure_clr & pred).sum())
                occ += int(sure_occ.sum())
                clr += int(sure_clr.sum())
            row += f"{100 * fc / occ:7.2f} / {100 * fo / clr:5.2f} "
        print(row)
    # At L = 0: false clear inside a car no detection touches, against the rest.
    for t in THRESHOLDS:
        whole = part = 0
        for cars, (xywhr, conf) in zip(car_of, detections):
            pred = covered(l1_boxes(xywhr[conf >= t]))
            for under in cars:
                lost = int((under & ~pred).sum())
                if (under & pred).any():
                    part += lost
                else:
                    whole += lost
        print(f"conf {t}: false clear at L=0 in wholly missed cars {whole}, at the ends of found cars {part}")
    print()
