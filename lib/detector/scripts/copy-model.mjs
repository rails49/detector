// Copies the exported model into dist/, where the `./model` entry points, when
// one exists. A clone with no model builds a package without one; packing then
// drops the entry (scripts/check-package.sh).
import fs from 'node:fs';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const entry = manifest.exports['./model'];
const source = path.join(packageRoot, '../../detector/models', path.basename(entry));

if (fs.existsSync(source)) {
  fs.copyFileSync(source, path.join(packageRoot, entry));
  console.log(`copied ${path.relative(packageRoot, source)} to ${entry}`);
} else {
  console.log(`no model at ${path.relative(packageRoot, source)}; building without one`);
}
