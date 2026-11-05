"""A loaded detector: frame to L0."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from detector.config import ModelConfig
from detector.decode import Detection, decode_detections
from detector.engine import open_session
from detector.preprocess import tile_input
from detector.resample import resample
from detector.tiles import Size, input_layout


class Detector:
    """One model on one engine.

    Every value comes from the JSON file beside the model, `<model stem>.json`.
    The detector sometimes misses rolling stock and reports phantom trains, and
    nothing here is a safety interlock.
    """

    def __init__(
        self,
        model_path: str | Path,
        engine: str = "onnxruntime",
        device: str | None = None,
    ) -> None:
        """Load a model.

        Args:
            model_path: The ONNX file.
            engine: `"onnxruntime"`, or `"openvino"` with the `openvino` extra.
            device: An OpenVINO device name, `"CPU"` when None. onnxruntime takes none.

        Raises:
            ValueError: If the engine or device is refused, or the model's input
                is not `[1, 3, canvas, canvas]`.
        """
        model = Path(model_path)
        self._config = ModelConfig.load(model.with_suffix(".json"))
        self._session = open_session(model, engine, device)

        expected = (1, 3, self._config.canvas, self._config.canvas)
        if self._session.input_shape != expected:
            raise ValueError(
                f"{model.name} takes {list(self._session.input_shape)}, but the canvas in its "
                f"JSON file needs {list(expected)}"
            )

    def detect(self, frame: np.ndarray, dpt: float) -> list[Detection]:
        """Every car the model finds in `frame` (L0), in that frame's pixels.

        Args:
            frame: height × width × RGB, 8 bits.
            dpt: The frame's own DPT.

        Returns:
            One detection per car, by descending confidence.

        Raises:
            ValueError: If `frame` is not that shape and type, `dpt` is not
                positive, or the model's output is refused (`decode_detections`).
        """
        _check_dpt(dpt)
        if frame.ndim != 3 or frame.shape[2] != 3 or frame.dtype != np.uint8:
            raise ValueError(
                f"detect needs height × width × RGB, 8 bits; got {frame.shape} {frame.dtype}"
            )

        size = Size(frame.shape[1], frame.shape[0])
        layout = input_layout(size, dpt, self._config)
        resampled = resample(frame, layout.size)
        outputs = [
            (tile, self._session.run(tile_input(resampled, tile, self._config.canvas)))
            for tile in layout.tiles
        ]
        return decode_detections(
            outputs, layout, size, self._config.confidence_threshold, self._config
        )

    def car_width_px(self, dpt: float) -> float:
        """A car's width in pixels at `dpt`: `dpt × standard_width / standard_gauge`.

        Raises:
            ValueError: If `dpt` is not positive.
        """
        _check_dpt(dpt)
        return self._config.car_width_px(dpt)


def _check_dpt(dpt: float) -> None:
    if not dpt > 0:
        raise ValueError(f"the frame's DPT must be a positive number; got {dpt}")
