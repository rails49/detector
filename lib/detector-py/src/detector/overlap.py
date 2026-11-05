"""How much two oriented boxes share: `lib/detector/src/overlap.ts`."""

from __future__ import annotations

from collections.abc import Sequence

Vertex = tuple[float, float]


def polygon_area(polygon: Sequence[Vertex]) -> float:
    """Area of a simple polygon, by the shoelace formula. Sign-free."""
    return abs(_twice_signed_area(polygon)) / 2


def polygon_iou(a: Sequence[Vertex], b: Sequence[Vertex]) -> float:
    """Intersection over union of two convex polygons."""
    intersection = _convex_intersection_area(a, b)
    if intersection == 0:
        return 0
    union = polygon_area(a) + polygon_area(b) - intersection
    return 0 if union <= 0 else intersection / union


def _twice_signed_area(polygon: Sequence[Vertex]) -> float:
    twice = 0.0
    for i, (ax, ay) in enumerate(polygon):
        bx, by = polygon[(i + 1) % len(polygon)]
        twice += ax * by - bx * ay
    return twice


def _counter_clockwise(polygon: Sequence[Vertex]) -> list[Vertex]:
    return list(reversed(polygon)) if _twice_signed_area(polygon) < 0 else list(polygon)


def _side(a: Vertex, b: Vertex, p: Vertex) -> float:
    """Positive when `p` is left of the directed edge `a → b`."""
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])


def _intersect(p: Vertex, q: Vertex, a: Vertex, b: Vertex) -> Vertex:
    """Where segment `p → q` crosses the infinite line through `a → b`."""
    dx1, dy1 = q[0] - p[0], q[1] - p[1]
    dx2, dy2 = b[0] - a[0], b[1] - a[1]
    denominator = dx1 * dy2 - dy1 * dx2
    if denominator == 0:
        return p
    t = ((a[0] - p[0]) * dy2 - (a[1] - p[1]) * dx2) / denominator
    return (p[0] + t * dx1, p[1] + t * dy1)


def _convex_intersection_area(a: Sequence[Vertex], b: Sequence[Vertex]) -> float:
    """Area shared by two convex polygons, by Sutherland–Hodgman clipping."""
    output = _counter_clockwise(a)
    clip = _counter_clockwise(b)

    for i, edge_start in enumerate(clip):
        if not output:
            break
        edge_end = clip[(i + 1) % len(clip)]
        polygon = output
        output = []
        for j, current in enumerate(polygon):
            previous = polygon[j - 1]
            current_inside = _side(edge_start, edge_end, current) >= 0
            previous_inside = _side(edge_start, edge_end, previous) >= 0
            if current_inside:
                if not previous_inside:
                    output.append(_intersect(previous, current, edge_start, edge_end))
                output.append(current)
            elif previous_inside:
                output.append(_intersect(previous, current, edge_start, edge_end))

    return 0 if len(output) < 3 else polygon_area(output)
