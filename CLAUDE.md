# CLAUDE.md

The detector side of [rails49/occupancy](https://github.com/rails49/occupancy):
training-data export, YOLO and CNN training, and the browser runtime that runs
the detector.

The detector sometimes misses rolling stock or reports phantom trains. Present
nothing here as a safety interlock.

gate: pnpm install --frozen-lockfile && bin/test.sh

## Where things are

What each kind of doc holds: org [ADR-0021](https://github.com/rails49/.github/blob/main/docs/adr/0021-each-fact-has-one-owner-and-the-glossary-is-glossary-md.md). See `docs/agents/domain.md`.

- Commands: `README.md`.
- How the stages fit together, configuration, models: `docs/SYSTEM.md`.
- Terms: `GLOSSARY.md`. Decisions: `docs/adr/`. Requirements: `SPEC.md`.
- Before touching `lib/`, read `lib/CLAUDE.md`.
- The UI, L1, drift and the deploy are in
  [rails49/occupancy](https://github.com/rails49/occupancy).

## Traps

- `main` takes changes only through a PR that passes the `ci` check,
  squash-merged by hand or rebase-merged by implement-loop. Start each issue on
  a new branch from `origin/main`:
  `git fetch -q origin && git switch --no-track -c <issue>-<slug> origin/main`.
  Every code change passes the gate and the `code-review` skill before its PR.
- `SPEC.md` describes the target. Where it or an ADR disagrees with the code
  (for example `detector.input: [960, 544]` against ADR 0014), the gap is the
  planned migration; leave it unless the task is that migration.
- The `.r49` format is `@rails49/r49`'s, pinned once in `pnpm-workspace.yaml`.
  A format change is a release in `rails49/r49`, then a bump here (org [ADR-0022](https://github.com/rails49/.github/blob/main/docs/adr/0022-the-r49-format-is-r49s-and-each-consumer-pins-it.md)).
- `config.json` and `lib/config/src/` are generated. Edit `config.yaml` and run
  `pnpm config:generate`. `detector.classes` is append-only (ADR 0009).
- `dataset/src/data_prep.ts` and `dataset/src/online_diagnostics.ts` stay
  parked stubs. v4 stores no point markers; see `SPEC.md` § v4 cannot produce a
  trainable CNN dataset.
- The model filename is written only in `lib/detector`: its `./model` exports
  entry and `DETECTOR_MODEL_FILE` (`lib/detector/tests/model.test.ts`).
  Occupancy's UI resolves the entry and imports the constant.
- `@rails49/detector` is published from a tag, and which version may carry a
  model is set in `README.md` § Releasing.
- `lib/detector/src/generated.ts` is generated too (`docs/SYSTEM.md` §
  Configuration).
- Try a change in occupancy with occupancy's `bin/with-detector.sh`
  (`README.md`), not `pnpm link`: a link loads detector's own
  `onnxruntime-web`, a second copy beside the UI's.
- There is no model release yet: the current model is trained on the 46
  fixture images and nothing measures it. There is no automated model gate,
  and no substitute for one (ADR 0007).
- One model is in occupancy's live path, and the classifier is parked
  ([occupancy ADR 0004](https://github.com/rails49/occupancy/blob/main/docs/adr/0004-one-model-in-the-live-path.md)).
- `@detector/classifier` keeps its three entry points, so `onnxruntime-node`
  and `sharp` stay out of browser bundles.
- Import `onnxruntime-web/wasm`, never the package root
  ([occupancy ADR 0006](https://github.com/rails49/occupancy/blob/main/docs/adr/0006-the-onnx-runtime-ships-from-origin.md)).

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `rails49/detector`, driven via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single context: `GLOSSARY.md`, `docs/adr/` and `SPEC.md`. See `docs/agents/domain.md`.
