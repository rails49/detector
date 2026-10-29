"""Compute per m² and tile overhead from flops.json (research for detector#32)."""

import json
import math
import sys

rows = json.load(open(sys.argv[1]))
SIZES = ["640", "1024", "2048"]
DPTS = [20, 25, 33]
GAUGE_MM = 9
STD_GAUGE = 1435
OVERLAP_MM = 30000
CAR_W_MM = 3000
SPACING_MM = 25
LAYOUT = (2000, 1000)  # mm

models = {r["model"].split()[0]: r for r in rows if r["model"].endswith("nc=1")}

# Fit fused MACs = a*px + b*tokens^2, tokens = px / 32^2, and check the fit at every size.
fit = {}
for name, r in models.items():
    s = r["sizes"]["1024"]
    px = 1024 * 1024
    a = s["own_gmacs_conv"] * 1e9 / px
    b = s["own_gmacs_attn"] * 1e9 / (px / 1024) ** 2
    fit[name] = (a, b)
    for c in SIZES:
        sc = r["sizes"][c]
        pxc = int(c) ** 2
        pred = 2 * (a * pxc + b * (pxc / 1024) ** 2) / 1e9
        assert abs(pred - sc["ultra_gflops_fused"]) / sc["ultra_gflops_fused"] < 1e-3, (name, c, pred)


def gflops(name, h, w):
    a, b = fit[name]
    px = h * w
    return 2 * (a * px + b * (px / 1024) ** 2) / 1e9


def ntiles(d_px, c, o):
    if d_px <= c:
        return 1
    return math.ceil((d_px - o) / (c - o)) if c > o else math.nan


def ceil32(x):
    return 32 * math.ceil(x / 32)


out = []
p = out.append

p("## GFLOPs per tile and per Mpx (fused, nc=1)\n")
p("| model | params (M) | " + " | ".join(f"GFLOPs @{c}" for c in SIZES) + " | "
  + " | ".join(f"GFLOPs/Mpx @{c}" for c in SIZES) + " | attention share @2048 |")
p("|---" * (3 + 2 * len(SIZES)) + "|")
for name, r in models.items():
    g = [r["sizes"][c]["ultra_gflops_fused"] for c in SIZES]
    per = [gi / (int(c) ** 2 / 1e6) for gi, c in zip(g, SIZES)]
    s = r["sizes"]["2048"]
    share = s["own_gmacs_attn"] / (s["own_gmacs_conv"] + s["own_gmacs_attn"])
    p(f"| {name} | {r['params_fused']/1e6:.2f} | " + " | ".join(f"{x:.1f}" for x in g) + " | "
      + " | ".join(f"{x:.1f}" for x in per) + f" | {share:.0%} |")

p("\n## Unfused vs fused vs own MAC count\n")
p("| model | canvas | Ultralytics unfused | Ultralytics fused | own MACs (conv+attn) | fused / MACs |")
p("|---|---|---|---|---|---|")
for name, r in models.items():
    for c in SIZES:
        s = r["sizes"][c]
        macs = s["own_gmacs_conv"] + s["own_gmacs_attn"]
        p(f"| {name} | {c} | {s['ultra_gflops_unfused']:.2f} | {s['ultra_gflops_fused']:.2f} | {macs:.2f} | "
          f"{s['ultra_gflops_fused']/macs:.4f} |")

p("\n## Geometry\n")
p("| DPT | px/mm | Mpx per m² | overlap px | car width px | track spacing px | layout px |")
p("|---|---|---|---|---|---|---|")
for d in DPTS:
    k = d / GAUGE_MM
    p(f"| {d} | {k:.3f} | {k*k:.2f} | {d*OVERLAP_MM/STD_GAUGE:.0f} | {d*CAR_W_MM/STD_GAUGE:.1f} | "
      f"{SPACING_MM*k:.1f} | {LAYOUT[0]*k:.0f} × {LAYOUT[1]*k:.0f} |")


def region(d, kind):
    """Return (length px, width px, area m²) of a region."""
    k = d / GAUGE_MM
    L = LAYOUT[0] * k
    if kind == "rect":
        W = LAYOUT[1] * k
        return L, W, LAYOUT[0] * LAYOUT[1] / 1e6
    n = kind
    W = d * CAR_W_MM / STD_GAUGE + (n - 1) * SPACING_MM * k
    return L, W, LAYOUT[0] * (W / k) / 1e6


