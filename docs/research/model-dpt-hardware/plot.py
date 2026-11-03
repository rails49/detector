"""Draw misses and standalone phantoms against DPT for each model size.

The numbers are the FP32 results on the 11 held-out frames (342 cars) at
confidence 0.25, from rails49/detector#37. Writes `accuracy-by-dpt.png` next
to this file.

    uv run --with matplotlib python docs/research/model-dpt-hardware/plot.py
"""

from pathlib import Path

import matplotlib.pyplot as plt

HERE = Path(__file__).parent

# model: [(DPT, missed, standalone phantoms)], seed 0. n at DPT 4-10 and s at
# DPT 4-6 trained 135 epochs, the rest 45.
SEED0 = {
    "n": [
        (4, 50, 3),
        (6, 34, 5),
        (8, 17, 0),
        (10, 10, 3),
        (12, 8, 2),
        (16, 4, 2),
        (20, 2, 7),
        (25, 2, 5),
        (33, 3, 16),
    ],
    "s": [
        (4, 16, 5),
        (6, 5, 9),
        (10, 4, 3),
        (12, 2, 3),
        (16, 3, 4),
        (20, 1, 4),
        (25, 3, 3),
        (33, 4, 11),
    ],
    "m": [(20, 5, 3), (25, 6, 4), (33, 3, 7)],
    "l": [(20, 4, 6), (25, 5, 9), (33, 7, 10)],
}
SEED1 = {"n": [(16, 4, 0)], "s": [(16, 3, 2), (25, 2, 3)], "l": [(20, 1, 1)]}
# s at DPT 8 trained only 45 epochs: 23 missed, 31 standalone.
S8_SHORT = (8, 23, 31)

# Categorical slots 1-4 of the dataviz reference palette, in fixed order.
COLOR = {"n": "#2a78d6", "s": "#eb6834", "m": "#1baf7a", "l": "#eda100"}
MARKER = {"n": "o", "s": "s", "m": "^", "l": "D"}
INK, MUTED, GRID = "#1f1f1e", "#6b6a64", "#e4e3de"


def main() -> None:
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.2), sharex=True)
    for ax, col, title in (
        (axes[0], 1, "Missed cars (of 342)"),
        (axes[1], 2, "Standalone phantoms"),
    ):
        for model, rows in SEED0.items():
            xs = [r[0] for r in rows]
            ys = [r[col] for r in rows]
            ax.plot(
                xs,
                ys,
                color=COLOR[model],
                marker=MARKER[model],
                markersize=7,
                linewidth=2,
                label=model,
            )
            ax.annotate(
                model,
                (xs[-1], ys[-1]),
                xytext=(6, 0),
                textcoords="offset points",
                color=INK,
                va="center",
            )
        for model, rows in SEED1.items():
            ax.scatter(
                [r[0] for r in rows],
                [r[col] for r in rows],
                facecolors="none",
                edgecolors=COLOR[model],
                marker=MARKER[model],
                s=60,
                linewidths=1.5,
            )
        ax.scatter(
            [S8_SHORT[0]],
            [S8_SHORT[col]],
            facecolors="none",
            edgecolors=MUTED,
            marker="s",
            s=60,
        )
        ax.annotate(
            "s, 45 epochs",
            (S8_SHORT[0], S8_SHORT[col]),
            xytext=(6, 4),
            textcoords="offset points",
            color=MUTED,
        )
        ax.axvspan(12, 16, color=GRID, zorder=0)
        ax.set_title(title, loc="left", color=INK)
        ax.set_xlabel("DPT")
        ax.set_xticks([4, 6, 8, 10, 12, 16, 20, 25, 33])
        ax.grid(axis="y", color=GRID)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        ax.tick_params(colors=MUTED)
    axes[0].legend(title="Model; hollow = seed 1", frameon=False)
    fig.text(0.01, 0.01, "Shaded: DPT 12-16, the recommended range.", color=MUTED)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(HERE / "accuracy-by-dpt.png", dpi=110)


if __name__ == "__main__":
    main()
