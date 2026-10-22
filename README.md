# rails49 detector

The detector side of [rails49 occupancy](https://github.com/rails49/occupancy),
which detects track occupancy on a model railroad from an overhead camera. This
repository holds the training-data export, YOLO and CNN training, the models,
and the browser runtime that runs the detector. The UI, the live view and the
deploy are in occupancy.

**WARNING**: The detector sometimes misses rolling stock and sometimes reports
trains where there are none. It is not a safety interlock. Responsibility for
safe operation rests with the user.

`lib/detector` is `@occupancy/detector`, the package occupancy's UI depends on.
Publishing it, as `@rails49/detector`, is not set up yet
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
| Tests for one package | `pnpm --filter @occupancy/detector test` |
| Regenerate `config.json` and `lib/config` | `pnpm config:generate` |
| Python lint, format, types | `cd <classifier/resnet\|detector> && uv run ruff check . && uv run black --check . && uv run pyright` |
| Derive the detector dataset | `pnpm --filter dataset run export:yolo` (reads `dataset/r49/`, writes `dataset/yolo/`; see [dataset/README.md](dataset/README.md)) |
| Fine-tune and export the detector | `cd detector && uv run python train.py --epochs 20 && uv run python export_onnx.py` (see [detector/README.md](detector/README.md)) |
| Train the classifier (parked: no corpus) | run [classifier/resnet/TRAIN.ipynb](classifier/resnet/TRAIN.ipynb) (see [classifier/resnet/README.md](classifier/resnet/README.md)) |

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
