"""The model's raw output to L0: `lib/detector/src/decode.ts`."""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import TypedDict

import numpy as np

from detector.config import ModelConfig
from detector.overlap import Vertex, polygon_iou
from detector.tiles import InputLayout, Size, Tile, round_half_up

# Fields per slot in the end2end head's output: (cx, cy, w, h, score, class, angle).
STRIDE = 7


class Point(TypedDict):
    x: float
    y: float


# Functional form because `class` is a keyword.
Detection = TypedDict(
    "Detection",
    {
        "centre": Point,
        "length": float,
        "width": float,
        "angle": float,
        "class": str,
        "confidence": float,
    },
)
Detection.__doc__ = """One car, in the frame's pixels. `length` is the long axis, `width` the
short one as the model predicted it, and `angle` the long axis's orientation in radians from +x."""


def decode_detections(
    outputs: Sequence[tuple[Tile, np.ndarray]],
    layout: InputLayout,
    frame: Size,
    threshold: float,
    config: ModelConfig,
) -> list[Detection]:
    """Every tile's output as L0: thresholded, in the frame's pixels, one detection per car.

    Duplicates are removed across all tiles at once, class-agnostic and by
    descending confidence, and the result is in that order.

    Args:
        outputs: Each tile with the model's output for it, `[1, n, 7]` in tile pixels.
        layout: The frame's input layout.
        frame: The frame's own pixel count.
        threshold: A box must score strictly above this.
        config: The model's configuration.

    Raises:
        ValueError: If an output is not `[1, n, 7]`, or a kept slot names a class
            index outside `config.classes`.
    """
    kx = frame.width / layout.size.width
    ky = frame.height / layout.size.height
    detections = [
        detection
        for tile, output in outputs
        for detection in _decode_tile(tile, output, kx, ky, threshold, config.classes)
    ]
    return _suppress_duplicates(detections, config.nms_iou)


def _decode_tile(
    tile: Tile,
    output: np.ndarray,
    kx: float,
    ky: float,
    threshold: float,
    classes: Sequence[str],
) -> list[Detection]:
    if output.ndim != 3 or output.shape[0] != 1 or output.shape[2] != STRIDE:
        raise ValueError(f"expected the end2end head's [1, n, {STRIDE}] output, got {output.shape}")

    # float64 first: numpy would otherwise narrow the threshold to the output's
    # float32, and a score equal to it in float32 is above it in float64.
    slots = output[0].astype(np.float64)
    detections: list[Detection] = []
    for cx, cy, w, h, confidence, class_value, raw_angle in slots[slots[:, 4] > threshold].tolist():
        # The values that round to a position in the list. NaN and infinity fail here too.
        if not -0.5 <= class_value < len(classes) - 0.5:
            raise ValueError(
                f"a detection names class index {class_value}, but the model's JSON file lists "
                f"{len(classes)} class(es): {list(classes)}"
            )

        # The head does not promise the longer extent is `w`. Where it is not, the
        # same rectangle is named with the extents swapped and a quarter turn.
        upright = w >= h
        length, width = (w, h) if upright else (h, w)
        angle = raw_angle + (0 if upright else math.pi / 2)

        # The long axis is mapped by its endpoints, so centre, length and angle stay
        # consistent when the two axes scale differently.
        half = length / 2
        x0 = (cx - math.cos(angle) * half + tile.x) * kx
        y0 = (cy - math.sin(angle) * half + tile.y) * ky
        x1 = (cx + math.cos(angle) * half + tile.x) * kx
        y1 = (cy + math.sin(angle) * half + tile.y) * ky

        detections.append(
            {
                "centre": {"x": (x0 + x1) / 2, "y": (y0 + y1) / 2},
                "length": math.hypot(x1 - x0, y1 - y0),
                "width": math.hypot(-math.sin(angle) * width * kx, math.cos(angle) * width * ky),
                "angle": math.atan2(y1 - y0, x1 - x0),
                "class": classes[round_half_up(class_value)],
                "confidence": confidence,
            }
        )
    return detections


def _corners(detection: Detection) -> list[Vertex]:
    """The box's corners, wound around its perimeter."""
    ux, uy = math.cos(detection["angle"]), math.sin(detection["angle"])
    cx, cy = detection["centre"]["x"], detection["centre"]["y"]
    hx, hy = ux * detection["length"] / 2, uy * detection["length"] / 2
    nx, ny = -uy * detection["width"] / 2, ux * detection["width"] / 2
    return [
        (cx - hx + nx, cy - hy + ny),
        (cx + hx + nx, cy + hy + ny),
        (cx + hx - nx, cy + hy - ny),
        (cx - hx - nx, cy - hy - ny),
    ]


def _suppress_duplicates(detections: Sequence[Detection], nms_iou: float) -> list[Detection]:
    """Keep the best box, drop everything overlapping it above `nms_iou`, repeat."""
    ranked = sorted(
        ((detection, _corners(detection)) for detection in detections),
        key=lambda entry: -entry[0]["confidence"],
    )
    kept: list[tuple[Detection, list[Vertex]]] = []
    for detection, corners in ranked:
        if not any(polygon_iou(corners, other) > nms_iou for _, other in kept):
            kept.append((detection, corners))
    return [detection for detection, _ in kept]
