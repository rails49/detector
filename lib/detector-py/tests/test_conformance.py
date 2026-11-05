"""The cases `lib/detector/tests/conformance.test.ts` reads too."""

import base64
import json
from pathlib import Path

import numpy as np
import pytest

from detector.config import ModelConfig
from detector.decode import decode_detections
from detector.preprocess import tile_input
from detector.resample import resample
from detector.tiles import Size, Tile, input_layout

CONFORMANCE = Path(__file__).parents[3] / "conformance"
CONFIG = ModelConfig.load(CONFORMANCE / "model.json")
LAYOUT = json.loads((CONFORMANCE / "layout.json").read_text())
TILE_INPUT = json.loads((CONFORMANCE / "tile_input.json").read_text())
DECODE = json.loads((CONFORMANCE / "decode.json").read_text())
RESAMPLE = json.loads((CONFORMANCE / "resample.json").read_text())


def named(cases):
    return pytest.mark.parametrize("case", cases, ids=[case["name"] for case in cases])


def rgb(encoded: str, size) -> np.ndarray:
    data = np.frombuffer(base64.b64decode(encoded), np.uint8)
    return data.reshape(size["height"], size["width"], 3)


@named(LAYOUT["cases"])
def test_input_layout(case):
    layout = input_layout(Size(**case["frame"]), case["dpt"], CONFIG)
    assert layout.scale == pytest.approx(case["scale"], abs=LAYOUT["tolerance"])
    assert layout.size == Size(**case["size"])
    assert layout.tiles == [Tile(**tile) for tile in case["tiles"]]


@pytest.mark.parametrize("case", LAYOUT["car_width"], ids=lambda case: f"DPT {case['dpt']}")
def test_car_width(case):
    assert CONFIG.car_width_px(case["dpt"]) == pytest.approx(case["px"], abs=LAYOUT["tolerance"])


@named(TILE_INPUT["cases"])
def test_tile_input(case):
    resampled = TILE_INPUT["resampled"]
    tensor = tile_input(rgb(resampled["rgb"], resampled), Tile(**case["tile"]), CONFIG.canvas)
    assert tensor.shape == (1, 3, CONFIG.canvas, CONFIG.canvas)
    assert tensor.dtype == np.float32
    planar = np.frombuffer(base64.b64decode(case["planar"]), np.uint8)
    expected = (planar / 255).reshape(tensor.shape)
    assert np.abs(tensor - expected).max() <= TILE_INPUT["tolerance"]


def run_decode(case):
    frame = Size(**case["frame"])
    layout = input_layout(frame, case["dpt"], CONFIG)
    outputs = []
    for tile in case["tiles"]:
        if "dims" in tile:
            output = np.zeros(tile["dims"], np.float32)
        else:
            rows = tile["rows"]
            output = np.zeros((1, tile.get("slots", len(rows)), 7), np.float32)
            output[0, : len(rows)] = rows
        outputs.append((layout.tiles[tile.get("index", 0)], output))
    threshold = case.get("threshold", CONFIG.confidence_threshold)
    return decode_detections(outputs, layout, frame, threshold, CONFIG)


REFUSALS = [case for case in DECODE["cases"] if "error" in case]
ANSWERS = [case for case in DECODE["cases"] if "error" not in case]


@named(ANSWERS)
def test_decode(case):
    actual = run_decode(case)
    assert len(actual) == len(case["expected"])
    tolerance = DECODE["tolerance"]
    for got, want in zip(actual, case["expected"], strict=True):
        assert got["class"] == want["class"]
        assert got["centre"]["x"] == pytest.approx(want["centre"]["x"], abs=tolerance)
        assert got["centre"]["y"] == pytest.approx(want["centre"]["y"], abs=tolerance)
        for field in ("length", "width", "angle", "confidence"):
            assert got[field] == pytest.approx(want[field], abs=tolerance), field


@named(REFUSALS)
def test_decode_refuses(case):
    with pytest.raises(ValueError, match=case["error"]):
        run_decode(case)


@named(RESAMPLE["cases"])
def test_resample_is_within_tolerance_of_sharp(case):
    source = RESAMPLE["source"]
    actual = resample(rgb(source["rgb"], source), Size(**case["size"]))
    expected = rgb(case["rgb"], case["size"])
    assert actual.shape == expected.shape
    difference = np.abs(actual.astype(np.int16) - expected.astype(np.int16))
    assert difference.max() <= RESAMPLE["tolerance"]
