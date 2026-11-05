# Conformance cases

Cases `@rails49/detector` and `rails49-detector` both run and agree with. The
runners are `lib/detector/tests/conformance.test.ts` and
`lib/detector-py/tests/test_conformance.py`.

| File | Covers | Tolerance |
| :--- | :--- | :--- |
| `model.json` | The configuration every case assumes, in the form of the JSON file beside a model. | |
| `layout.json` | Scale, resampled size, tile positions and car width. | `tolerance` on floats, absolute; sizes and positions are exact |
| `tile_input.json` | A tile as the model's input: planar, scaled to `0…1`, padded with level 114. | `tolerance` per value, absolute |
| `decode.json` | Output to L0: threshold, long axis, frame pixels, tiles joined, duplicates removed, refusals. | `tolerance` per field, absolute; `class` and the count are exact |
| `resample.json` | One frame and sharp's resize of it at about 1.2×, 2× and above 4×, as packed RGB in base64. | `tolerance` per channel |

`model.json` is not `config.yaml`, so that a change of target DPT leaves the
cases alone. Its canvas is 32 to keep the tensors small. The TypeScript runner
puts its values in place of the generated constants.

A case in `decode.json` has `expected` or `error`. `error` is a word the refusal's
message holds: `output` or `class`. A tile's `index` is its position in the
frame's layout, 0 when absent, and `slots` pads its `rows` with zeros.

The expected values in `layout.json`, `tile_input.json` and `decode.json` were
worked out from the rules, not from either runtime. A change that fails one is a
change to what the detector does, in both runtimes.

`resample.json` is what sharp wrote. `pnpm --filter dataset run conformance:resample`
rewrites it, and `dataset/tests/resample.test.ts` checks it still matches the
installed sharp.
