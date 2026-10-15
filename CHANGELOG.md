# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-16

### Added

- `@kimetron/core`: resize gesture — 8 screen-space handles on a single
  selection, fixed opposite corner/edge, commit on pointerUp
  (`engine.startResize`, `resizeObject`)
- `@kimetron/core`: object snapping — moving edges/centers snap to other
  objects' edges/centers during drag and resize, prioritized over grid snap,
  with visible alignment guides (`engine.guides`)
- `@kimetron/core`: undo/redo via document snapshots
  (`undo`/`redo`/`canUndo`/`canRedo`, commit-only history, cap 100)
- `@kimetron/core`: z-order ops (`reorderSelected` — front/back/forward/
  backward) and `duplicateSelected` (grid-step offset copy, fresh ids)
- `@kimetron/core`: `panBy(dx, dy)` viewport pan
- `@kimetron/dom`: resize handles (`data-ki-handle`), guide layer,
  `.ki-handle`/`.ki-guide` styles; wheel routing — trackpad scroll pans,
  Ctrl/pinch zooms, plain wheel still zooms
- `drivers/demo`: undo/redo/duplicate/front/back buttons and keyboard
  shortcuts (Ctrl+Z/Y, Ctrl+D)

## [0.1.0] - 2026-10-15


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
  JSON save/load, scale + cursor readout, no-React `vanilla.html` page
