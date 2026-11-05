#!/bin/bash
set -e

# Set working directory to project root
cd "$(dirname "$0")/.."

# No model is downloaded and no accuracy is asserted. The marker-driven
# regression test and its 99.5% gate were retired with the v4 conversion
# (SPEC.md § Accuracy, rails49/occupancy#8): they iterated point markers v4 deletes, and
# guarded an artifact the live path no longer loads with a number that was
# never a generalization estimate. Between here and the first detector there is
# no automated check that a model rebuild matches the published one — a known,
# accepted gap, not one to plug with a substitute gate.

# lib/config and lib/detector/src/generated.ts are generated from config.yaml
# and committed, so a fresh clone typechecks before anyone runs a generator.
# Regenerate into a temp tree and diff: editing config.yaml without regenerating fails here rather than
# surfacing at runtime. config.json is gitignored and not compared.
#
# This gate is NOT skippable. The Python *checks* below degrade to a warning
# when the environment cannot be resolved, because they test code this change
# does not touch. This is different: it is the only thing standing between a
# config.yaml edit and a silent runtime disagreement, so a missing uv is a
# hard failure rather than a quiet pass. uv is required to regenerate anyway.
echo "🔍 Checking the generated config is up to date with config.yaml..."
if ! command -v uv &>/dev/null; then
  echo "❌ uv is required to verify lib/config against config.yaml, and was not found."
  echo "   Install uv (https://github.com/astral-sh/uv), then re-run."
  echo "   The check regenerates lib/config and diffs it; without it, a stale"
  echo "   lib/config would reach runtime unnoticed."
  exit 1
fi

STALE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/stale.XXXXXX")
trap 'rm -rf "$STALE_DIR"' EXIT

# detector.classes is append-only (ADR 0009), so the generator is handed
# config.yaml as it was at the merge base with origin/main and refuses a class
# list that does not start with that one. On main itself the base is HEAD.
# Not skippable either: CI fetches full history so the merge base resolves.
if ! MERGE_BASE=$(git merge-base HEAD origin/main); then
  echo "❌ Could not find the merge base of HEAD and origin/main, which the"
  echo "   append-only check on detector.classes compares against."
  echo "   Run: git fetch origin main"
  exit 1
fi
BASE_CONFIG="$STALE_DIR/base-config.yaml"
if ! git show "$MERGE_BASE:config.yaml" >"$BASE_CONFIG"; then
  echo "❌ Could not read config.yaml at the merge base $MERGE_BASE."
  exit 1
fi

if ! uv run --quiet --with pyyaml python3 bin/generate_config.py \
  --base-config "$BASE_CONFIG" --out-dir "$STALE_DIR" >/dev/null; then
  echo "❌ Could not regenerate config to verify it. See the error above."
  exit 1
fi
if ! diff -r -q lib/config/src "$STALE_DIR/lib/config/src" \
  || ! diff -q lib/detector/src/generated.ts "$STALE_DIR/lib/detector/src/generated.ts"; then
  echo ""
  echo "❌ The generated config is stale — config.yaml has changed since it was generated."
  echo "   Run: pnpm config:generate"
  echo "   Then commit the result. It is generated but committed."
  exit 1
fi
echo "✅ The generated config matches config.yaml."

# @rails49/detector's consumers, dataset/ among them, read its built dist/.
echo "📦 Building the packages..."
pnpm -r build

# Run TypeScript typechecks
echo "🔍 Running TypeScript typecheck..."
pnpm -r typecheck

# Run TypeScript tests
echo "🧪 Running TypeScript tests..."
pnpm test

# Run Python linting and formatting. uv is guaranteed present: the lib/config
# gate above already hard-failed without it.
echo "🐍 Running Python checks..."
(cd detector && uv sync --quiet && uv run ruff check . && uv run black --check . && uv run pyright)
(cd detector && uv run pytest -q)

echo "🐍 Running the rails49-detector checks..."
(cd lib/detector-py && uv sync --locked --all-extras --quiet && uv run ruff check . && uv run black --check . && uv run pyright)
(cd lib/detector-py && uv run pytest -q)

# The package as it ships, packed and installed alone.
echo "📦 Checking @rails49/detector as packed..."
PACKAGE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/package.XXXXXX")
trap 'rm -rf "$STALE_DIR" "$PACKAGE_DIR"' EXIT
bin/check-package.sh "$PACKAGE_DIR"

# rails49-detector as it ships, built and installed alone.
echo "📦 Checking rails49-detector as built..."
WHEEL_DIR=$(mktemp -d "${TMPDIR:-/tmp}/wheel.XXXXXX")
trap 'rm -rf "$STALE_DIR" "$PACKAGE_DIR" "$WHEEL_DIR"' EXIT
bin/check-wheel.sh "$WHEEL_DIR"

echo "🎉 All checks passed successfully!"
