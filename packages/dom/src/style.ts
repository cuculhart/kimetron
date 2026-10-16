import type { Edge, EdgeMarker, EdgeRoute, Engine, Origin, Port, Pt, ResizeDir, WorldObject } from '@kimetron/core'
import { arcAngles, arcPoint, edgeEndpoints, edgeGeom, formatLength, shapeAnchors, unitToPx } from '@kimetron/core'

export interface Frame {
  left: number
  top: number
  width: number
  height: number
}

const GRID_LINE = 'var(--ki-grid, rgba(40, 60, 80, 0.10))'
const GRID_MAJOR_LINE = 'var(--ki-grid-major, rgba(40, 60, 80, 0.28))'

export function gridBackground(engine: Engine): {
  backgroundImage: string
  backgroundSize: string
  backgroundPosition: string
} {
  const { doc, viewport: vp } = engine
  const s = doc.grid.size * unitToPx(doc.units) * vp.zoom
  const minor =
    `linear-gradient(to right, ${GRID_LINE} 1px, transparent 1px),` +
    `linear-gradient(to bottom, ${GRID_LINE} 1px, transparent 1px)`
  const m = doc.grid.major
  if (m && m > 1) {
    const ms = s * m
    return {
      backgroundImage:
        `linear-gradient(to right, ${GRID_MAJOR_LINE} 1px, transparent 1px),` +
        `linear-gradient(to bottom, ${GRID_MAJOR_LINE} 1px, transparent 1px),` +
        minor,
      backgroundSize: `${ms}px ${ms}px, ${ms}px ${ms}px, ${s}px ${s}px, ${s}px ${s}px`,
      backgroundPosition: `${vp.x}px ${vp.y}px`,
    }
  }
  return {
    backgroundImage: minor,
    backgroundSize: `${s}px ${s}px`,
    backgroundPosition: `${vp.x}px ${vp.y}px`,
  }
}

export function objectFrame(engine: Engine, o: { x: number; y: number; w: number; h: number; id: string }): Frame {
  const { doc, viewport: vp } = engine
  const rr = engine.resize && engine.resize.id === o.id ? { ...o, ...engine.resize.rect } : o
  const d = engine.dragDelta && engine.selectedIds.has(o.id) ? engine.dragDelta : { x: 0, y: 0 }
  const u = unitToPx(doc.units) * vp.zoom
  const corner = {
    x: rr.x + d.x,
    y: doc.origin === 'top-left' ? rr.y + d.y : rr.y + d.y + rr.h,
  }
  const s = engine.worldToScreen(corner)
  return { left: s.x, top: s.y, width: rr.w * u, height: rr.h * u }
}

/** Screen-space frame of the document page rect, or null when unset. */
export function pageFrame(engine: Engine): Frame | null {
  const p = engine.doc.page
  if (!p) return null
  const { doc, viewport: vp } = engine
  const u = unitToPx(doc.units) * vp.zoom
  const corner = { x: p.x, y: doc.origin === 'top-left' ? p.y : p.y + p.h }
  const s = engine.worldToScreen(corner)
  return { left: s.x, top: s.y, width: p.w * u, height: p.h * u }
}

export function marqueeFrame(engine: Engine): Frame | null {
  const r = engine.marquee
  if (!r) return null
  const { doc, viewport: vp } = engine
  const u = unitToPx(doc.units) * vp.zoom
  const corner = { x: r.x, y: doc.origin === 'top-left' ? r.y : r.y + r.h }
  const s = engine.worldToScreen(corner)
  return { left: s.x, top: s.y, width: r.w * u, height: r.h * u }
}

// --- resize handles ---

export type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface HandlePoint {
  dir: HandleDir
  x: number
  y: number
  cursor: string
}

const HANDLE_CURSORS: Record<HandleDir, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}

/** Screen-space anchor points of the 8 resize handles on a frame (px). */
export function handlePoints(f: Frame): HandlePoint[] {
  const cx = f.left + f.width / 2
  const cy = f.top + f.height / 2
  const r = f.left + f.width
  const b = f.top + f.height
  const dirs: [HandleDir, number, number][] = [
    ['nw', f.left, f.top],
    ['n', cx, f.top],
    ['ne', r, f.top],
    ['e', r, cy],
    ['se', r, b],
    ['s', cx, b],
    ['sw', f.left, b],
    ['w', f.left, cy],
  ]
  return dirs.map(([dir, x, y]) => ({ dir, x, y, cursor: HANDLE_CURSORS[dir] }))
}

/**
 * Map a screen-space handle direction to the world-space edges it moves.
 * X is origin-independent; Y flips because 'n' (top of screen) is the
 * max-y edge under bottom-left origin but the min-y edge under top-left.
 */
