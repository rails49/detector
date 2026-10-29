"""Fine-tune a YOLO26-OBB model on the exported rolling-stock tiles.

The export (`dataset/src/yolo_export.ts`) cuts every image into
`detector.canvas` tiles at one DPT, so this trains at `imgsz = canvas` with
scale augmentation off. Accuracy is measured afterwards on the held-out tiles by
`evaluate.py`; the validation split only picks `best.pt`.

Usage:
    uv run python train.py [--epochs 20] [--data ../dataset/yolo/data.yaml]
    uv run python train.py --model yolo26l-obb.pt --batch 2 --hours 8 \\
        --patience 30 --name ceiling-l

The 20-epoch default is a plumbing run. `--hours` is for a real training
session: a run stopped at 20 epochs on the old fixtures had validation loss still
falling, a model stopped early rather than converged.

**Pass `--name` for a long run.** `exist_ok=True` means a repeat of a name
overwrites its `runs/<name>/weights/`.

Weights land in `runs/`, which is gitignored. Nothing here is published
(`SPEC.md` § Accuracy).
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import yaml
from ultralytics import YOLO

HERE = Path(__file__).parent
REPO = HERE.parent

# The DOTA-pretrained oriented-box checkpoint. Ultralytics fetches it on first
# use. Fine-tuning from it rather than from scratch is what makes 46 images a
# sane amount of data to show plumbing with — DOTA is aerial imagery of vehicles
# and buildings, which is a closer starting point for top-down rolling stock
# than random initialization by a wide margin.
PRETRAINED = "yolo26n-obb.pt"


def detector_canvas() -> int:
    """`detector.canvas` from config.yaml, the side of every exported tile.

    Read from the authored YAML rather than from `lib/config`: Python does not
    consume the generated TypeScript binding, by the rule in `lib/CLAUDE.md`.
    """
    config = yaml.safe_load((REPO / "config.yaml").read_text())
    return int(config["detector"]["canvas"])


def main() -> None:
    canvas = detector_canvas()

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data",
        type=Path,
        default=REPO / "dataset" / "yolo" / "data.yaml",
        help="Ultralytics data.yaml, as written by `pnpm --filter dataset run export:yolo`",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=20,
        help="Few by design. This is a plumbing run, not a training run. "
        "Ignored when --hours is given.",
    )
    parser.add_argument(
        "--hours",
        type=float,
        default=None,
        help="Wall-clock budget. Overrides --epochs and, importantly, rescales the "
        "learning-rate schedule to fit the time available — appending epochs to a "
        "schedule that has already decayed to lrf buys very little.",
    )
    parser.add_argument(
        "--patience",
        type=int,
        default=100,
        help="Epochs without validation improvement before stopping. The default is "
        "Ultralytics' and never fires on a 20-epoch run; lower it on a long one so "
        "the run ends when the model stops learning rather than when the clock does.",
    )
    parser.add_argument(
        "--batch",
        type=int,
        default=4,
        help="Not yet sized for the M2; see rails49/occupancy#128.",
    )
    parser.add_argument(
        "--device",
        default="mps",
        help="cpu, mps, or a CUDA index.",
    )
    parser.add_argument(
        "--model",
        default=PRETRAINED,
        help="Pretrained checkpoint to fine-tune, e.g. yolo26l-obb.pt.",
    )
    parser.add_argument("--name", default="tracer", help="Run directory under runs/.")
    args = parser.parse_args()

    if not args.data.exists():
        raise SystemExit(
            f"{args.data} does not exist. Export the dataset first:\n"
            f"    pnpm --filter dataset run export:yolo -- --in <corpus>\n"
        )

    model = YOLO(args.model)

    started = time.monotonic()
    model.train(
        data=str(args.data.resolve()),
        epochs=args.epochs,
        # When `time` is set, Ultralytics times the first epoch, recomputes the
        # total from the budget, and **rebuilds the LR scheduler** against it —
        # so `epochs` above is discarded after epoch one and the decay to `lrf`
        # spans the hours actually available. That rebuild is the reason to use
        # a time budget rather than a guessed epoch count: a schedule sized for
        # 20 epochs and then run for 300 spends 280 of them at a learning rate
        # that has already bottomed out.
        time=args.hours,
        patience=args.patience,
        # The export pads every tile to the canvas, so Ultralytics' letterbox
        # to `imgsz` changes nothing (ADR 0014).
        imgsz=canvas,
        batch=args.batch,
        device=args.device,
        project=str(HERE / "runs"),
        name=args.name,
        exist_ok=True,
        # Every tile is at one DPT (ADR 0014).
        scale=0.0,
        flipud=0.5,
        # Cars stand at every angle on the layout.
        degrees=180.0,
        seed=0,
        plots=True,
    )
    elapsed = time.monotonic() - started

    weights = HERE / "runs" / args.name / "weights" / "best.pt"
    print(f"\n⏱  {elapsed / 60:.1f} min wall clock on {args.device}")
    print(f"📦 {weights}" if weights.exists() else f"⚠️  expected weights at {weights}")
    print("\nNext: uv run python export_onnx.py")


if __name__ == "__main__":
    main()
