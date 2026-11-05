#!/usr/bin/env bash
# rails49-detector as it ships: builds its sdist and wheel into <out>, checks the
# wheel holds no model, installs it with no extras in an environment holding
# nothing else, and detects on a generated graph. The gate runs it on a temporary
# directory; the release workflow publishes what it leaves in <out>.
#
#   bin/check-wheel.sh <out>
set -euo pipefail
out=$(mkdir -p "$1" && cd "$1" && pwd)
cd "$(dirname "$0")/.."

work=$(mktemp -d "${TMPDIR:-/tmp}/detector-wheel.XXXXXX")
trap 'rm -rf "$work"' EXIT

rm -f "$out"/*.whl "$out"/*.tar.gz
(cd lib/detector-py && uv build --quiet --out-dir "$out")
wheel=$(echo "$out"/*.whl)

if unzip -Z1 "$wheel" | grep -E '\.(onnx|ort|pt|xml|bin)$'; then
  echo "❌ the wheel holds a model" >&2
  exit 1
fi
if ! unzip -Z1 "$wheel" | grep -q '/licenses/LICENSE$'; then
  echo "❌ the wheel holds no licence" >&2
  exit 1
fi
echo "✅ the wheel holds no model"

(cd lib/detector-py && uv run --quiet python tests/graphs.py "$work" >/dev/null)

# A new environment holding only the wheel, run from outside the repository, so
# `import detector` can only be the wheel.
uv venv --quiet --python 3.12 "$work/venv"
uv pip install --quiet --python "$work/venv/bin/python" "$wheel"
cd "$work"
venv/bin/python -I - "$work/model.onnx" <<'PY'
import importlib.util
import sys

import numpy as np

from detector import Detector

absent = ("torch", "ultralytics", "openvino", "onnx")
installed = [name for name in absent if importlib.util.find_spec(name)]
if installed:
    sys.exit(f"a clean install holds {installed}")
detections = Detector(sys.argv[1]).detect(np.zeros((40, 60, 3), np.uint8), 32)
if len(detections) != 1:
    sys.exit(f"expected one detection from the graph, got {detections}")
loaded = set(absent) & set(sys.modules)
if loaded:
    sys.exit(f"a clean install imported {sorted(loaded)}")
PY
echo "✅ a clean install imports and detects, with no Torch and no extras"
