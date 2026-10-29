# rails49 detector

The detector side of [rails49 occupancy](https://github.com/rails49/occupancy),
which detects track occupancy on a model railroad from an overhead camera. This
repository holds the training-data export, YOLO and CNN training, the models,
and the browser runtime that runs the detector. The UI, the live view and the
deploy are in occupancy.

**WARNING**: The detector sometimes misses rolling stock and sometimes reports
trains where there are none. It is not a safety interlock. Responsibility for
safe operation rests with the user.

`lib/detector` is [`@rails49/detector`](https://www.npmjs.com/package/@rails49/detector)
on npm, the package occupancy's UI depends on
([occupancy ADR 0019](https://github.com/rails49/occupancy/blob/main/docs/adr/0019-detection-and-training-move-to-rails49-detector.md)).
No model has been released.

## Development

Requires [pnpm](https://pnpm.io/), Node at the version in `.nvmrc`, and
[uv](https://github.com/astral-sh/uv). Run from the repository root unless
noted.

| Task | Command |
| :--- | :--- |
| Install dependencies | `pnpm install` |
| Full check (stale-config check, typecheck, TS tests, Python lint and tests) | `bin/test.sh` |
| Install the hooks: pre-commit refuses commits on `main`, pre-push runs `bin/test.sh` | `bin/install-hooks.sh` |
| Typecheck all packages | `pnpm typecheck` |
| All TS tests | `pnpm test` |
| Tests for one package | `pnpm --filter @rails49/detector test` |
| Regenerate `config.json` and `lib/config` | `pnpm config:generate` |
| Python lint, format, types | `cd <classifier/resnet\|detector> && uv run ruff check . && uv run black --check . && uv run pyright` |
| Derive the detector dataset | `pnpm --filter dataset run export:yolo -- --in <dir> [--dpt <n>]` (writes `dataset/yolo/`; see [dataset/README.md](dataset/README.md)) |
| Fine-tune, measure and export the detector | `cd detector && uv run python train.py --epochs 20 && uv run python evaluate.py runs/tracer/weights/best.pt && uv run python export_onnx.py` (see [detector/README.md](detector/README.md)) |
| Run occupancy's gate, or its UI, against this checkout's package | in a [rails49/occupancy](https://github.com/rails49/occupancy) checkout beside this one, `bin/with-detector.sh` (or `bin/with-detector.sh pnpm --filter @occupancy/ui dev`); it packs `../detector`, with the model if `detector/models/` holds one |
| Train the classifier (parked: no corpus) | run [classifier/resnet/TRAIN.ipynb](classifier/resnet/TRAIN.ipynb) (see [classifier/resnet/README.md](classifier/resnet/README.md)) |

## Releasing

A tag `vX.Y.Z` on `main` publishes `@rails49/detector` `X.Y.Z` to npm through
trusted publishing, then makes a GitHub Release with generated notes.

1. In a pull request, set the version in `lib/detector/package.json`.
2. Merge it.
3. With the merge commit checked out, run occupancy's gate against it
   (`bin/with-detector.sh`, see [Development](#development)).
4. Tag the merge commit on `main` and push the tag:

   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

The [release workflow](.github/workflows/release.yml) publishes nothing for a
tag that is not `vX.Y.Z`, not on `main`, or not the package's version. It
publishes the tarball `bin/check-package.sh` checked. npm does not accept a
version twice; a failed publish is fixed by re-running its job.

CI holds no model, so a release carries the runtime alone. Releases without a
model are `0.0.x`. The first release with a model is `0.1.0`, and it waits for
a model measured on held-out images: nothing automated decides that a model is
good enough (ADR 0007).

## Contributing

See [SPEC.md](SPEC.md) for what the detector must do, and
[docs/SYSTEM.md](docs/SYSTEM.md) for how the stages fit together.
[lib/CLAUDE.md](lib/CLAUDE.md) holds the interface rules the TypeScript
packages follow.

Pull requests are welcome. By contributing you agree that your contributions
are licensed under the [GNU Affero General Public License v3.0](LICENSE), the
same terms that cover the rest of the project. There is no CLA.

## License

Copyright (C) 2026 Bernhard Boser

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. See [LICENSE](LICENSE) for the full text.

The project is AGPL-3.0 because the detector is fine-tuned from
[Ultralytics YOLO](https://github.com/ultralytics/ultralytics) weights, which
are AGPL-3.0 licensed; trained weights inherit those terms
([ADR 0003](docs/adr/0003-agpl-because-the-detector-is-fine-tuned-from-agpl-weights.md)).
If you deploy a modified version, the licence requires you to make your source
available to its users.