export function screenDirToWorld(dir: string, origin: Origin): ResizeDir {
  const x = (dir.includes('e') ? 1 : dir.includes('w') ? -1 : 0) as -1 | 0 | 1
  const ys = dir.includes('n') ? 1 : dir.includes('s') ? -1 : 0
  const y = (origin === 'bottom-left' ? ys : -ys) as -1 | 0 | 1
  return { x, y }
}

// --- ports & edges ---

/** Screen-space positions of an object's ports. */
export function portPoints(
  engine: Engine,
  o: { id: string; x: number; y: number; w: number; h: number; ports?: Port[] },
): { port: Port; x: number; y: number }[] {
  return (o.ports ?? []).map((p) => {
    const s = engine.worldToScreen({ x: o.x + p.fx * o.w, y: o.y + p.fy * o.h })
    return { port: p, x: s.x, y: s.y }
  })
}

const SMOOTH_RADIUS_PX = 8
const EDGE_LINE = 'var(--ki-edge-line, #7d8fa3)'
const SEL_COLOR = 'var(--ki-sel, #3a7bd5)'

/** Polyline path with quadratic-rounded corners (screen px). */
function roundedPathD(pts: Pt[], r: number): string {
  if (pts.length < 3) {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const l1 = Math.hypot(b.x - a.x, b.y - a.y)
    const l2 = Math.hypot(c.x - b.x, c.y - b.y)
    if (l1 === 0 || l2 === 0) {
      d += ` L ${b.x} ${b.y}`
      continue
    }
    const rr = Math.min(r, l1 / 2, l2 / 2)
    const p1 = { x: b.x + ((a.x - b.x) / l1) * rr, y: b.y + ((a.y - b.y) / l1) * rr }
    const p2 = { x: b.x + ((c.x - b.x) / l2) * rr, y: b.y + ((c.y - b.y) / l2) * rr }
    d += ` L ${p1.x} ${p1.y} Q ${b.x} ${b.y} ${p2.x} ${p2.y}`
  }
  return d + ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`
}

/** SVG path `d` for a resolved world-space route. */
export function routePathD(
  engine: Engine,
  from: Pt,
  to: Pt,
  route: EdgeRoute = 'straight',
): string {
  const g = edgeGeom(from, to, route)
  if (g.kind === 'bezier') {
    const [p0, c1, c2, p3] = g.pts.map((p) => engine.worldToScreen(p))
    return `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p3.x} ${p3.y}`
  }
  const pts = g.pts.map((p) => engine.worldToScreen(p))
  if (route === 'smoothstep') return roundedPathD(pts, SMOOTH_RADIUS_PX)
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}

/** SVG path `d` for a document edge, or null if an endpoint is dangling. */
export function edgePathD(engine: Engine, e: Edge): string | null {
  const ends = edgeEndpoints(engine.doc, e)
  if (!ends) return null
  return routePathD(engine, ends.from, ends.to, e.route)
}

/** Marker element id for an edge endpoint. */
export function markerId(e: Edge, end: 'start' | 'end'): string {
  return `ki-m-${e.id}-${end}`
}

/** Presentation attributes for rendering an edge path (`<path>` attrs). */
export interface EdgeAttrs {
  d: string
  stroke?: string
  strokeWidth?: number
  strokeDasharray?: string
  markerStart?: string
  markerEnd?: string
  double?: boolean
}

export function edgeAttrs(engine: Engine, e: Edge): EdgeAttrs | null {
  const d = edgePathD(engine, e)
  if (!d) return null
  return {
    d,
    stroke: e.style?.color,
    strokeWidth: e.style?.width,
    strokeDasharray: e.style?.dash?.join(' '),
    markerStart: e.markerStart ? `url(#${markerId(e, 'start')})` : undefined,
    markerEnd: e.markerEnd ? `url(#${markerId(e, 'end')})` : undefined,
    double: e.style?.double,
  }
}

/** Inner stroke color of double lines (the paper color). */
export const DOUBLE_INNER = 'var(--ki-bg, #fff)'

/** Double-stroke widths: outer rail = color, inner channel = bg. */
export function doubleWidths(width?: number): { outer: number; inner: number } {
  const outer = width ?? 4
  return { outer, inner: Math.max(0.8, outer - 2.2) }
}

// --- shape kinds (line / curve / ellipse / arc) ---

const SHAPE_LINE = 'var(--ki-edge, #7d8fa3)'

/** Marker element id for a shape cap. */
export function shapeCapMarkerId(o: WorldObject, end: 's' | 'e'): string {
  return `ki-mo-${o.id}-${end}`
}

