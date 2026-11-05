# rails49-detector

The [rails49 occupancy](https://github.com/rails49/occupancy) detector's runtime
in Python, with no Torch. Given a frame and its DPT, it returns L0: every car the
model found, in that frame's pixels.

Warning: the detector sometimes misses rolling stock and sometimes reports
trains where there are none. It is not a safety interlock. Responsibility for
safe operation rests with the user.

```python
from detector import Detector

detector = Detector("detector.onnx")
for car in detector.detect(frame, dpt):  # frame: height × width × RGB, uint8
    print(car["centre"], car["length"], car["angle"], car["class"], car["confidence"])

detector.car_width_px(dpt)
```

The wheel holds no model. A model is an ONNX file with a JSON file of the same stem
beside it, attached to the GitHub Release of
[rails49/detector](https://github.com/rails49/detector) that made it.

The engine is onnxruntime by default. For OpenVINO, install
`rails49-detector[openvino]` and pass the engine and a device name:

```python
Detector("detector.onnx", engine="openvino", device="GPU")
```

`SPEC.md` in the repository has the requirements.

## License

AGPL-3.0-only, because the detector is fine-tuned from
[Ultralytics YOLO](https://github.com/ultralytics/ultralytics) weights. See the
repository's
[ADR 0015](https://github.com/rails49/detector/blob/main/docs/adr/0015-only-the-yolo-detector-is-agpl.md).
