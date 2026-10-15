# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial monorepo scaffold: `@kimetron/core`, `@kimetron/dom`,
  `@kimetron/react` packages and `drivers/` sample-app area
- `@kimetron/core`: world-coordinate model — real units (mm/cm/m/inch/px),
  `bottom-left`/`top-left` origins, grid snap, scale-based zoom,
  `worldToScreen`/`screenToWorld`, immutable doc ops
- `@kimetron/core`: `Engine` — drag / marquee / middle-drag pan / wheel zoom,
  selection set, commit-on-dragend semantics
- `@kimetron/core`: JSON serialize/deserialize (`schemaVersion`, units and
  origin stored in the document)
- `@kimetron/dom`: input wiring, grid background, object/marquee frames,
  style injection, vanilla `createRenderer`
- `@kimetron/react`: `IsleCanvas`, `useEngine`, `useEngineVersion`
- `drivers/demo` playground: units/origin/grid/snap switching, add/delete,
  JSON save/load, scale + cursor readout
