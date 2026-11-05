"""The JSON file beside a model, which `detector/export_onnx.py` writes."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ModelConfig:
    """What the runtime needs to know about one model.

    Attributes:
        canvas: Side of the square tile, in pixels; the model's input.
        dpt: The target DPT every frame is resampled to.
        tile_overlap_mm: Overlap between neighbouring tiles, in prototype mm.
        confidence_threshold: A box must score above this to be a detection.
        nms_iou: Rotated-box IoU above which two boxes are the same car.
        classes: Class names by class index.
        standard_width: Prototype car width, in mm.
        standard_gauge: Prototype track gauge, in mm.
    """

    canvas: int
    dpt: float
    tile_overlap_mm: float
    confidence_threshold: float
    nms_iou: float
    classes: tuple[str, ...]
    standard_width: float
    standard_gauge: float

    @classmethod
    def load(cls, path: Path) -> ModelConfig:
        """Read the file at `path`, which must hold every field and no other."""
        fields = json.loads(path.read_text())
        return cls(**{**fields, "classes": tuple(fields["classes"])})

    def tile_overlap_px(self) -> float:
        """The overlap between neighbouring tiles, in pixels at the target DPT."""
        return self.dpt * self.tile_overlap_mm / self.standard_gauge

    def car_width_px(self, dpt: float) -> float:
        """A car's width in pixels at `dpt`."""
        return dpt * self.standard_width / self.standard_gauge
