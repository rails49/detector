import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vite';

/** The ORT builds the page loads: the plain one for `/wasm`, asyncify for `/webgpu`. */
const ORT_FILES = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
];

const ortDist = path.dirname(createRequire(import.meta.url).resolve('onnxruntime-web/wasm'));

/** Copies the ORT runtime into `public/ort/`, where `env.wasm.wasmPaths` points. */
const copyOrt = {
  name: 'bench-copy-ort',
  buildStart() {
    const dest = path.resolve(__dirname, 'public/ort');
    fs.mkdirSync(dest, { recursive: true });
    for (const file of ORT_FILES) fs.copyFileSync(path.join(ortDist, file), path.join(dest, file));
  },
};

const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [copyOrt],
  // The plain builds fetch the runtime from `wasmPaths` instead of bundling a second copy.
  resolve: { conditions: ['onnxruntime-web-use-extern-wasm'] },
  server: { headers: isolation },
  preview: { headers: isolation },
  build: { target: 'es2022' },
});
