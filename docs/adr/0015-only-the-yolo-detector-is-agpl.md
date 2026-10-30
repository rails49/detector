# Only the YOLO detector is AGPL

Supersedes [ADR 0003](0003-agpl-because-the-detector-is-fine-tuned-from-agpl-weights.md).

This repository stays AGPL-3.0: its weights are fine-tuned from an AGPL Ultralytics checkpoint, its training runs on Ultralytics, and its browser runtime mirrors Ultralytics' preprocessing. Everything else in rails49 is MIT, including rails49/occupancy, which serves this package's weights, and rails49/classifier. CommandStation-EX stays GPL-3, as a fork of DCC-EX.

ADR 0003 rejected MIT code beside AGPL weights because both are served from one site as one product. The AGPL does not require that. It requires that users of the deployed site can get the source of the AGPL parts, which the site meets by linking here. MIT code can be combined with AGPL code; the MIT files keep their licence. Keeping everything AGPL would have bound the classifier and the editor, which use nothing from Ultralytics, to the detector's terms.

Bernhard Boser is the only author of the repositories being relicensed. Releases made before the change stay AGPL.

Decided in [rails49/occupancy#272](https://github.com/rails49/occupancy/issues/272).
