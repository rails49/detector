import numpy as np

from detect import PAD, tile_origins, tiles


def test_tile_origins_match_the_export():
    # The values lib/detector/tests/tiles.test.ts asserts for tileOrigins.
    assert tile_origins(8064, 682, 2048) == [0, 1203, 2406, 3610, 4813, 6016]
    assert len(tile_origins(3414, 682, 2048)) == 2
    assert len(tile_origins(3415, 682, 2048)) == 3
    assert tile_origins(2000, 682, 2048) == [0]


def test_tile_origins_round_halves_up_as_javascript_does():
    # Three tiles; the middle one starts at 1 * (5 - 4) / 2 = 0.5, which
    # Math.round makes 1 and Python's round makes 0.
    assert tile_origins(5, 3.5, 4) == [0, 1, 1]


def test_tiles_cover_the_image_and_pad_right_and_bottom():
    image = np.zeros((3, 5, 3), np.uint8)
    out = list(tiles(image, 1, 4))
    assert [(x, y) for _, x, y in out] == [(0, 0), (1, 0)]
    tile = out[1][0]
    assert tile.shape == (4, 4, 3)
    assert tile[:3, :4].max() == 0
    assert (tile[3] == PAD).all()
