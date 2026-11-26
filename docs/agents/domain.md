# Domain docs

How the skills use a repository's domain docs is the organisation's
[domain.md](https://github.com/rails49/.github/blob/main/docs/agents/domain.md). This file holds what detector adds.

The UI, L1 and drift are in [rails49/occupancy](https://github.com/rails49/occupancy), whose docs own their terms and decisions. [ADR 0001](../adr/0001-glossary-and-adrs-alongside-the-spec.md) adds `SPEC.md` for the requirements.

Each repository keeps its own wayfinder maps (label `wayfinder:map`). Here, #2 is the accuracy campaign. The closed maps in rails49/occupancy and their tickets hold the alternatives rejected before the split. An ADR links them rather than restating them.

## Before exploring, also read `SPEC.md`

`SPEC.md` says what the area must do. It describes the target, not what ships. Parts of it are unbuilt, and it says so where that is the case. Where the spec and the code disagree, that gap is the planned migration, not a bug to fix. `docs/SYSTEM.md` describes what exists today.

## The glossary and settled decisions

The terms have moved before: use a term as `GLOSSARY.md` defines it, and add a missing term to `GLOSSARY.md`.

A decision with no ADR yet may still be settled in a closed issue or in `SPEC.md`; cite that instead.
