# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-10-16

### Added

- `@kimetron/core`: edges and ports — `Doc.edges`, `Port` (normalized
  `fx`/`fy` fractions of object size, tracking resizes automatically),
  `Edge` as pure reference data (from/to endpoints,
  `route`, `label`); `schemaVersion: 2` with tolerant reading of v1 docs;
  `removeObjects` prunes referencing edges (no orphans)
- `@kimetron/core`: edge routes — straight / orthogonal / bezier geometry
  (`edgeGeom`), polyline hit-testing (`distToGeom`)
- `@kimetron/core`: connect gesture — `startConnect` port-to-port drag,
  port snapping, self-connect rejection, live preview (`connectPreview`);
  `engine.connectRoute` picks the route of new edges
- `@kimetron/core`: edge selection — `edgeAt` hit test, edges share
  `selectedIds`, Delete removes selected objects and edges
- `@kimetron/dom`: SVG edge layer (`.ki-edges`), port dots (`.ki-port`,
  `data-ki-port` input), dashed connect preview, `.ki-edge` styles
- `drivers/demo`: 4-port rectangles, route switcher, edge count,
  connect gesture in the playground and vanilla page

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
