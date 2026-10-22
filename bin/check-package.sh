#!/usr/bin/env bash
# @rails49/detector as it ships: packs it into <out>, installs the tarball alone
# in a clean directory, and checks what a consumer gets. The gate runs it on a
# temporary directory; the release workflow publishes the tarball it leaves in
# <out>. Expects lib/detector/dist to be built.
#
#   bin/check-package.sh <out>
set -euo pipefail
out=$(mkdir -p "$1" && cd "$1" && pwd)
cd "$(dirname "$0")/.."

work=$(mktemp -d "${TMPDIR:-/tmp}/detector-package.XXXXXX")
trap 'rm -rf "$work"' EXIT

# pnpm pack writes the catalog: versions into the packed package.json. A build
# with no model leaves the `./model` entry pointing at nothing, so the entry is
# dropped and the package packed again.
(cd lib/detector && pnpm pack --pack-destination "$work" >/dev/null)
tar -xzf "$work"/*.tgz -C "$work"
node - "$work/package" <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const dir = process.argv[2];
const file = path.join(dir, 'package.json');
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!fs.existsSync(path.join(dir, manifest.exports['./model']))) {
  delete manifest.exports['./model'];
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
}
JS
rm -f "$out"/*.tgz
(cd "$work/package" && npm pack --silent --pack-destination "$out" >/dev/null)
tarball=$(echo "$out"/*.tgz)

# What the tarball holds against what its manifest says.
tar -tzf "$tarball" > "$work/files"
node - "$work/package/package.json" "$work/files" <<'JS'
const fs = require('node:fs');
const [manifestFile, listFile] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const files = fs.readFileSync(listFile, 'utf8').split('\n').filter(Boolean);
const fail = (message) => { console.error(`❌ ${message}`); process.exit(1); };

if (!manifest.peerDependencies?.['onnxruntime-web']) fail('onnxruntime-web is not a peer dependency');
if (manifest.dependencies?.['onnxruntime-web']) fail('onnxruntime-web is a dependency, not only a peer');

const entry = manifest.exports['./model'];
const model = entry && `package/${entry.replace(/^\.\//, '')}`;
const weights = files.filter((f) => /\.(ort|onnx|pt)$/.test(f));
if (entry && !files.includes(model)) fail(`the ./model entry names ${entry}, which the package does not hold`);
const stray = weights.filter((f) => f !== model);
if (stray.length) fail(`the package holds weights no entry names: ${stray.join(', ')}`);
console.log(entry ? `✅ the package holds the model at ${entry}` : '✅ the package holds no model and no ./model entry');
JS

# Installed alone, without its peer: the root entry must load with no
# onnxruntime-web present.
clean="$work/clean"
mkdir "$clean"
echo '{"private": true}' > "$clean/package.json"
pnpm --dir "$clean" add --config.auto-install-peers=false --prefer-offline "$tarball" >/dev/null
if (cd "$clean/node_modules/@rails49/detector" && node -e "require.resolve('onnxruntime-web')" 2>/dev/null); then
  echo "❌ onnxruntime-web resolves beside the package; the root-entry check would prove nothing" >&2
  exit 1
fi
(cd "$clean" && node --input-type=module -e "const d = await import('@rails49/detector'); if (typeof d.carWidthPx !== 'function') process.exit(1);")
echo "✅ the root entry loads without onnxruntime-web"
