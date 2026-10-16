# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-10-16

### Added

- `@kimetron/core`: `WorldObject.rot` — rotation in world CCW degrees
  about the bbox center (`x/y/w/h` stay the unrotated box). Geometry
  helpers `rotPt`/`invRotPt`/`objCenter`/`objPoint`/`obbOf`/`aabbOf`/
  `rectPoly`/`polysIntersect` (SAT); `rotateObject` doc op
- `@kimetron/core`: rotation-aware engine — hit-test inverse-rotates
  the query point (shape kinds included), `collisions`/marquee use the
  OBB via SAT (edge-touching still legal), snap targets include rotated
  vertices/edge midpoints/center, ports and edge endpoints resolve
  through rotation, `selectionBounds` is the rotated AABB
- `@kimetron/core`: rotate gesture — `startRotate(pt, id)` +
  `engine.rotate` preview, committed on pointerUp; `rotateSnapDeg`
  (default 15) applies while `pointerMove`'s `angleSnap` opt is held
  (Shift). Resizing a rotated object works in its local axes; the
  center-pivot convention means the opposite corner drifts in world
- `@kimetron/dom`/`@kimetron/react`: objects render with
  `rotate()` appended to their translate; `handlePointsFor` puts the 8
  resize handles on the rotated corners with angle-aware cursors;
  `.ki-rot` rotate handle (`data-ki-rotate`) above the selected object;
  HUD shows degrees while rotating; `screenRotDeg` helper
- `drivers/plan`: a 45° diagonal partition wall (+斜め壁 spawn button),
  a rotated chair, and a compass object proving rot rides selection,
  handles, snap and collision; canvas inset under the rulers so
  content can't hide beneath them; startup scale 1:20

## [0.8.0] - 2026-10-16

### Added

- `@kimetron/dom`: `rulerTicks(engine, axis, spanPx)` — world-unit
  ruler tick marks with automatic "nice" step selection and major
  labels (CAD ruler overlay primitive)
- `drivers/plan`: canvas-edge rulers (top/left), `dim` kind objects
  (extension lines, double-arrow dimension line, live mm text,
  own-span measurement; spawn matched to the selection's span via
  +H寸法/+V寸法), wall core lines (壁芯 — dash-dot on the long axis;
  dims snap onto cores via existing center snap), and architectural
  area readouts derived from the wall layout — 敷地 (site) /
  建築 (outer-face envelope) / 床壁芯 (core-line) / 床内法
  (inner-face), minus interior partitions; wall area nets out door
  openings

## [0.7.0] - 2026-10-16

### Added

- `@kimetron/core`: `WorldObject.solid` — objects with occupancy; two
  solids may not overlap (edge-touching is legal). `collisionMode`
  (`'none'`/`'flag'`/`'reject'`, default `'none'`) and the
  `engine.canOverlap` pair exception hook; `dragInvalid` marks
  colliding gestures. `engine.collisions(rect)` query
- `@kimetron/core`: `WorldObject.layer` — category layer ordering
  (render = layer asc, then array order; hit-test walks the reverse);
  `renderOrder()` helper; `Doc.grid.major` — every Nth grid cell
- `@kimetron/dom`/`@kimetron/react`: major grid lines render bold;
  colliding drag/resize previews show a danger outline
- `drivers/plan`: floor-plan spike — 10 mm grid with 100 mm major
  lines, thickness×length walls with "|-" T junctions, solid
  furniture rejected on walls, doors allowed on walls via
  `canOverlap`

## [0.6.0] - 2026-10-16

### Added

- `@kimetron/core`: `WorldObject.locked` (selectable but not
  movable/resizable/removable) and `WorldObject.group` (dragging one
  member drags the whole group; Alt+drag detaches; marquee selection
  expands to groups)
- `@kimetron/core`: `Doc.page` — a world-space paper frame; its edges
  join snap targets automatically, plus `engine.snapExtra` for
  app-injected snap candidates
- `@kimetron/core`: `engine.connectReplace` hook — edges it returns
  are removed in the same commit as a new connection (one-wire-per-
  input replace semantics); `rectContains`/`rectOverlapArea` helpers
- `@kimetron/core`: `EdgeStyle`/`WorldObjectStyle` `double` flag for
  double-stroke lines; `engine.selectionBounds()`
- `@kimetron/dom`/`@kimetron/react`: `doc.page` renders as a backmost
  paper frame; double strokes draw two rails; a HUD chip shows
  position/size readouts while dragging or resizing
- `drivers/sethera`: locked piece, grouped pair, page frame,
  replace-on-occupied-input wiring, double rule — the remaining
  sethera migration features

## [0.5.0] - 2026-10-16

### Added

- `@kimetron/core`: shape kinds — `line` (chord across the bbox),
  `curve` (open Catmull-Rom through normalized anchors),
  `ellipse` (inscribed in the bbox), `arc` (sweep of the inscribed
  ellipse, `shape.a0`/`a1` in world degrees, `a0===a1` = full ring).
  `ObjectShape`/`ShapePoint` types; kind-aware `hitObject` (lines hit
  on the stroke only, unfilled ellipses on the ring); shape anchors
  join object-snap targets; `shape` serialized (schemaVersion 2)
- `@kimetron/core`: `WorldObjectStyle` gains `width`/`dash`/
  `capStart`/`capEnd` (`'arrow'` | `'dot'`) for shape strokes
- `@kimetron/dom`/`@kimetron/react`: shape kinds render as an inline
  `<svg>` inside the object frame (z-order preserved); caps reuse the
  edge `<marker>` machinery; selection shows a dashed bbox
- `drivers/sethera`: sethera-piece migration spike — pieces, Σ zone
  aggregation, calc wiring with directed `out`→`a`/`b` ports via
  `canConnect`, plus a line/ellipse/arc/curve shape gallery

## [0.4.0] - 2026-10-16

### Added

- `@kimetron/core`: edge/object styling as data — `Edge.style`
  (`color`, `width` in screen px, `dash`), `Edge.markerStart` /
  `markerEnd` (`'arrow'` | `'dot'`), `WorldObject.style`
  (`fill`, `stroke`); all serialized with the document
- `@kimetron/core`: new route `smoothstep` (orthogonal geometry,
  rounded corners at render), `engine.canConnect` policy hook
  (rejects commit and flags `connect.invalid`), `engine.connectEdge`
  defaults stamped onto gesture-created edges
- `@kimetron/dom`/`@kimetron/react`: edge rendering maps style to
  stroke attributes, generates SVG `<marker>` defs per edge,
  smoothstep corner rounding; object `style` maps to fill/border;
  invalid connect preview styling
- `drivers/` is now a multi-page app (launcher + demo + vanilla +
  `plesfeda` spike with derived WBS layout, hierarchy/dependency
  edge semantics, h/v orientation toggle)

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
