"""The resample to the target DPT, through the library sharp is built on."""

from __future__ import annotations

import numpy as np
import pyvips

from detector.tiles import Size


def resample(frame: np.ndarray, size: Size) -> np.ndarray:
    """Resample an RGB frame to `size`, as `sharp(raw).resize(width, height)` does.

    Both axes scale by the smaller ratio, through `vips_resize` with Lanczos3 and
    gap 2, and the overhang is cropped from the centre. Reducing, this is within
    2 per channel of sharp, which writes the training tiles
    (`conformance/resample.json`). Enlarging goes through the same call; training
    never enlarges, so nothing compares it with sharp or with `resample.ts`.

    Args:
        frame: height × width × 3, 8 bits.
        size: The target size.

    Returns:
        `size.height` × `size.width` × 3, 8 bits.

    Raises:
        ValueError: If `size` is empty.
    """
    if size.width < 1 or size.height < 1:
        raise ValueError(f"resample needs a non-empty target size; got {size.width}×{size.height}")

    height, width = frame.shape[:2]
    shrink = min(width / size.width, height / size.height)
    pixels = np.ascontiguousarray(frame)
    image = pyvips.Image.new_from_memory(pixels.data, width, height, 3, "uchar")
    if shrink != 1:
        image = image.resize(1 / shrink, kernel="lanczos3", gap=2.0)

    left = (image.width - size.width + 1) // 2
    top = (image.height - size.height + 1) // 2
    out = image.crop(left, top, size.width, size.height).write_to_memory()
    return np.frombuffer(out, np.uint8).reshape(size.height, size.width, 3)