/** SVG path `d` (frame-local px) for a shape object, or null. */
export function shapePathD(engine: Engine, o: WorldObject): string | null {
  const f = objectFrame(engine, o)
  const rr =
    engine.resize && engine.resize.id === o.id
      ? { ...o, ...engine.resize.rect }
      : o
  const d0 =
    engine.dragDelta && engine.selectedIds.has(o.id)
      ? engine.dragDelta
      : { x: 0, y: 0 }
  const eff = { x: rr.x + d0.x, y: rr.y + d0.y, w: rr.w, h: rr.h }
  const toLocal = (w: Pt): Pt => {
    const s = engine.worldToScreen(w)
    return { x: s.x - f.left, y: s.y - f.top }
  }
  const fmt = (p: Pt) => `${p.x} ${p.y}`

  if (o.kind === 'line' || o.kind === 'curve') {
    const pts = shapeAnchors(o).map((a) =>
      toLocal({ x: eff.x + a.fx * eff.w, y: eff.y + a.fy * eff.h }),
    )
    if (pts.length < 2) return null
    if (o.kind === 'curve' && pts.length > 2) {
      let d = `M ${fmt(pts[0])}`
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)]
        const p1 = pts[i]
        const p2 = pts[i + 1]
        const p3 = pts[Math.min(pts.length - 1, i + 2)]
        const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
        const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
        d += ` C ${fmt(c1)} ${fmt(c2)} ${fmt(p2)}`
      }
      return d
    }
    return `M ${fmt(pts[0])} ${pts.slice(1).map((p) => `L ${fmt(p)}`).join(' ')}`
  }

  const rx = f.width / 2
  const ry = f.height / 2
  const cx = f.width / 2
  const cy = f.height / 2
  if (o.kind === 'ellipse') {
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} Z`
  }
  if (o.kind === 'arc') {
    const { a0, delta } = arcAngles(o)
    const p0 = toLocal(arcPoint(eff, a0))
    const p1 = toLocal(arcPoint(eff, a0 + delta))
    // world CCW sweeps clockwise on screen under top-left origin
    const sweep = engine.doc.origin === 'top-left' ? 1 : 0
    const pie = !!o.style?.fill
    const head = pie ? `M ${cx} ${cy} L ${fmt(p0)}` : `M ${fmt(p0)}`
    if (delta === 360) {
      const pm = toLocal(arcPoint(eff, a0 + 180))
      const arcs = `A ${rx} ${ry} 0 1 ${sweep} ${fmt(pm)} A ${rx} ${ry} 0 1 ${sweep} ${fmt(p0)}`
      return pie ? `${head} ${arcs} Z` : `${head} ${arcs}`
    }
    const seg = `A ${rx} ${ry} 0 ${delta > 180 ? 1 : 0} ${sweep} ${fmt(p1)}`
    return pie ? `${head} ${seg} Z` : `${head} ${seg}`
  }
  return null
}

/** Presentation attributes for a shape object's inner `<path>`. */
export interface ShapeAttrs {
  d: string
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeDasharray?: string
  markerStart?: string
  markerEnd?: string
  double?: boolean
}

export function shapeAttrs(engine: Engine, o: WorldObject): ShapeAttrs | null {
  const d = shapePathD(engine, o)
  if (!d) return null
  const sel = engine.selectedIds.has(o.id)
  return {
    d,
    fill:
      o.kind === 'ellipse' || o.kind === 'arc'
        ? (o.style?.fill ?? 'none')
        : 'none',
    stroke: sel ? SEL_COLOR : (o.style?.stroke ?? SHAPE_LINE),
    strokeWidth: o.style?.width,
    strokeDasharray: o.style?.dash?.join(' '),
    markerStart: o.style?.capStart ? `url(#${shapeCapMarkerId(o, 's')})` : undefined,
    markerEnd: o.style?.capEnd ? `url(#${shapeCapMarkerId(o, 'e')})` : undefined,
    double: o.style?.double,
  }
}

/** Drag/resize HUD readout (world units), or null when idle. */
export function hudText(engine: Engine): string | null {
  const u = engine.doc.units
  if (engine.resize) {
    const r = engine.resize.rect
    return `${formatLength(r.w, u)} × ${formatLength(r.h, u)} @ ${formatLength(r.x, u)}, ${formatLength(r.y, u)}`
  }
  if (engine.dragDelta) {
    const b = engine.selectionBounds()
    if (!b) return null
    const d = engine.dragDelta
    return `${formatLength(b.x + d.x, u)}, ${formatLength(b.y + d.y, u)} (${formatLength(b.w, u)} × ${formatLength(b.h, u)})`
  }
  return null
}

/** A `<marker>` def needed by an edge or a shape cap: id, glyph kind, resolved color. */
export interface EdgeMarkerDef {
  id: string
  kind: EdgeMarker
  color: string
}

