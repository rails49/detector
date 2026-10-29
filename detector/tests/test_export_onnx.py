import onnx
from onnx import TensorProto, helper

from export_onnx import calibration_images, copy_metadata


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
