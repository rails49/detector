"""Write the models and frames the Safari test page in `bench/` loads (#42).

For each tile side (2048, 1024): the model as fp32, fp16 and static INT8 ONNX.
From a calibrated `.r49` archive: a few frames resampled to the target DPT, and
the layout's bounding box in those frames. Everything goes to
`bench/public/data/`, with `manifest.json` describing it.

The archive's native DPT is not stored in the `.r49`; pass the one its README
gives (32.6 for `ceiling-2026-10-28`).

Usage:
    uv run python export_bench.py --weights runs/n16/weights/best.pt \\
        --archive ~/rails49/data/ceiling-2026-10-28/ceiling-2026-10-28.r49 \\
        --native-dpt 32.6
"""

from __future__ import annotations

import argparse
import io
import json
import shutil
import zipfile
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnxruntime.quantization import (
    CalibrationDataReader,
    QuantFormat,
    QuantType,
    quantize_static,
)
from onnxruntime.transformers.float16 import convert_float_to_float16
from PIL import Image
from ultralytics import YOLO

from export_onnx import copy_metadata

HERE = Path(__file__).parent
OUT = HERE.parent / "bench" / "public" / "data"
SIDES = (2048, 1024)
STANDARD_GAUGE_MM = 1435
TILE_OVERLAP_MM = 30000


class TileReader(CalibrationDataReader):
    """Feeds square tiles, as CHW float32 in 0..1, to the quantizer."""

    def __init__(self, tiles: list[np.ndarray], input_name: str) -> None:
        self._batches = iter([{input_name: tile} for tile in tiles])

    def get_next(self) -> dict[str, np.ndarray] | None:  # type: ignore[override]
        return next(self._batches, None)


def write_frames(
    archive: Path, native_dpt: float, dpt: float, count: int
) -> tuple[list[Image.Image], dict]:
    """Resample the first `count` images of `archive` to `dpt` and save them."""
    scale = dpt / native_dpt
    with zipfile.ZipFile(archive) as zf:
        meta = json.loads(
            zf.read(next(n for n in zf.namelist() if n.endswith(".json")))
        )
        names = [image["filename"] for image in meta["images"][:count]]
        images = [
            Image.open(io.BytesIO(zf.read(name))).convert("RGB") for name in names
        ]

    frames = []
    entries = []
    (OUT / "frames").mkdir(parents=True, exist_ok=True)
    for name, image in zip(names, images):
        size = (round(image.width * scale), round(image.height * scale))
        frame = image.resize(size, Image.Resampling.LANCZOS)
        file = f"frames/{Path(name).stem}.jpg"
        frame.save(OUT / file, quality=90)
        frames.append(frame)
        entries.append({"file": file, "width": size[0], "height": size[1]})

    points = [p["px"] for p in meta["layout"]["calibration"]["points"]]
    layout = {
        "x0": round(min(p["x"] for p in points) * scale),
        "y0": round(min(p["y"] for p in points) * scale),
        "x1": round(max(p["x"] for p in points) * scale),
        "y1": round(max(p["y"] for p in points) * scale),
    }
    return frames, {"frames": entries, "layout": layout}


def calibration_tiles(
    frames: list[Image.Image], layout: dict, side: int
) -> list[np.ndarray]:
    """One tile of `side` from the layout's centre and one from each end, per frame."""
    tiles = []
    cy = (layout["y0"] + layout["y1"]) // 2 - side // 2
    for frame in frames:
        for x in (
            layout["x0"],
            (layout["x0"] + layout["x1"] - side) // 2,
            layout["x1"] - side,
        ):
            crop = frame.crop((x, cy, x + side, cy + side))
            array = np.asarray(crop, dtype=np.float32) / 255.0
            tiles.append(np.transpose(array, (2, 0, 1))[np.newaxis, ...])
    return tiles


def write_models(
    weights: Path, side: int, tiles: list[np.ndarray], stem: str
) -> list[dict]:
    """Export `weights` at `side` as fp32, fp16 and INT8 ONNX."""
    exported = Path(
        YOLO(str(weights)).export(
            format="onnx",
            imgsz=[side, side],
            simplify=True,
            batch=1,
            nms=False,
            half=False,
            dynamic=False,
        )
    )
    (OUT / "models").mkdir(parents=True, exist_ok=True)
    fp32 = OUT / "models" / f"{stem}-{side}-fp32.onnx"
    shutil.move(str(exported), fp32)

    fp16 = OUT / "models" / f"{stem}-{side}-fp16.onnx"
    onnx.save(
        convert_float_to_float16(onnx.load(str(fp32)), keep_io_types=True), str(fp16)
    )

    input_name = (
        ort.InferenceSession(str(fp32), providers=["CPUExecutionProvider"])
        .get_inputs()[0]
        .name
    )
    int8 = OUT / "models" / f"{stem}-{side}-int8.onnx"
    # The same settings as export_onnx.py; see its comment on op_types_to_quantize.
    quantize_static(
        model_input=str(fp32),
        model_output=str(int8),
        calibration_data_reader=TileReader(tiles, input_name),
        quant_format=QuantFormat.QDQ,
        activation_type=QuantType.QInt8,
        weight_type=QuantType.QInt8,
        per_channel=True,
        op_types_to_quantize=["Conv"],
    )
    copy_metadata(fp32, int8)

    return [
        {
            "side": side,
            "precision": path.stem.rsplit("-", 1)[1],
            "file": f"models/{path.name}",
            "bytes": path.stat().st_size,
        }
        for path in (fp32, fp16, int8)
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--native-dpt", type=float, required=True)
    parser.add_argument("--dpt", type=float, default=16)
    parser.add_argument("--frames", type=int, default=3)
    parser.add_argument("--name", default="n16", help="Model name in the page.")
    args = parser.parse_args()

    if OUT.exists():
        shutil.rmtree(OUT)
    frames, manifest = write_frames(
        args.archive, args.native_dpt, args.dpt, args.frames
    )
    models = []
    for side in SIDES:
        tiles = calibration_tiles(frames, manifest["layout"], side)
        models += write_models(args.weights, side, tiles, args.name)

    manifest |= {
        "model": args.name,
        "dpt": args.dpt,
        "overlap": round(args.dpt * TILE_OVERLAP_MM / STANDARD_GAUGE_MM),
        "models": models,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    for model in models:
        print(f"{model['file']}  {model['bytes'] / 1024 / 1024:.1f} MiB")


if __name__ == "__main__":
    main()
