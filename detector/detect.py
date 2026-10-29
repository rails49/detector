"""Run a trained detector on every image of an .r49 archive and draw what it finds.

For a new capture before it is labeled: no labels are read and nothing is
scored. Each image is tiled as `export:yolo` tiles it at native DPT, each tile
is predicted, and the boxes are moved into the frame and merged as in
`evaluate.py`. Each image is written to `OUT/<name>.jpg` with boxes at or above
`detector.confidence_threshold` in green and boxes down to 0.05 in orange,
each with its confidence.

`--dpt` is the archive's DPT, as the editor shows it after calibration.

Usage:
    uv run python detect.py runs/ceiling-l/weights/best.pt \\
        ~/rails49/data/ceiling-2026-10-29/ceiling-2026-10-29.r49 --dpt 32.55 \\
        --out ~/rails49/data/ceiling-2026-10-29/detections-ceiling-l
"""

from __future__ import annotations

import argparse
import json
import math
import zipfile
from collections.abc import Iterator
from pathlib import Path
from typing import cast

import cv2
import numpy as np
import torch
import yaml
from ultralytics import YOLO
from ultralytics.utils.ops import xywhr2xyxyxyxy

from evaluate import frame_detections

HERE = Path(__file__).parent
REPO = HERE.parent
R49_DATA = REPO / "node_modules" / "@rails49" / "r49" / "dist" / "data.json"

LOW = 0.05
# BGR.
SURE = (0, 200, 0)
UNSURE = (0, 165, 255)
# Ultralytics' letterbox fill, which the exported tiles are padded with.
PAD = 114


def tile_origins(length: int, overlap: float, canvas: int) -> list[int]:
    """Where tiles start along one side: `tileOrigins` in
    `lib/detector/src/tiles.ts`, which `export:yolo` uses."""
    if length <= canvas:
        return [0]
    count = math.ceil((length - overlap) / (canvas - overlap))
    # Math.round, not Python's round-half-to-even.
    return [math.floor(i * (length - canvas) / (count - 1) + 0.5) for i in range(count)]


def tiles(
    image: np.ndarray, overlap: float, canvas: int
) -> Iterator[tuple[np.ndarray, int, int]]:
    """Each tile of `image` as `(tile, x, y)`, padded right and bottom to the canvas."""
    height, width = image.shape[:2]
    for y in tile_origins(height, overlap, canvas):
        for x in tile_origins(width, overlap, canvas):
            tile = np.full((canvas, canvas, 3), PAD, np.uint8)
            piece = image[y : y + canvas, x : x + canvas]
            tile[: piece.shape[0], : piece.shape[1]] = piece
            yield tile, x, y


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "weights", type=Path, help="A trained .pt, e.g. runs/<name>/weights/best.pt"
    )
    parser.add_argument("archive", type=Path, help="The .r49 archive.")
    parser.add_argument("--dpt", type=float, required=True, help="The archive's DPT.")
    parser.add_argument("--out", type=Path, required=True, help="Output directory.")
    parser.add_argument("--device", default="mps", help="cpu, mps, or a CUDA index.")
    args = parser.parse_args()

    config = yaml.safe_load((REPO / "config.yaml").read_text())["detector"]
    gauge = json.loads(R49_DATA.read_text())["standard_gauge"]
    canvas = config["canvas"]
    overlap = args.dpt * config["tile_overlap_mm"] / gauge
    threshold = config["confidence_threshold"]
    model = YOLO(args.weights)
    args.out.mkdir(parents=True, exist_ok=True)

    archive = zipfile.ZipFile(args.archive)
    manifest = json.loads(archive.read("manifest.json"))
    for entry in manifest["images"]:
        data = np.frombuffer(archive.read(entry["filename"]), np.uint8)
        image = cv2.imdecode(data, cv2.IMREAD_COLOR)
        xywhr, conf = frame_detections(
            model,
            tiles(image, overlap, canvas),
            canvas,
            args.device,
            config["nms_iou"],
        )
        keep = conf >= LOW
        corners = cast(torch.Tensor, xywhr2xyxyxyxy(xywhr[keep]))
        scores = conf[keep].tolist()
        for box, score in zip(corners.round().int().numpy(), scores):
            color = SURE if score >= threshold else UNSURE
            cv2.polylines(image, [box], True, color, 4)
            x, y = box.min(axis=0)
            cv2.putText(
                image,
                f"{score:.2f}",
                (int(x), int(y) - 8),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.5,
                color,
                3,
            )
        stem = Path(entry["filename"]).stem
        cv2.imwrite(
            str(args.out / f"{stem}.jpg"), image, [cv2.IMWRITE_JPEG_QUALITY, 90]
        )
        sure = sum(s >= threshold for s in scores)
        print(f"{stem}: {sure} at or above {threshold}, {len(scores) - sure} below")


if __name__ == "__main__":
    main()
