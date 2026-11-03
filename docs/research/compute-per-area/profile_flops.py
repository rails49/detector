"""Profile YOLO26-OBB FLOPs at several canvas sizes (research for detector#32)."""

import copy
import json
import sys

import torch
import torch.nn as nn
from ultralytics import YOLO
from ultralytics.nn.modules.block import AAttn, Attention
from ultralytics.nn.tasks import OBBModel
from ultralytics.utils.torch_utils import get_flops

torch.set_grad_enabled(False)
SIZES = [640, 1024, 2048]


def own_macs(model, size):
    """Count multiply-accumulates of conv, linear and attention matmuls with plain hooks."""
    counts = {"conv": 0, "linear": 0, "attn": 0}

    def conv_hook(m, x, y):
        counts["conv"] += y.numel() * (m.in_channels // m.groups) * m.kernel_size[0] * m.kernel_size[1]

    def lin_hook(m, x, y):
        counts["linear"] += y.numel() * m.in_features

    def attn_hook(m, x, y):
        b, _, h, w = x[0].shape
        area = getattr(m, "area", 1)
        tokens = h * w // area
        key_dim = getattr(m, "key_dim", m.head_dim)
        counts["attn"] += b * area * m.num_heads * tokens * tokens * (key_dim + m.head_dim)

    hs = []
    for m in model.modules():
        if isinstance(m, nn.Conv2d):
            hs.append(m.register_forward_hook(conv_hook))
        elif isinstance(m, nn.Linear):
            hs.append(m.register_forward_hook(lin_hook))
        elif isinstance(m, (Attention, AAttn)):
            hs.append(m.register_forward_hook(attn_hook))
    model.eval()
    model(torch.zeros(1, 3, size, size))
    for h in hs:
        h.remove()
    return counts


def profile(name, model):
    model = model.float().eval()
    params = sum(p.numel() for p in model.parameters())
    fused = copy.deepcopy(model).fuse(verbose=False)
    fparams = sum(p.numel() for p in fused.parameters())
    row = {"model": name, "params": params, "params_fused": fparams, "sizes": {}}
    for s in SIZES:
        g = get_flops(model, s)
        gf = get_flops(fused, s)
        macs = own_macs(fused, s)
        row["sizes"][s] = {
            "ultra_gflops_unfused": g,
            "ultra_gflops_fused": gf,
            "own_gmacs_conv": macs["conv"] / 1e9,
            "own_gmacs_linear": macs["linear"] / 1e9,
            "own_gmacs_attn": macs["attn"] / 1e9,
        }
        print(name, s, json.dumps(row["sizes"][s]), file=sys.stderr, flush=True)
    return row


rows = []
for scale in "nsmlx":
    rows.append(profile(f"yolo26{scale}-obb nc=1", OBBModel(f"yolo26{scale}-obb.yaml", nc=1, verbose=False)))
for scale in "nl":
    rows.append(profile(f"yolo26{scale}-obb nc=80", OBBModel(f"yolo26{scale}-obb.yaml", verbose=False)))
for w in sys.argv[1:]:
    rows.append(profile(w, YOLO(w).model))
print(json.dumps(rows, indent=1))