KINDS = ["rect", 1, 2, 4]
KNAME = {"rect": "2×1 m rectangle", 1: "1-track strip", 2: "2-track strip", 4: "4-track strip"}

p("\n## Tile overhead, square canvas (tiled px / region px)\n")
p("| region | DPT | region px | " + " | ".join(f"tiles @{c}" for c in SIZES) + " | "
  + " | ".join(f"overhead @{c}" for c in SIZES) + " |")
p("|---" * (3 + 2 * len(SIZES)) + "|")
for kind in KINDS:
    for d in DPTS:
        L, W, _ = region(d, kind)
        o = d * OVERLAP_MM / STD_GAUGE
        t = [ntiles(L, int(c), o) * ntiles(W, int(c), o) for c in SIZES]
        ov = [ti * int(c) ** 2 / (L * W) for ti, c in zip(t, SIZES)]
        p(f"| {KNAME[kind]} | {d} | {L:.0f} × {W:.0f} | " + " | ".join(str(x) for x in t) + " | "
          + " | ".join(f"{x:.2f}" for x in ov) + " |")

p("\n## Tile overhead, rectangular canvas for strips (height = strip width rounded up to 32)\n")
p("| region | DPT | canvas h | " + " | ".join(f"tiles @w={c}" for c in SIZES) + " | "
  + " | ".join(f"overhead @w={c}" for c in SIZES) + " |")
p("|---" * (3 + 2 * len(SIZES)) + "|")
for kind in KINDS[1:]:
    for d in DPTS:
        L, W, _ = region(d, kind)
        o = d * OVERLAP_MM / STD_GAUGE
        h = ceil32(W)
        t = [ntiles(L, int(c), o) for c in SIZES]
        ov = [ti * int(c) * h / (L * W) for ti, c in zip(t, SIZES)]
        p(f"| {KNAME[kind]} | {d} | {h} | " + " | ".join(str(x) for x in t) + " | "
          + " | ".join(f"{x:.2f}" for x in ov) + " |")

p("\n## GFLOPs per refresh per m², full 2×1 m rectangle\n")
p("| model | DPT | no tiling, rate @1024 | " + " | ".join(f"tiled @{c}" for c in SIZES) + " | whole layout @best |")
p("|---" * (4 + len(SIZES)) + "|")
for name in models:
    for d in DPTS:
        L, W, area = region(d, "rect")
        o = d * OVERLAP_MM / STD_GAUGE
        ideal = gflops(name, 1024, 1024) / (1024 * 1024 / 1e6) * (d / GAUGE_MM) ** 2
        per = []
        for c in SIZES:
            c = int(c)
            per.append(ntiles(L, c, o) * ntiles(W, c, o) * gflops(name, c, c) / area)
        best = min(per)
        p(f"| {name} | {d} | {ideal:.0f} | " + " | ".join(f"{x:.0f}" for x in per) + f" | {best*area:.0f} |")

p("\n## GFLOPs per refresh per metre of strip (2 m strip / 2), square vs rectangular canvas\n")
p("| model | region | DPT | " + " | ".join(f"square @{c}" for c in SIZES) + " | "
  + " | ".join(f"rect @w={c}" for c in SIZES) + " |")
p("|---" * (3 + 2 * len(SIZES)) + "|")
for name in models:
    for kind in KINDS[1:]:
        for d in DPTS:
            L, W, _ = region(d, kind)
            o = d * OVERLAP_MM / STD_GAUGE
            h = ceil32(W)
            sq = [ntiles(L, int(c), o) * ntiles(W, int(c), o) * gflops(name, int(c), int(c)) / 2 for c in SIZES]
            rc = [ntiles(L, int(c), o) * gflops(name, h, int(c)) / 2 for c in SIZES]
            p(f"| {name} | {KNAME[kind]} | {d} | " + " | ".join(f"{x:.1f}" for x in sq) + " | "
              + " | ".join(f"{x:.1f}" for x in rc) + " |")

print("\n".join(out))
