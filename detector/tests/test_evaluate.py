import torch

from evaluate import contains, count

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
