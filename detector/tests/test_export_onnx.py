import onnx
import pytest
import yaml
from onnx import TensorProto, helper
from PIL import Image

from export_onnx import (
    REPO,
    FrameCalibrationReader,
    calibration_images,
    check_input_shape,
    copy_metadata,
    input_shape,
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
    onnx.save(helper.make_model(graph), str(path))
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
