"""How a frame becomes the model's input: `lib/detector/src/tiles.ts`."""

from __future__ import annotations

import math
from typing import NamedTuple

from detector.config import ModelConfig


class Size(NamedTuple):
    width: int
    height: int


class Tile(NamedTuple):
    """One canvas-sized piece of a resampled frame, in that frame's pixels.

    `width` and `height` are the frame pixels the tile holds: the canvas, or less
    where the frame ends first.
    """

    x: int
    y: int
    width: int
    height: int


class InputLayout(NamedTuple):
    """`scale` takes the frame to `size`; `tiles` run row by row, left to right."""

    scale: float
    size: Size
    tiles: list[Tile]


def round_half_up(value: float) -> int:
    """JavaScript's `Math.round`. Python's `round` takes halves to even."""
    return math.floor(value + 0.5)


def tile_origins(length: int, overlap_px: float, canvas: int) -> list[int]:
    """The start of each tile along one axis of a frame `length` pixels long.

    The first tile starts at 0 and the last ends at `length`, with as few between
    them as keep each overlap at least `overlap_px`.
    """
    if length <= canvas:
        return [0]
    count = math.ceil((length - overlap_px) / (canvas - overlap_px))
    return [round_half_up(i * (length - canvas) / (count - 1)) for i in range(count)]


def input_layout(frame: Size, dpt: float, config: ModelConfig) -> InputLayout:
    """The scale to the target DPT, the resampled size and the tiles of a frame at `dpt`."""
    scale = config.dpt / dpt
    size = Size(round_half_up(frame.width * scale), round_half_up(frame.height * scale))
    overlap_px = config.tile_overlap_px()
    tiles = [
        Tile(x, y, min(config.canvas, size.width - x), min(config.canvas, size.height - y))
        for y in tile_origins(size.height, overlap_px, config.canvas)
        for x in tile_origins(size.width, overlap_px, config.canvas)
    ]
    return InputLayout(scale, size, tiles)
