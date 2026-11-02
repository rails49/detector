import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import authoredData from '@rails49/r49/data.json';

// The vocabulary and the class list are authored in two places now: the
// vocabulary is the .r49 format's (`@rails49/r49`'s data file) and
// `detector.classes` is this project's (`config.yaml`), org ADR-0022 / rails49/occupancy#181.
// Removing a subtype from the one used to sit beside the class list it broke;
// now nothing but the generator sees both, so it is what refuses the pair — and `bin/test.sh` runs
// it first, so a refusal fails the whole gate.
//
// These run the generator itself, as `bin/test.sh` does, against copies of the
// two files with one edit each.

const repoRoot = path.resolve(__dirname, '../../..');
const generator = path.join(repoRoot, 'bin/generate_config.py');
const authoredConfig = fs.readFileSync(path.join(repoRoot, 'config.yaml'), 'utf8');

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r49-generate-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * Run the generator over the given config text and data file, into `dir`.
 * `base`, when given, is the config text passed as `--base-config`.
 */
function generate(config: string, data: unknown, base?: string) {
  const configPath = path.join(dir, 'config.yaml');
  const dataPath = path.join(dir, 'r49.json');
  fs.writeFileSync(configPath, config);
  fs.writeFileSync(dataPath, JSON.stringify(data));
  const baseArgs: string[] = [];
  if (base !== undefined) {
    const basePath = path.join(dir, 'base.yaml');
    fs.writeFileSync(basePath, base);
    baseArgs.push('--base-config', basePath);
  }
  const { status, stdout, stderr } = spawnSync(
    'uv',
    [
      'run', '--quiet', '--with', 'pyyaml', 'python3', generator,
      '--config', configPath, '--r49-data', dataPath, '--out-dir', path.join(dir, 'out'),
      ...baseArgs,
    ],
    { encoding: 'utf8' },
  );
  return { status, output: stdout + stderr };
}

/** Every file the last `generate` wrote, by path relative to its out dir. */
function outputs(): Record<string, string> {
  const out = path.join(dir, 'out');
  const files: Record<string, string> = {};
  for (const entry of fs.readdirSync(out, { recursive: true, encoding: 'utf8' })) {
    const file = path.join(out, entry);
    if (fs.statSync(file).isFile()) files[entry] = fs.readFileSync(file, 'utf8');
  }
  return files;
}

/** The authored config with `detector.classes` replaced. */
function withClasses(classes: readonly string[]): string {
  const authored = 'classes: ["stock"]';
  expect(authoredConfig).toContain(authored);
  return authoredConfig.replace(authored, `classes: ${JSON.stringify(classes)}`);
}

describe('the config generator', () => {
  it('accepts the authored config and data file', () => {
    const { status, output } = generate(authoredConfig, authoredData);
    expect(output).not.toContain('❌');
    expect(status).toBe(0);
  });

  it('fails, naming the class, when the vocabulary loses the root a class needs', () => {
    const data = { ...authoredData, vocabulary: { rolling: authoredData.vocabulary.stock } };
    const { status, output } = generate(authoredConfig, data);
    expect(status).not.toBe(0);
    expect(output).toContain('"stock"');
    expect(output).toContain('detector.classes');
  });

  it('fails, naming the class, when the vocabulary loses a subtype a class needs', () => {
    // `stock` is still there, so only the appended subtype is named.
    const { loco: _loco, ...rest } = authoredData.vocabulary.stock;
    const data = { ...authoredData, vocabulary: { stock: rest } };
    const { status, output } = generate(withClasses(['stock', 'stock.loco']), data);
    expect(status).not.toBe(0);
    expect(output).toContain('"stock.loco"');
    expect(output).not.toContain('"stock",');
  });

  it('matches segment by segment, so a property is not a class', () => {
    // `width_mm` sits beside subtypes as a property of `stock`; it is not one.
    const data = { ...authoredData, vocabulary: { stock: { ...authoredData.vocabulary.stock, width_mm: 3200 } } };
    const { status, output } = generate(withClasses(['stock', 'stock.width_mm']), data);
    expect(status).not.toBe(0);
    expect(output).toContain('"stock.width_mm"');
  });

  it("refuses config.yaml carrying a value that is the format's", () => {
    const config = authoredConfig.replace('layout:\n', 'layout:\n  standard_gauge: 1435.0\n');
    const { status, output } = generate(config, authoredData);
    expect(status).not.toBe(0);
    expect(output).toContain('layout.standard_gauge');
  });
});

// ADR 0009: a position in `detector.classes` is a class index, so the list may
// only grow at its end. `bin/test.sh` passes config.yaml as it was at the merge
// base with `origin/main`; these pass edited copies instead.
describe('the config generator, given a base config', () => {
  it('accepts a class list that appends to the base', () => {
    const { status, output } = generate(
      withClasses(['stock', 'stock.loco']),
      authoredData,
      withClasses(['stock']),
    );
    expect(output).not.toContain('❌');
    expect(status).toBe(0);
  });

  it('accepts a class list equal to the base', () => {
    const { status, output } = generate(authoredConfig, authoredData, authoredConfig);
    expect(output).not.toContain('❌');
    expect(status).toBe(0);
  });

  it('fails, naming both lists, when the base is reordered', () => {
    const { status, output } = generate(
      withClasses(['stock.loco', 'stock']),
      authoredData,
      withClasses(['stock', 'stock.loco']),
    );
    expect(status).not.toBe(0);
    expect(output).toContain('["stock", "stock.loco"]');
    expect(output).toContain('["stock.loco", "stock"]');
  });

  it('fails when an entry of the base is removed', () => {
    const { status, output } = generate(
      withClasses(['stock']),
      authoredData,
      withClasses(['stock', 'stock.loco']),
    );
    expect(status).not.toBe(0);
    expect(output).toContain('append-only');
  });

  it('writes the same output as a run without it', () => {
    generate(authoredConfig, authoredData);
    const without = outputs();
    generate(authoredConfig, authoredData, authoredConfig);
    expect(outputs()).toEqual(without);
  });
});
