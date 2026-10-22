# detector

The detector side of [rails49 occupancy](https://github.com/rails49/occupancy): car labels are turned into training data, a detector is trained on them, and a browser runtime runs it. Terms this repository uses but does not own are in occupancy's [GLOSSARY.md](https://github.com/rails49/occupancy/blob/main/GLOSSARY.md) and r49's [GLOSSARY.md](https://github.com/rails49/r49/blob/main/GLOSSARY.md).

## Language

### Calibration

**Minimum DPT**:
The DPT below which images are too coarse for this project's detector to train on. A reader requirement. See [SPEC § The minimum DPT is 20](SPEC.md#the-minimum-dpt-is-20).

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
Every detection in a frame, as the detector emitted it. See [SPEC § The runtime reports detections](SPEC.md#the-runtime-reports-detections-in-the-callers-frame).

**Phantom**:
A detection where there is no car. See [SPEC § Accuracy](SPEC.md#accuracy).

**Miss**:
A car with no detection. See [SPEC § Accuracy](SPEC.md#accuracy).

**Canvas**:
The fixed square every detector input is padded onto, at a constant DPT. See [ADR 0014](docs/adr/0014-dpt-normalized-input-padded-never-resized.md).

**Tile**:
A canvas-sized piece of a capture larger than the canvas. See [ADR 0014](docs/adr/0014-dpt-normalized-input-padded-never-resized.md).
