"""`Detector` end to end, over generated graphs."""

import json
import subprocess
import sys

import numpy as np
import pytest
from graphs import CANVAS, CAR, fixed_output, write_model

from detector import Detector

ENGINES = [("onnxruntime", None), ("openvino", "CPU")]


def frame(height: int, width: int) -> np.ndarray:
    return np.random.default_rng(0).integers(0, 256, (height, width, 3), np.uint8)


@pytest.fixture
def model(tmp_path):
    return write_model(tmp_path, fixed_output([CAR]))


def test_the_engines_agree(model):
    results = [
        Detector(model, engine=engine, device=device).detect(frame(40, 60), 32)
        for engine, device in ENGINES
    ]
    assert len(results[0]) == 1
    assert results[0] == results[1]


def test_openvino_keeps_a_coordinate_near_the_canvas_edge_exact(tmp_path):
    # At f16, which OpenVINO picks by default on some devices, 2047 becomes 2048.
    path = write_model(
        tmp_path, fixed_output([[2047, 10, 20, 6, 0.9, 0, 0]]), [1, 3, 2048, 2048], canvas=2048
    )
    car = Detector(path, engine="openvino").detect(frame(10, 3000), 16)[0]
    assert car["centre"]["x"] == 2047


def test_openvino_defaults_to_its_cpu_device(model):
    assert len(Detector(model, engine="openvino").detect(frame(40, 60), 32)) == 1


@pytest.mark.parametrize(("engine", "device"), ENGINES)
def test_a_car_two_overlapping_tiles_see_comes_back_once_in_the_frames_pixels(
    model, engine, device
):
    # 66 × 20 at DPT 32 resamples to 33 × 10: two tiles, at x = 0 and x = 1, and
    # the graph answers the same for both. The first tile's box stays, doubled.
    detections = Detector(model, engine=engine, device=device).detect(frame(20, 66), 32)
    assert len(detections) == 1
    car = detections[0]
    assert car["centre"] == {"x": 32.0, "y": 20.0}
    assert car["length"] == 40.0
    assert car["width"] == 12.0
    assert car["angle"] == 0.0
    assert car["class"] == "stock"
    assert car["confidence"] == pytest.approx(0.9, abs=1e-6)


def test_a_frame_with_no_car_is_an_empty_list(tmp_path):
    empty = write_model(tmp_path, fixed_output([]))
    assert Detector(empty).detect(frame(40, 60), 32) == []


def test_the_threshold_comes_from_the_json_file(tmp_path):
    high = write_model(tmp_path, fixed_output([CAR]), confidence_threshold=0.95)
    assert Detector(high).detect(frame(40, 60), 32) == []


def test_the_target_dpt_comes_from_the_json_file(tmp_path):
    # Target 8: 60 × 40 at DPT 32 resamples to 15 × 10, so a box comes back × 4.
    low = write_model(tmp_path, fixed_output([CAR]), dpt=8)
    assert Detector(low).detect(frame(40, 60), 32)[0]["length"] == 80.0


def test_the_car_width_comes_from_the_json_file(tmp_path):
    wide = write_model(tmp_path, fixed_output([CAR]), standard_width=1000.0, standard_gauge=500.0)
    assert Detector(wide).car_width_px(10) == 20.0


def test_the_car_width_for_a_dpt(model):
    assert Detector(model).car_width_px(16) == pytest.approx(33.44947735191638)


@pytest.mark.parametrize(("engine", "device"), ENGINES)
@pytest.mark.parametrize(
    "shape",
    [
        [1, 3, CANVAS, 16],
        [1, 3, 16, CANVAS],
        [2, 3, CANVAS, CANVAS],
        [1, 3, "height", "width"],
    ],
)
def test_a_model_whose_input_is_not_the_canvas_square_is_refused(tmp_path, shape, engine, device):
    path = write_model(tmp_path, fixed_output([CAR]), input_shape=shape)
    with pytest.raises(ValueError, match="canvas"):
        Detector(path, engine=engine, device=device)


def test_a_json_canvas_the_model_does_not_take_is_refused(tmp_path):
    path = write_model(tmp_path, fixed_output([CAR]), canvas=64)
    with pytest.raises(ValueError, match="canvas"):
        Detector(path)


@pytest.mark.parametrize(("engine", "device"), ENGINES)
def test_an_output_that_is_not_the_head_is_refused(tmp_path, engine, device):
    path = write_model(tmp_path, np.zeros((1, 300, 6), np.float32))
    with pytest.raises(ValueError, match=r"\[1, n, 7\]"):
        Detector(path, engine=engine, device=device).detect(frame(40, 60), 32)


@pytest.mark.parametrize("value", [3, -1, float("inf"), float("nan")])
def test_a_class_index_outside_the_list_is_refused(tmp_path, value):
    path = write_model(tmp_path, fixed_output([[16, 10, 20, 6, 0.9, value, 0]]))
    with pytest.raises(ValueError, match="class index"):
        Detector(path).detect(frame(40, 60), 32)


@pytest.mark.parametrize("dpt", [0, -16, float("nan")])
def test_a_dpt_that_is_not_positive_is_refused(model, dpt):
    detector = Detector(model)
    with pytest.raises(ValueError, match="DPT"):
        detector.detect(frame(40, 60), dpt)
    with pytest.raises(ValueError, match="DPT"):
        detector.car_width_px(dpt)


@pytest.mark.parametrize(
    "bad",
    [
        np.zeros((40, 60), np.uint8),
        np.zeros((40, 60, 4), np.uint8),
        np.zeros((40, 60, 3), np.float32),
    ],
)
def test_a_frame_that_is_not_8_bit_rgb_is_refused(model, bad):
    with pytest.raises(ValueError, match="RGB"):
        Detector(model).detect(bad, 32)


def test_an_unknown_engine_is_refused(model):
    with pytest.raises(ValueError, match="engine"):
        Detector(model, engine="tflite")


def test_onnxruntime_refuses_a_device(model):
    with pytest.raises(ValueError, match="device"):
        Detector(model, device="CPU")


def test_a_model_with_no_json_file_is_refused(model):
    model.with_suffix(".json").unlink()
    with pytest.raises(FileNotFoundError):
        Detector(model)


def test_a_json_file_missing_a_field_is_refused(tmp_path):
    path = write_model(tmp_path, fixed_output([CAR]))
    fields = json.loads(path.with_suffix(".json").read_text())
    del fields["nms_iou"]
    path.with_suffix(".json").write_text(json.dumps(fields))
    with pytest.raises(TypeError, match="nms_iou"):
        Detector(path)


def test_a_json_file_with_an_unknown_field_is_refused(tmp_path):
    path = write_model(tmp_path, fixed_output([CAR]), extra=1)
    with pytest.raises(TypeError, match="extra"):
        Detector(path)


def imported_after(code: str) -> set[str]:
    script = f"{code}\nimport sys\nprint(' '.join(sys.modules))"
    result = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return set(result.stdout.split())


def test_importing_the_package_loads_no_engine():
    modules = imported_after("import detector")
    assert not modules & {"onnxruntime", "openvino", "torch", "ultralytics"}


@pytest.mark.parametrize(
    ("engine", "chosen", "other"),
    [("onnxruntime", "onnxruntime", "openvino"), ("openvino", "openvino", "onnxruntime")],
)
def test_only_the_chosen_engine_is_imported(model, engine, chosen, other):
    modules = imported_after(f"from detector import Detector; Detector({str(model)!r}, {engine!r})")
    assert chosen in modules
    assert other not in modules
