from export_onnx import calibration_images


def test_calibration_images_spread_across_the_split(tmp_path):
    train = tmp_path / "images" / "train"
    train.mkdir(parents=True)
    for i in range(25):
        (train / f"{i:02d}.jpg").touch()
    stems = [p.stem for p in calibration_images(tmp_path, 10)]
    assert stems == ["00", "02", "05", "07", "10", "12", "15", "17", "20", "22"]


def test_calibration_images_takes_all_of_a_short_split(tmp_path):
    train = tmp_path / "images" / "train"
    train.mkdir(parents=True)
    for i in range(3):
        (train / f"{i}.jpg").touch()
    assert [p.stem for p in calibration_images(tmp_path, 10)] == ["0", "1", "2"]
