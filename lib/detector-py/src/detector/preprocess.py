"""One tile as the network's input: `tileInput` in `lib/detector/src/preprocess.ts`."""

from __future__ import annotations

import numpy as np

from detector.tiles import Tile

# Ultralytics' letterbox fill, which `export:yolo` pads every training tile with.
PAD_LEVEL = 114


def tile_input(resampled: np.ndarray, tile: Tile, canvas: int) -> np.ndarray:
    """A tile of the resampled frame as `[1, 3, canvas, canvas]` float32, scaled to 0…1.

    The tile's pixels sit in the top-left corner, and the rest of the canvas is
    padding on the right and bottom.
    """
    tensor = np.full((1, 3, canvas, canvas), PAD_LEVEL / 255, np.float32)
    piece = resampled[tile.y : tile.y + tile.height, tile.x : tile.x + tile.width]
    tensor[0, :, : tile.height, : tile.width] = piece.transpose(2, 0, 1).astype(np.float32) / 255
    return tensor
