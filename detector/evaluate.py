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

With `--draw DIR`, each held-out frame is written to `DIR/<stem>.jpg` with its
detections at `detector.confidence_threshold`: boxes that contain a car's
midpoint in green, phantoms in red, each with its confidence. A found car's
midpoint is a yellow dot; a missed car's span and midpoint are magenta.

`--fp16` runs the model in FP16. An INT8 model is scored from the ONNX file
`export_onnx.py --canvas` writes, on the CPU.

Usage:
    uv run python evaluate.py runs/ceiling-l/weights/best.pt
    uv run python evaluate.py runs/ceiling-l/weights/best.pt --draw runs/ceiling-l/held-out
    uv run python evaluate.py runs/ceiling-l/weights/best.pt --fp16
    uv run python evaluate.py runs/ceiling-l/int8/detector_int8.onnx --device cpu
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Iterable
from pathlib import Path
from typing import cast

import cv2
import numpy as np
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

# BGR.
FOUND = (0, 200, 0)
PHANTOM = (0, 0, 255)
MISSED = (255, 0, 255)
MIDPOINT = (0, 255, 255)


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


def matches(
    corners: torch.Tensor, midpoints: torch.Tensor
) -> tuple[torch.Tensor, torch.Tensor]:
    """`(phantom, missed)` masks: per box, whether it contains no midpoint; per
    car, whether no box contains its midpoint."""
    inside = contains(corners, midpoints)
    return ~inside.any(dim=1), ~inside.any(dim=0)


def count(corners: torch.Tensor, midpoints: torch.Tensor) -> tuple[int, int]:
    """`(misses, phantoms)` for one frame's detections against its cars."""
    phantom, missed = matches(corners, midpoints)
    return int(missed.sum()), int(phantom.sum())


def car_midpoints(cars: list[dict]) -> torch.Tensor:
    """The midpoint of each car's span, as `(cars, 2)`."""
    return torch.tensor(
        [
            [(c["p0"]["x"] + c["p1"]["x"]) / 2, (c["p0"]["y"] + c["p1"]["y"]) / 2]
            for c in cars
        ]
    ).reshape(-1, 2)


def frame_image(frame: dict, images: Path, canvas: int) -> np.ndarray:
    """A held-out frame put back together from its tiles, without the padding."""
    image = np.zeros((frame["height"], frame["width"], 3), np.uint8)
    for tile in frame["tiles"]:
        x, y = tile["x"], tile["y"]
        w, h = min(canvas, frame["width"] - x), min(canvas, frame["height"] - y)
        image[y : y + h, x : x + w] = cv2.imread(str(images / f"{tile['stem']}.jpg"))[
            :h, :w
        ]
    return image


def draw_box(image: np.ndarray, box: np.ndarray, score: float, color) -> None:
    """Draw one box, as integer corners, and its confidence onto `image`."""
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


def draw(
    image: np.ndarray,
    corners: torch.Tensor,
    conf: torch.Tensor,
    cars: list[dict],
) -> None:
    """Draw one frame's detections and cars onto `image`."""
    centres = car_midpoints(cars)
    phantom, missed = matches(corners, centres)
    for box, score, is_phantom in zip(
        corners.round().int().numpy(), conf.tolist(), phantom.tolist()
    ):
        draw_box(image, box, score, PHANTOM if is_phantom else FOUND)
    for car, centre, is_missed in zip(
        cars, centres.round().int().tolist(), missed.tolist()
    ):
        if is_missed:
            p0, p1 = ((round(car[p]["x"]), round(car[p]["y"])) for p in ("p0", "p1"))
            cv2.line(image, p0, p1, MISSED, 6)
        cv2.circle(image, tuple(centre), 10, MISSED if is_missed else MIDPOINT, -1)


def frame_detections(
    model: YOLO,
    tiles: Iterable[tuple[Path | np.ndarray, int, int]],
    canvas: int,
    device: str,
    nms_iou: float,
    fp16: bool = False,
):
    """A frame's detections in frame pixels, as `(xywhr, conf)`, from its tiles
    given as `(image, x, y)`: a file or a BGR array, and the tile's offset."""
    boxes, scores = [], []
    for source, x, y in tiles:
        [result] = cast(
            list[Results],
            model.predict(
                source,
                imgsz=canvas,
                conf=PREDICT_CONF,
                device=device,
                quantize="fp16" if fp16 else None,
                verbose=False,
            ),
        )
        obb = cast(OBB, result.obb)
        xywhr = cast(torch.Tensor, obb.xywhr).cpu().clone()
        xywhr[:, 0] += x
        xywhr[:, 1] += y
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
        "weights",
        type=Path,
        help="A trained .pt, e.g. runs/<name>/weights/best.pt, or an INT8 .onnx.",
    )
    parser.add_argument(
        "--data",
        type=Path,
        default=REPO / "dataset" / "yolo",
        help="The dataset root export:yolo wrote.",
    )
    parser.add_argument("--device", default="mps", help="cpu, mps, or a CUDA index.")
    parser.add_argument("--fp16", action="store_true", help="Run the model in FP16.")
    parser.add_argument(
        "--draw",
        type=Path,
        help="Write each held-out frame, annotated, to this directory.",
    )
    args = parser.parse_args()

    config = yaml.safe_load((REPO / "config.yaml").read_text())["detector"]
    threshold, nms_iou = config["confidence_threshold"], config["nms_iou"]
    held_out = json.loads((args.data / "test" / "tiles.json").read_text())
    canvas = held_out["canvas"]
    model = YOLO(args.weights, task="obb")

    images = args.data / "images" / "test"
    if args.draw:
        args.draw.mkdir(parents=True, exist_ok=True)
    frames = []
    for frame in held_out["frames"]:
        tiles = ((images / f"{t['stem']}.jpg", t["x"], t["y"]) for t in frame["tiles"])
        xywhr, conf = frame_detections(
            model, tiles, canvas, args.device, nms_iou, args.fp16
        )
        corners = cast(torch.Tensor, xywhr2xyxyxyxy(xywhr))
        frames.append((frame["stem"], corners, conf, car_midpoints(frame["cars"])))
        if args.draw:
            image = frame_image(frame, images, canvas)
            keep = conf >= threshold
            draw(image, corners[keep], conf[keep], frame["cars"])
            cv2.imwrite(
                str(args.draw / f"{frame['stem']}.jpg"),
                image,
                [cv2.IMWRITE_JPEG_QUALITY, 90],
            )

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
        quantize="fp16" if args.fp16 else None,
        plots=False,
    )
    print(f"\nmAP50 on the held-out tiles: {metrics.box.map50:.4f}")


if __name__ == "__main__":
    main()
