"""Small ONNX graphs that stand in for a model, since CI holds none.

Run as a script, it writes `model.onnx` and `model.json` into a directory, for
`bin/check-wheel.sh`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

CANVAS = 32
CONFIG = {
    "canvas": CANVAS,
    "dpt": 16,
    "tile_overlap_mm": 1000,
    "confidence_threshold": 0.25,
    "nms_iou": 0.5,
    "classes": ["stock"],
    "standard_width": 3000.0,
    "standard_gauge": 1435.0,
}
# One car in tile pixels: (cx, cy, w, h, score, class, angle).
CAR = [16.0, 10.0, 20.0, 6.0, 0.9, 0.0, 0.0]


def fixed_output(rows: list[list[float]], slots: int = 300, stride: int = 7) -> np.ndarray:
    output = np.zeros((1, slots, stride), np.float32)
    output[0, : len(rows)] = np.array(rows, np.float32).reshape(-1, stride)
    return output


def write_model(
    directory: Path,
    output: np.ndarray,
    input_shape: list[int | str] | None = None,
    **config: object,
) -> Path:
    """Write a graph that takes `input_shape` and returns `output`, with its JSON file.

    The input reaches the output, multiplied by zero, so no engine can drop it.
    """
    shape = input_shape if input_shape is not None else [1, 3, CANVAS, CANVAS]
    nodes = [
        helper.make_node("ReduceSum", ["images"], ["sum"], keepdims=0),
        helper.make_node("Mul", ["sum", "zero"], ["nothing"]),
        helper.make_node("Add", ["fixed", "nothing"], ["output"]),
    ]
    graph = helper.make_graph(
        nodes,
        "fixed",
        [helper.make_tensor_value_info("images", TensorProto.FLOAT, shape)],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, list(output.shape))],
        [
            numpy_helper.from_array(output, "fixed"),
            numpy_helper.from_array(np.array(0, np.float32), "zero"),
        ],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)], ir_version=8)
    path = directory / "model.onnx"
    onnx.save(model, str(path))
    path.with_suffix(".json").write_text(json.dumps({**CONFIG, **config}))
    return path


if __name__ == "__main__":
    print(write_model(Path(sys.argv[1]), fixed_output([CAR])))
