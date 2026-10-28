# detector

The detector side of [rails49 occupancy](https://github.com/rails49/occupancy): car labels are turned into training data, a detector is trained on them, and a browser runtime runs it. Terms this repository uses but does not own are in occupancy's [GLOSSARY.md](https://github.com/rails49/occupancy/blob/main/GLOSSARY.md) and r49's [GLOSSARY.md](https://github.com/rails49/r49/blob/main/GLOSSARY.md).

## Language

### Calibration

**Native DPT**:
An image's own DPT, from its archive's calibration, before any resampling.

**Minimum DPT**:
The DPT below which a car is too few pixels across for this project's detector to place it reliably. A reader requirement. See [SPEC § Minimum DPT](SPEC.md#minimum-dpt).

### Cars and labels

**Car width**:
The width every car is drawn with, derived from DPT and the standard width. Never stored. See [SPEC § Car width](SPEC.md#car-width-is-derived-from-dpt-never-stored).

**Standard width**:
The prototype width used for every car: the widest real stock. See [SPEC § Car width](SPEC.md#car-width-is-derived-from-dpt-never-stored).

### Occupancy

**Detector**:
The model that finds cars in a frame: an oriented-box YOLO network. See [SPEC § The detector](SPEC.md#the-detector-is-yolo26n-obb).
_Avoid_: sensor, classifier

**Classifier**:
The CNN that judges occupancy at a single point. See [occupancy ADR 0004](https://github.com/rails49/occupancy/blob/main/docs/adr/0004-one-model-in-the-live-path.md).

**Detection**:
One car the detector found: an oriented box, a class and a confidence. See [SPEC § The runtime reports detections](SPEC.md#the-runtime-reports-detections-in-the-callers-frame).

**L0**:
Every car the detector found in a frame, one detection each. See [SPEC § The runtime reports detections](SPEC.md#the-runtime-reports-detections-in-the-callers-frame).

**Phantom**:
A detection where there is no car. See [SPEC § Accuracy](SPEC.md#accuracy).

**Miss**:
A car with no detection. See [SPEC § Accuracy](SPEC.md#accuracy).

**Canvas**:
The fixed square every detector input is padded onto, at a constant DPT. See [ADR 0014](docs/adr/0014-dpt-normalized-input-padded-never-resized.md).

**Tile**:
A canvas-sized piece of a capture larger than the canvas. See [ADR 0014](docs/adr/0014-dpt-normalized-input-padded-never-resized.md).

### Training

**Held-out image**:
An image the detector is never trained on and that never chooses which weights to keep. It only measures a model. The same held-out images measure every model compared against one another.
_Avoid_: test image

**Validation image**:
An image not trained on that chooses which weights to keep during training. Its scores are optimistic, so they never stand as a model's accuracy.
