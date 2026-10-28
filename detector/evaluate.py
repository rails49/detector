"""Measure a trained detector on the held-out images.

Runs the model on every held-out tile `export:yolo` wrote, moves each tile's
detections into its frame by the offset `test/tiles.json` records, drops
duplicates, and counts misses and phantoms against the frame's cars:

* a car is found when some detection's box contains the midpoint of its span;
* a phantom is a detection whose box contains no car's midpoint.

Both are reported at `detector.confidence_threshold`, then misses and phantoms
across thresholds, then Ultralytics' mAP50 on the held-out tiles.

Duplicates are dropped with Ultralytics' rotated NMS (probabilistic IoU) at
`detector.nms_iou`, not with the runtime's polygon IoU.

Usage:
    uv run python evaluate.py runs/ceiling-l/weights/best.pt
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import cast

import torch
import yaml
from ultralytics import YOLO
from ultralytics.engine.results import OBB, Results
from ultralytics.utils.metrics import batch_probiou
from ultralytics.utils.nms import TorchNMS
from ultralytics.utils.ops import xywhr2xyxyxyxy

HERE = Path(__file__).parent
REPO = HERE.parent

# Low enough that every threshold reported below sees its detections.
PREDICT_CONF = 0.01
THRESHOLDS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]


def contains(corners: torch.Tensor, points: torch.Tensor) -> torch.Tensor:
    """Which boxes contain which points, as a `(boxes, points)` bool tensor.

    `corners` is `(N, 4, 2)`, each box wound around its perimeter in either
    direction; `points` is `(M, 2)`. A point on an edge counts as inside.
    """
    edges = corners.roll(-1, dims=1) - corners  # (N, 4, 2)
    to_point = points[None, None, :, :] - corners[:, :, None, :]  # (N, 4, M, 2)
    cross = (
        edges[:, :, None, 0] * to_point[..., 1]
        - edges[:, :, None, 1] * to_point[..., 0]
    )
    return (cross >= 0).all(dim=1) | (cross <= 0).all(dim=1)


def count(corners: torch.Tensor, midpoints: torch.Tensor) -> tuple[int, int]:
    """`(misses, phantoms)` for one frame's detections against its cars."""
    inside = contains(corners, midpoints)
    misses = int((~inside.any(dim=0)).sum())
    phantoms = int((~inside.any(dim=1)).sum())
    return misses, phantoms


def frame_detections(
    model: YOLO, frame: dict, images: Path, canvas: int, device: str, nms_iou: float
):
    """A held-out frame's detections in frame pixels, as `(xywhr, conf)`."""
    boxes, scores = [], []
    for tile in frame["tiles"]:
        [result] = cast(
            list[Results],
            model.predict(
                images / f"{tile['stem']}.jpg",
                imgsz=canvas,
                conf=PREDICT_CONF,
                device=device,
                verbose=False,
            ),
        )
        obb = cast(OBB, result.obb)
        xywhr = cast(torch.Tensor, obb.xywhr).cpu().clone()
        xywhr[:, 0] += tile["x"]
        xywhr[:, 1] += tile["y"]
        boxes.append(xywhr)
        scores.append(cast(torch.Tensor, obb.conf).cpu())
    xywhr, conf = torch.cat(boxes), torch.cat(scores)
    keep = TorchNMS.fast_nms(xywhr, conf, nms_iou, iou_func=batch_probiou)
    return xywhr[keep], conf[keep]


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "weights", type=Path, help="A trained .pt, e.g. runs/<name>/weights/best.pt"
    )
    parser.add_argument(
        "--data",
        type=Path,
        default=REPO / "dataset" / "yolo",
        help="The dataset root export:yolo wrote.",
    )
    parser.add_argument("--device", default="mps", help="cpu, mps, or a CUDA index.")
    args = parser.parse_args()

    config = yaml.safe_load((REPO / "config.yaml").read_text())["detector"]
    threshold, nms_iou = config["confidence_threshold"], config["nms_iou"]
    held_out = json.loads((args.data / "test" / "tiles.json").read_text())
    canvas = held_out["canvas"]
    model = YOLO(args.weights)

    frames = []
    for frame in held_out["frames"]:
        xywhr, conf = frame_detections(
            model, frame, args.data / "images" / "test", canvas, args.device, nms_iou
        )
        midpoints = torch.tensor(
            [
                [(c["p0"]["x"] + c["p1"]["x"]) / 2, (c["p0"]["y"] + c["p1"]["y"]) / 2]
                for c in frame["cars"]
            ]
        ).reshape(-1, 2)
        frames.append((frame["stem"], xywhr2xyxyxyxy(xywhr), conf, midpoints))

    cars = sum(len(m) for *_, m in frames)
    print(f"{len(frames)} held-out frames, {cars} cars\n")

    print(f"At confidence {threshold}:")
    for stem, corners, conf, midpoints in frames:
        misses, phantoms = count(corners[conf >= threshold], midpoints)
        print(f"  {stem}: {len(midpoints)} cars, {misses} missed, {phantoms} phantoms")

    print("\nconfidence  missed  phantoms")
    for t in THRESHOLDS:
        totals = [
            count(corners[conf >= t], midpoints)
            for _, corners, conf, midpoints in frames
        ]
        misses, phantoms = sum(m for m, _ in totals), sum(p for _, p in totals)
        print(f"{t:10.2f}  {misses:6d}  {phantoms:8d}")

    metrics = model.val(
        data=str(args.data / "data.yaml"),
        split="test",
        imgsz=canvas,
        batch=2,
        device=args.device,
        plots=False,
    )
    print(f"\nmAP50 on the held-out tiles: {metrics.box.map50:.4f}")


if __name__ == "__main__":
    main()