export function edgeMarkerDefs(engine: Engine, e: Edge): EdgeMarkerDef[] {
  const color = engine.selectedIds.has(e.id) ? SEL_COLOR : (e.style?.color ?? EDGE_LINE)
  const defs: EdgeMarkerDef[] = []
  if (e.markerStart) defs.push({ id: markerId(e, 'start'), kind: e.markerStart, color })
  if (e.markerEnd) defs.push({ id: markerId(e, 'end'), kind: e.markerEnd, color })
  return defs
}

/** `<marker>` defs needed by a shape object's caps. */
export function shapeCapMarkerDefs(engine: Engine, o: WorldObject): EdgeMarkerDef[] {
  const color = engine.selectedIds.has(o.id)
    ? SEL_COLOR
    : (o.style?.stroke ?? SHAPE_LINE)
  const defs: EdgeMarkerDef[] = []
  if (o.style?.capStart)
    defs.push({ id: shapeCapMarkerId(o, 's'), kind: o.style.capStart, color })
  if (o.style?.capEnd)
    defs.push({ id: shapeCapMarkerId(o, 'e'), kind: o.style.capEnd, color })
  return defs
}

let injected = false

export function injectStyles(): void {
  if (injected || typeof document === 'undefined') return
  injected = true
  const el = document.createElement('style')
  el.dataset.kimetron = ''
  el.textContent = `
.ki-canvas { position: relative; overflow: hidden; touch-action: none; user-select: none; cursor: default; }
.ki-obj { position: absolute; left: 0; top: 0; box-sizing: border-box; border: 1px solid var(--ki-edge, #7d8fa3); background: var(--ki-fill, rgba(125, 143, 163, 0.18)); overflow: hidden; }
.ki-obj.ki-sel { border-color: var(--ki-sel, #3a7bd5); box-shadow: 0 0 0 1px var(--ki-sel, #3a7bd5); }
.ki-obj.ki-invalid { border-color: var(--ki-danger, #d33); box-shadow: 0 0 0 2px var(--ki-danger, #d33); }
.ki-obj.ki-shape.ki-invalid { border: 1px dashed var(--ki-danger, #d33); box-shadow: none; }
.ki-marquee { position: absolute; left: 0; top: 0; border: 1px dashed var(--ki-sel, #3a7bd5); background: rgba(58, 123, 213, 0.08); pointer-events: none; }
.ki-handle { position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px; background: #fff; border: 1px solid var(--ki-sel, #3a7bd5); box-sizing: border-box; z-index: 10; }
.ki-handle[hidden] { display: none; }
.ki-guides { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.ki-guide { position: absolute; background: var(--ki-guide, #e0393e); }
.ki-guide-v { top: 0; bottom: 0; width: 1px; }
.ki-guide-h { left: 0; right: 0; height: 1px; }
.ki-edges { position: absolute; inset: 0; overflow: visible; pointer-events: none; z-index: 0; }
.ki-edge { fill: none; stroke: var(--ki-edge-line, #7d8fa3); stroke-width: 1.5; }
.ki-edge.ki-sel { stroke: var(--ki-sel, #3a7bd5); stroke-width: 2.5; }
.ki-edge-preview { fill: none; stroke: var(--ki-sel, #3a7bd5); stroke-width: 1.5; stroke-dasharray: 4 3; }
.ki-edge-preview.ki-invalid { stroke: var(--ki-danger, #d33); }
.ki-obj { z-index: 1; }
.ki-ports { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
.ki-port { position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%; background: #fff; border: 1.5px solid var(--ki-edge-line, #7d8fa3); box-sizing: border-box; cursor: crosshair; pointer-events: auto; }
.ki-port:hover { border-color: var(--ki-sel, #3a7bd5); background: var(--ki-sel, #3a7bd5); }
.ki-obj.ki-shape { border: none; background: transparent; overflow: visible; pointer-events: none; }
.ki-obj.ki-shape.ki-sel { border: 1px dashed var(--ki-sel, #3a7bd5); box-shadow: none; }
.ki-shape-svg { position: absolute; left: 0; top: 0; overflow: visible; }
.ki-shape { fill: none; }
.ki-page { position: absolute; left: 0; top: 0; background: var(--ki-page, #fff); border: 1px solid var(--ki-page-border, #b8c4d0); box-shadow: 0 1px 4px rgba(0,0,0,0.08); z-index: 0; pointer-events: none; }
.ki-hud { position: absolute; top: 8px; right: 8px; padding: 2px 8px; font: 11px/1.4 ui-monospace, monospace; background: rgba(28,39,51,0.85); color: #fff; border-radius: 4px; pointer-events: none; z-index: 20; }
`
  document.head.appendChild(el)
}
