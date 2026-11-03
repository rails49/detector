# Detector in Safari

A test page for [#42](https://github.com/rails49/detector/issues/42). It runs the
detector in onnxruntime-web, WASM or WebGPU, on one frame from the ceiling
captures, while the rear camera runs at its largest size. Camera frames go to no
model; at 10 Hz the page draws them into a canvas, and on request reads each
whole frame back. The summary names which. After a run it prints a summary to copy and offers the
per-frame log as JSON.

The page is not the live path. It is not bound by
[occupancy ADR 0006](https://github.com/rails49/occupancy/blob/main/docs/adr/0006-the-onnx-runtime-ships-from-origin.md):
it loads `onnxruntime-web/webgpu`, whose asyncify build is 22.6 MiB and still fits
Cloudflare Pages. WASM inference runs in ORT's proxy worker; WebGPU has none.

## Assets

The models and frames are gitignored. `detector/export_bench.py` writes them to
`public/data/`: n at each tile side (2048, 1024) as fp32, fp16 and INT8 ONNX, and
the first image of `ceiling-2026-10-28` resampled to DPT 16 with the layout's
box. The page loads only the first frame in the manifest.

```sh
cd detector
uv run python export_bench.py --weights runs/n16/weights/best.pt \
  --archive ~/rails49/r49/archives/iot49/ceiling-2026-10-28.r49 --native-dpt 32.6
```

## Run and deploy

| Task | Command |
| :--- | :--- |
| Local, with COOP/COEP | `pnpm --filter @detector/bench dev` |
| Deploy to Cloudflare Pages project `detector-bench` | `op run --env-file bin/deploy-bench.env -- bin/deploy-bench.sh` |

The runtime and the WASM thread count are URL parameters
(`?runtime=webgpu&threads=4`); changing either reloads the page, because ORT
reads them once per page.

## A run

1. Plug the phone into mains power.
2. Start the camera. Save a frame and take a photo of the same scene with the
   Camera app, to compare the fields.
3. Pick runtime, precision, tile size, tile count and minutes, then Run. The
   first frame is timed separately and left out of the statistics.
4. Copy the summary into #42.

If a run ends the tab (iOS kills a tab that uses too much memory), the
reloaded page names the run's settings and the step it reached.
