"""The engines a model runs on. Each is imported only when chosen."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

import numpy as np


class Session(Protocol):
    """A loaded model, whichever engine holds it."""

    input_shape: tuple[int | str | None, ...]

    def run(self, tensor: np.ndarray) -> np.ndarray:
        """The model's first output for the input `tensor`."""
        ...


def open_session(model: Path, engine: str, device: str | None) -> Session:
    """Load `model` on `engine`.

    Args:
        model: The ONNX file.
        engine: `"onnxruntime"` or `"openvino"`.
        device: An OpenVINO device name, `"CPU"` when None. onnxruntime takes none.

    Raises:
        ValueError: If the engine is neither, or onnxruntime is given a device.
    """
    if engine == "onnxruntime":
        if device is not None:
            raise ValueError(f"the onnxruntime engine takes no device; got {device!r}")
        return _OnnxRuntimeSession(model)
    if engine == "openvino":
        return _OpenVinoSession(model, device or "CPU")
    raise ValueError(f"engine must be 'onnxruntime' or 'openvino'; got {engine!r}")


class _OnnxRuntimeSession:
    def __init__(self, model: Path) -> None:
        import onnxruntime as ort

        self._session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
        graph_input = self._session.get_inputs()[0]
        self._input_name = graph_input.name
        self._output_name = self._session.get_outputs()[0].name
        self.input_shape = tuple(graph_input.shape)

    def run(self, tensor: np.ndarray) -> np.ndarray:
        outputs = self._session.run([self._output_name], {self._input_name: tensor})
        return np.asarray(outputs[0])


class _OpenVinoSession:
    def __init__(self, model: Path, device: str) -> None:
        import openvino as ov

        core = ov.Core()
        graph = core.read_model(str(model))
        partial = graph.input(0).get_partial_shape()
        self.input_shape = tuple(dim.get_length() if dim.is_static else str(dim) for dim in partial)
        # OpenVINO's default is f16 on some devices.
        self._compiled = core.compile_model(graph, device, {"INFERENCE_PRECISION_HINT": "f32"})

    def run(self, tensor: np.ndarray) -> np.ndarray:
        return np.asarray(self._compiled(tensor)[0])
