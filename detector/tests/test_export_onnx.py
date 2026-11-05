import json
import shutil
import sys

import onnx
import pytest
import yaml
from onnx import TensorProto, helper
from PIL import Image

import export_onnx
from export_onnx import (
    R49_DATA,
    REPO,
    FrameCalibrationReader,
    calibration_images,
    check_input_shape,
    copy_metadata,
    input_shape,
    write_runtime_config,
)

CANVAS = yaml.safe_load((REPO / "config.yaml").read_text())["detector"]["canvas"]


def training_split(root, names):
    train = root / "images" / "train"
    train.mkdir(parents=True)
    for name in names:
        (train / f"{name}.jpg").touch()


def test_calibration_images_spread_across_the_split(tmp_path):
    training_split(tmp_path, [f"{i:02d}" for i in range(25)])
    stems = [p.stem for p in calibration_images(tmp_path, 10)]
    assert stems == ["00", "02", "05", "07", "10", "12", "15", "17", "20", "22"]


def test_calibration_images_takes_all_of_a_short_split(tmp_path):
    training_split(tmp_path, ["0", "1", "2"])
    assert [p.stem for p in calibration_images(tmp_path, 10)] == ["0", "1", "2"]


def test_copy_metadata(tmp_path):
    x = helper.make_tensor_value_info("x", TensorProto.FLOAT, [1])
    y = helper.make_tensor_value_info("y", TensorProto.FLOAT, [1])
    graph = helper.make_graph(
        [helper.make_node("Identity", ["x"], ["y"])], "g", [x], [y]
    )
    source, target = tmp_path / "source.onnx", tmp_path / "target.onnx"
    model = helper.make_model(graph)
    onnx.save(model, str(target))
    helper.set_model_props(model, {"task": "obb"})
    onnx.save(model, str(source))
    copy_metadata(source, target)
    props = onnx.load(str(target)).metadata_props
    assert [(p.key, p.value) for p in props] == [("task", "obb")]


def test_the_export_input_is_one_tile_at_the_canvas_square():
    assert input_shape() == (1, 3, CANVAS, CANVAS)


def graph_with_input(path, shape):
    x = helper.make_tensor_value_info("images", TensorProto.FLOAT, shape)
    y = helper.make_tensor_value_info("y", TensorProto.FLOAT, shape)
    graph = helper.make_graph(
        [helper.make_node("Identity", ["images"], ["y"])], "g", [x], [y]
    )
    model = helper.make_model(
        graph, opset_imports=[helper.make_opsetid("", 17)], ir_version=8
    )
    onnx.save(model, str(path))
    return path


def test_check_input_shape_accepts_the_canvas_square(tmp_path):
    check_input_shape(graph_with_input(tmp_path / "m.onnx", [1, 3, CANVAS, CANVAS]))


@pytest.mark.parametrize(
    "shape", [[1, 3, 544, 960], [1, 3, "height", "width"], [1, 3, CANVAS, 1024]]
)
def test_check_input_shape_refuses_any_other(tmp_path, shape):
    with pytest.raises(SystemExit, match="detector.canvas"):
        check_input_shape(graph_with_input(tmp_path / "m.onnx", shape))


def test_calibration_takes_canvas_tiles_as_exported(tmp_path):
    tile = tmp_path / "tile.png"
    Image.new("RGB", (8, 8), (114, 114, 114)).save(tile)
    batch = FrameCalibrationReader._preprocess(tile, 8)
    assert batch.shape == (1, 3, 8, 8)
    assert abs(float(batch.max()) - 114 / 255) < 1e-6


def test_calibration_refuses_a_tile_that_is_not_the_canvas(tmp_path):
    tile = tmp_path / "tile.png"
    Image.new("RGB", (8, 4)).save(tile)
    with pytest.raises(SystemExit, match="canvas"):
        FrameCalibrationReader._preprocess(tile, 8)


def test_the_file_beside_a_model_holds_config_yaml_and_the_gauge(tmp_path):
    written = write_runtime_config(tmp_path / "detector.onnx")
    assert written == tmp_path / "detector.json"

    config = yaml.safe_load((REPO / "config.yaml").read_text())
    detector = config["detector"]
    assert json.loads(written.read_text()) == {
        "canvas": detector["canvas"],
        "dpt": detector["dpt"],
        "tile_overlap_mm": detector["tile_overlap_mm"],
        "confidence_threshold": detector["confidence_threshold"],
        "nms_iou": detector["nms_iou"],
        "classes": detector["classes"],
        "standard_width": config["layout"]["standard_width"],
        "standard_gauge": json.loads(R49_DATA.read_text())["standard_gauge"],
    }


def test_the_file_beside_a_model_has_the_fields_the_run_time_loads(tmp_path):
    # rails49-detector loads conformance/model.json with the reader that refuses
    # a missing or an extra field.
    written = write_runtime_config(tmp_path / "detector.onnx")
    shared = json.loads((REPO / "conformance" / "model.json").read_text())
    assert set(json.loads(written.read_text())) == set(shared)


def fake_training(tmp_path, monkeypatch):
    """Weights whose export writes a graph at the canvas, and return their path."""
    weights = tmp_path / "best.pt"
    weights.touch()

    class FakeYolo:
        def __init__(self, _weights):
            pass

        def export(self, **_options):
            return graph_with_input(tmp_path / "best.onnx", [1, 3, CANVAS, CANVAS])

    monkeypatch.setattr(export_onnx, "YOLO", FakeYolo)
    return weights


def test_each_model_gets_its_own_file(tmp_path, monkeypatch):
    weights = fake_training(tmp_path, monkeypatch)
    out = tmp_path / "models"

    def fake_quantize(model_input, model_output, **_options):
        shutil.copy(model_input, model_output)

    monkeypatch.setattr(export_onnx, "calibration_images", lambda *_args: [])
    monkeypatch.setattr(export_onnx, "quantize_static", fake_quantize)
    monkeypatch.setattr(
        sys,
        "argv",
        ["export_onnx.py", "--onnx-only", "--weights", str(weights), "--out", str(out)],
    )
    export_onnx.main()

    assert sorted(p.name for p in out.iterdir()) == [
        "detector.json",
        "detector.onnx",
        "detector_int8.json",
        "detector_int8.onnx",
    ]


def test_float_stops_after_the_fp32_model_and_its_file(tmp_path, monkeypatch):
    weights = fake_training(tmp_path, monkeypatch)
    out = tmp_path / "models"
    monkeypatch.setattr(
        sys,
        "argv",
        ["export_onnx.py", "--float", "--weights", str(weights), "--out", str(out)],
    )
    export_onnx.main()

    assert sorted(p.name for p in out.iterdir()) == ["detector.json", "detector.onnx"]
