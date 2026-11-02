#!/bin/bash
set -e

# Build bench/ and upload it to its own Cloudflare Pages project.
# Run detector/export_bench.py first; it writes bench/public/data/.
# Run under 1Password: op run --env-file bin/deploy-bench.env -- bin/deploy-bench.sh
cd "$(dirname "$0")/.."

PROJECT_NAME="detector-bench"
DEPLOY_DIR="bench/dist"

if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "❌ Run under 1Password: op run --env-file bin/deploy-bench.env -- bin/deploy-bench.sh"
  exit 1
fi

if [ ! -f bench/public/data/manifest.json ]; then
  echo "❌ bench/public/data/manifest.json is missing. Run detector/export_bench.py first (bench/README.md)."
  exit 1
fi

pnpm --filter @detector/bench build

# Cloudflare Pages rejects any file over 25 MiB.
TOO_BIG=$(find "$DEPLOY_DIR" -type f -size +25M)
if [ -n "$TOO_BIG" ]; then
  echo "❌ Over the 25 MiB per-file limit of Cloudflare Pages:"
  echo "$TOO_BIG"
  exit 1
fi

npx wrangler@3 pages project create "$PROJECT_NAME" --production-branch=main 2>/dev/null \
  || echo "ℹ️  Project creation skipped or already exists."
npx wrangler@3 pages deploy "$DEPLOY_DIR" --project-name="$PROJECT_NAME" --branch=main
