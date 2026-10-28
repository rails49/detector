// GENERATED FILE — DO NOT EDIT.
//
// Source: config.yaml, and @rails49/r49's data file for the format's gauge,
// scales and vocabulary. Regenerate with: pnpm config:generate
//
// Hand edits are lost on the next run, and bin/test.sh fails the build when
// this file disagrees with its sources.

// Public interface of @detector/config.
//
// This file is the package's interface — the only surface consumers may
// rely on. Per-symbol documentation lives on the declarations in
// ./generated.ts, because TypeScript discards doc comments written on
// re-export statements.

//── Layout geometry ─────────────────────────────────────────────────────────
// The constants that must agree across every stage of the pipeline.
export {
  STANDARD_GAUGE,
  STANDARD_WIDTH,
  MIN_DPT,
  SCALE_TO_RATIO,
  SCALES,
  type Scale,
} from './generated.ts';

//── Detector ────────────────────────────────────────────────────────────────
// The dataset exporter reads the class list and the split ratio.
// @rails49/detector reads its own copy of generated.ts.
export {
  DETECTOR_INPUT,
  DETECTOR_CANVAS,
  DETECTOR_TILE_OVERLAP_MM,
  DETECTOR_CONFIDENCE_THRESHOLD,
  DETECTOR_NMS_IOU,
  DETECTOR_VAL_SPLIT,
  DETECTOR_CLASSES,
} from './generated.ts';

//── Vocabulary ──────────────────────────────────────────────────────────────
// The authoring taxonomy, read from @rails49/r49's data file like the gauge
// and the scales above. The editor reads that file directly.
export { VOCABULARY } from './generated.ts';

// Withheld: everything under `classifier` and `cnn` in config.yaml. The
// classifier reads its own config.json at runtime and the CNN training
// hyperparameters are Python's; neither needs a TypeScript binding, and
// exporting them would invite a second consumer for values that have one.
