import cv2
import numpy as np
import torch

from evaluate import MISSED, contains, count, draw, frame_image, matches

# A 10×4 box centred on the origin, wound clockwise, and the same box
# counter-clockwise: the containment test must not depend on winding.
CLOCKWISE = torch.tensor([[[-5.0, -2.0], [5.0, -2.0], [5.0, 2.0], [-5.0, 2.0]]])
COUNTER = CLOCKWISE.flip(dims=[1])


def test_contains_inside_edge_and_outside_points_in_either_winding():
    points = torch.tensor([[0.0, 0.0], [5.0, 0.0], [6.0, 0.0], [0.0, 3.0]])
    expected = [[True, True, False, False]]
    assert contains(CLOCKWISE, points).tolist() == expected
    assert contains(COUNTER, points).tolist() == expected


def test_count_a_car_with_no_box_is_a_miss_and_a_box_with_no_car_is_a_phantom():
    far = CLOCKWISE + torch.tensor([100.0, 0.0])
    boxes = torch.cat([CLOCKWISE, far])
    midpoints = torch.tensor([[1.0, 1.0], [50.0, 50.0]])
    assert count(boxes, midpoints) == (1, 1)


def test_count_two_boxes_on_one_car_are_not_phantoms():
    boxes = torch.cat([CLOCKWISE, CLOCKWISE + torch.tensor([1.0, 0.0])])
    assert count(boxes, torch.tensor([[0.0, 0.0]])) == (0, 0)


def test_count_with_no_detections_misses_every_car():
    assert count(torch.empty(0, 4, 2), torch.tensor([[0.0, 0.0], [9.0, 9.0]])) == (2, 0)


def test_matches_marks_the_phantom_box_and_the_missed_car():
    far = CLOCKWISE + torch.tensor([100.0, 0.0])
    phantom, missed = matches(
        torch.cat([CLOCKWISE, far]), torch.tensor([[1.0, 1.0], [50.0, 50.0]])
    )
    assert phantom.tolist() == [False, True]
    assert missed.tolist() == [False, True]


def test_frame_image_places_tiles_at_their_offsets_and_drops_the_padding(tmp_path):
    # A 6×4 frame from two 4×4 tiles at x 0 and 2; the second tile's last two
    # columns are padding.
    left = np.full((4, 4, 3), 50, np.uint8)
    right = np.full((4, 4, 3), 200, np.uint8)
    cv2.imwrite(str(tmp_path / "a.jpg"), left)
    cv2.imwrite(str(tmp_path / "b.jpg"), right)
    frame = {
        "width": 6,
        "height": 4,
        "tiles": [{"stem": "a", "x": 0, "y": 0}, {"stem": "b", "x": 2, "y": 0}],
    }
    image = frame_image(frame, tmp_path, 4)
    assert image.shape == (4, 6, 3)
    assert image[0, :, 0].tolist() == [50, 50, 200, 200, 200, 200]


def test_draw_marks_a_missed_car_whose_span_is_in_fractional_pixels():
    image = np.zeros((20, 40, 3), np.uint8)
    car = {"p0": {"x": 5.4, "y": 10.0}, "p1": {"x": 34.6, "y": 10.0}}
    draw(image, torch.empty(0, 4, 2), torch.empty(0), [car])
    assert image[10, 8].tolist() == list(MISSED)
