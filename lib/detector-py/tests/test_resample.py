"""The resample beyond what `conformance/resample.json` holds."""

import time

import numpy as np
import pytest

from detector.resample import resample
from detector.tiles import Size


def noise(height: int, width: int) -> np.ndarray:
    return np.random.default_rng(0).integers(0, 256, (height, width, 3), np.uint8)


def test_enlarging_returns_the_size_asked_for_and_is_deterministic():
    frame = noise(60, 80)
    first = resample(frame, Size(133, 100))
    assert first.shape == (100, 133, 3)
    assert np.array_equal(first, resample(frame, Size(133, 100)))


def test_a_flat_colour_stays_flat_when_enlarged():
    frame = np.full((60, 80, 3), [10, 128, 250], np.uint8)
    assert (resample(frame, Size(133, 100)) == [10, 128, 250]).all()


def test_no_scale_on_the_smaller_ratio_only_crops_from_the_centre():
    rows = np.zeros((100, 100, 3), np.uint8)
    rows[:, :, 0] = np.arange(100)[:, np.newaxis]
    out = resample(rows, Size(100, 50))
    assert out[0, 50, 0] == 25
    assert out[49, 50, 0] == 74


def test_a_frame_that_is_not_contiguous_is_read_correctly():
    frame = noise(40, 60)
    flipped = frame[::-1]
    assert np.array_equal(resample(flipped, Size(30, 20)), resample(flipped.copy(), Size(30, 20)))


def test_an_empty_size_is_refused():
    with pytest.raises(ValueError, match="non-empty"):
        resample(noise(10, 10), Size(0, 5))


def test_report_the_time_for_one_4k_frame(capsys):
    frame = noise(2160, 3840)
    start = time.perf_counter()
    out = resample(frame, Size(1920, 1080))
    elapsed = time.perf_counter() - start
    assert out.shape == (1080, 1920, 3)
    with capsys.disabled():
        print(f"\nresample of one 3840×2160 frame to 1920×1080: {elapsed * 1000:.0f} ms")
