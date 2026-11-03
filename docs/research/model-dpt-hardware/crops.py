"""Cut the report's figures from the drawn held-out frames in `detector/runs/`.

Each figure is one region of one held-out frame, cut from several runs'
drawings (`evaluate.py --draw`) and laid out in a grid with a label over each
panel. Boxes are in the coordinates of a 4032-px-wide frame; each source is
scaled to that. `detector/runs/` is gitignored, so this only runs on the
machine that holds the runs.

    uv run --with pillow python docs/research/model-dpt-hardware/crops.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
RUNS = HERE.parents[2] / "detector" / "runs"
DATA = HERE.parents[3] / "data"

F2888 = "ceiling-2026-10-29__IMG_2888"
F2904 = "ceiling-2026-10-29b__IMG_2904"
F2918 = "ceiling-2026-10-29b__IMG_2918"

Box = tuple[int, int, int, int]


def by_dpt(run: str, frame: str = F2888) -> Path:
    return RUNS / f"by-dpt-{run[0]}" / frame / f"{run}.jpg"


def held_out(run: str, frame: str, sub: str = "held-out") -> Path:
    return RUNS / run / sub / f"{frame}.jpg"


def panel(
    src: Path, box: Box, width: int, label: str, scale: float | None = None
) -> Image.Image:
    im = Image.open(src).convert("RGB")
    k = im.size[0] / 4032
    x0, y0, x1, y1 = (round(v * k) for v in box)
    crop = im.crop((x0, y0, x1, y1))
    if scale is not None:
        # Show the pixels the model sees: down to the DPT, back up blocky.
        small = crop.resize(
            (round(crop.size[0] * scale), round(crop.size[1] * scale)),
            Image.Resampling.LANCZOS,
        )
        crop = small.resize(crop.size, Image.Resampling.NEAREST)
    crop = crop.resize(
        (width, round(width * crop.size[1] / crop.size[0])), Image.Resampling.LANCZOS
    )
    bar = 40
    out = Image.new("RGB", (crop.size[0], crop.size[1] + bar), "white")
    out.paste(crop, (0, bar))
    ImageDraw.Draw(out).text(
        (10, 6), label, fill="black", font=ImageFont.load_default(size=26)
    )
    return out


def grid(panels: list[Image.Image], columns: int) -> Image.Image:
    w = max(p.size[0] for p in panels)
    h = max(p.size[1] for p in panels)
    rows = -(-len(panels) // columns)
    gap = 6
    out = Image.new(
        "RGB", (columns * w + (columns - 1) * gap, rows * h + (rows - 1) * gap), "white"
    )
    for i, p in enumerate(panels):
        out.paste(p, ((i % columns) * (w + gap), (i // columns) * (h + gap)))
    return out


def figure(
    name: str, box: Box, columns: int, width: int, sources: list[tuple[Path, str]]
) -> None:
    grid([panel(src, box, width, label) for src, label in sources], columns).save(
        HERE / name, quality=82
    )


def main() -> None:
    raw = DATA / "ceiling-2026-10-29" / "jpg" / "IMG_2888.jpg"
    sees = [
        panel(raw, (2850, 1580, 3350, 1830), 700, f"DPT {d}", d / 32.6)
        for d in (33, 16, 12, 8, 6, 4)
    ]
    grid(sees, 2).save(HERE / "what-the-model-sees.jpg", quality=82)

    curve = (2300, 1400, 3850, 2250)
    figure(
        "dpt-sweep.jpg",
        curve,
        2,
        700,
        [
            (by_dpt("n33"), "n, DPT 33"),
            (by_dpt("s33"), "s, DPT 33"),
            (by_dpt("n16"), "n, DPT 16"),
            (by_dpt("s16"), "s, DPT 16"),
            (by_dpt("n12"), "n, DPT 12"),
            (by_dpt("s12"), "s, DPT 12"),
            (by_dpt("n8-e135"), "n, DPT 8"),
            (by_dpt("s6"), "s, DPT 6"),
            (by_dpt("n4"), "n, DPT 4"),
            (by_dpt("s4"), "s, DPT 4"),
        ],
    )
    figure(
        "fragments.jpg",
        (1000, 2050, 3000, 2400),
        1,
        1400,
        [(by_dpt("n33"), "n, DPT 33"), (by_dpt("n16"), "n, DPT 16")],
    )
    figure(
        "miss-dpt16.jpg",
        (3100, 700, 3800, 1700),
        2,
        600,
        [(by_dpt("n16", F2904), "n, DPT 16"), (by_dpt("s16", F2904), "s, DPT 16")],
    )
    figure(
        "n-vs-l-dpt20.jpg",
        curve,
        2,
        700,
        [(by_dpt("n20"), "n, DPT 20"), (held_out("l20", F2888), "l, DPT 20")],
    )
    figure(
        "l33-int8.jpg",
        (2250, 950, 3800, 2250),
        2,
        700,
        [
            (held_out("l33", F2918), "l, DPT 33, FP32"),
            (held_out("l33", F2918, "held-out-int8"), "l, DPT 33, INT8"),
        ],
    )


if __name__ == "__main__":
    main()
