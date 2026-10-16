import {
  addEdge,
  addObject,
  createDocument,
  edgeEndpoints,
  endpointPos,
  moveObjects,
  removeEdges,
  removeObjects,
  reorderObjects,
  resizeObject,
  type ZOrder,
} from './doc'
import { distToGeom, edgeGeom } from './edge'
import {
  pointInRect,
  rectBetween,
  rectOf,
  rectsIntersect,
  screenToWorld,
  worldToScreen,
} from './geometry'
import type { Doc, Edge, EdgeEndpoint, EdgeRoute, GridConfig, Origin, Pt, Rect, Unit, Viewport, WorldConfig, WorldObject } from './types'
import { formatScale, unitToPx } from './units'

type Mode = 'idle' | 'drag' | 'marquee' | 'pan' | 'resize' | 'connect'

export interface PointerOpts {
  button?: number
  additive?: boolean
}

/** Which world-space edges a resize handle moves: -1 = min edge, +1 = max edge, 0 = untouched. */
export interface ResizeDir {
  x: -1 | 0 | 1
  y: -1 | 0 | 1
}

export type EngineListener = (engine: Engine) => void

/** A world-space alignment line shown while dragging/resizing. axis 'x' = vertical line at x=at. */
export interface Guide {
  axis: 'x' | 'y'
  at: number
}

const ZOOM_MIN = 0.02
const ZOOM_MAX = 50
const MIN_SIZE = 1e-3
const SNAP_TOL_PX = 8
const PORT_TOL_PX = 10
const EDGE_TOL_PX = 6

export class Engine {
  doc: Doc
  viewport: Viewport = { x: 40, y: 40, zoom: 1 }
  readonly selectedIds = new Set<string>()
  dragDelta: Pt | null = null
  resize: { id: string; rect: Rect } | null = null
  guides: Guide[] = []
  /** In-progress connect gesture: source endpoint and hovered target (if any). */
  connect: { from: EdgeEndpoint; hover: EdgeEndpoint | null } | null = null
  /** Route assigned to edges created by the connect gesture. */
  connectRoute: Edge['route'] = 'straight'
  marquee: Rect | null = null
  cursorWorld: Pt = { x: 0, y: 0 }
  version = 0

  private mode: Mode = 'idle'
  private start: Pt = { x: 0, y: 0 }
  private startWorld: Pt = { x: 0, y: 0 }
  private vpStart: Viewport | null = null
  private dragIds: string[] = []
  private dragAnchor: Pt = { x: 0, y: 0 }
  private dragAnchorSize: { w: number; h: number } = { w: 0, h: 0 }
  private resizeId: string | null = null
  private resizeDir: ResizeDir = { x: 0, y: 0 }
  private resizeOrig: Rect | null = null
  private listeners = new Set<EngineListener>()
  private docListeners = new Set<(doc: Doc) => void>()
  private selectionListeners = new Set<(ids: ReadonlySet<string>) => void>()
  private past: Doc[] = []
  private future: Doc[] = []
  private lastDoc: Doc | null = null

  constructor(cfg: WorldConfig = {}, objects: WorldObject[] = []) {
    this.doc = { ...createDocument(cfg), objects }
    this.lastDoc = this.doc
  }

  subscribe(fn: EngineListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  onDocChange(fn: (doc: Doc) => void): () => void {
    this.docListeners.add(fn)
    return () => this.docListeners.delete(fn)
  }

  onSelectionChange(fn: (ids: ReadonlySet<string>) => void): () => void {
    this.selectionListeners.add(fn)
    return () => this.selectionListeners.delete(fn)
  }

  private emit(): void {
    this.version++
    for (const fn of this.listeners) fn(this)
  }

  private emitDoc(): void {
    if (this.lastDoc && this.lastDoc !== this.doc) {
      this.past.push(this.lastDoc)
      if (this.past.length > 100) this.past.shift()
      this.future = []
    }
    this.lastDoc = this.doc
    for (const fn of this.docListeners) fn(this.doc)
    this.emit()
  }

  private emitSelection(): void {
    for (const fn of this.selectionListeners) fn(this.selectedIds)
    this.emit()
  }

  // --- config (doc-level, serialized with the document) ---

  setUnits(units: Unit): void {
    if (this.doc.units === units) return
    this.doc = { ...this.doc, units }
    this.emitDoc()
  }

  setOrigin(origin: Origin): void {
    if (this.doc.origin === origin) return
    this.doc = { ...this.doc, origin }
    this.emitDoc()
  }

  setGrid(grid: Partial<GridConfig>): void {
    this.doc = { ...this.doc, grid: { ...this.doc.grid, ...grid } }
    this.emitDoc()
  }

  // --- transforms ---

  worldToScreen(p: Pt): Pt {
    return worldToScreen(p, this.doc, this.viewport)
  }

  screenToWorld(p: Pt): Pt {
    return screenToWorld(p, this.doc, this.viewport)
  }

  scaleText(): string {
    return formatScale(this.viewport.zoom)
  }

  /** Place the world origin inside the visible canvas. */
  placeOrigin(bounds: { w: number; h: number }, margin = 40): void {
    this.viewport = {
      x: margin,
      y: this.doc.origin === 'bottom-left' ? bounds.h - margin : margin,
      zoom: 1,
    }
    this.emit()
  }

  // --- document ops ---

  /** Replace the whole document (e.g. file load). Counts as one undoable commit. */
  setDoc(doc: Doc): void {
    this.doc = doc
    for (const id of [...this.selectedIds]) {
      if (
        !doc.objects.some((o) => o.id === id) &&
        !doc.edges.some((e) => e.id === id)
      ) {
        this.selectedIds.delete(id)
      }
    }
    this.emitDoc()
  }

  // --- undo / redo (document commits only) ---

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  undo(): void {
    const prev = this.past.pop()
    if (!prev) return
    this.future.push(this.doc)
    this.applyDoc(prev)
  }

  redo(): void {
    const next = this.future.pop()
    if (!next) return
    this.past.push(this.doc)
    this.applyDoc(next)
  }

  private applyDoc(doc: Doc): void {
    this.doc = doc
    this.lastDoc = doc
    let selChanged = false
    for (const id of [...this.selectedIds]) {
      if (
        !doc.objects.some((o) => o.id === id) &&
        !doc.edges.some((e) => e.id === id)
      ) {
        this.selectedIds.delete(id)
        selChanged = true
      }
    }
    for (const fn of this.docListeners) fn(this.doc)
    if (selChanged) for (const fn of this.selectionListeners) fn(this.selectedIds)
    this.emit()
  }

  addObject(o: WorldObject): void {
    this.doc = addObject(this.doc, o)
    this.emitDoc()
  }

  moveSelectedBy(dx: number, dy: number): void {
    this.doc = moveObjects(this.doc, this.selectedIds, dx, dy)
    this.emitDoc()
  }

  removeSelected(): void {
    if (this.selectedIds.size === 0) return
    const objIds = [...this.selectedIds].filter((id) =>
      this.doc.objects.some((o) => o.id === id),
    )
    const edgeIds = [...this.selectedIds].filter((id) =>
      this.doc.edges.some((e) => e.id === id),
    )
    this.doc = removeEdges(removeObjects(this.doc, objIds), edgeIds)
    this.selectedIds.clear()
    this.emitDoc()
    this.emitSelection()
  }

  /** Move the selected objects in z-order (array order = render order, last = top). */
  reorderSelected(op: ZOrder): void {
    if (this.selectedIds.size === 0) return
    this.doc = reorderObjects(this.doc, this.selectedIds, op)
    this.emitDoc()
  }

  /** Duplicate the selection, offset by one grid step, and select the copies. */
  duplicateSelected(): void {
    if (this.selectedIds.size === 0) return
    const step = this.doc.grid.size > 0 ? this.doc.grid.size : 10
    const ids = new Set(this.doc.objects.map((o) => o.id))
    const fresh = (base: string) => {
      let n = 1
      let id = `${base}-copy`
      while (ids.has(id)) id = `${base}-copy${++n}`
      ids.add(id)
      return id
    }
    const copies = this.doc.objects
      .filter((o) => this.selectedIds.has(o.id))
      .map((o) => ({ ...o, id: fresh(o.id), x: o.x + step, y: o.y + step }))
    this.doc = { ...this.doc, objects: [...this.doc.objects, ...copies] }
    this.emitDoc()
    this.setSelection(copies.map((o) => o.id))
  }

  setSelection(ids: Iterable<string>): void {
    this.selectedIds.clear()
    for (const id of ids) this.selectedIds.add(id)
    this.emitSelection()
  }

  // --- hit test ---

  objectAt(screenPt: Pt): WorldObject | null {
    const w = this.screenToWorld(screenPt)
    for (let i = this.doc.objects.length - 1; i >= 0; i--) {
      const o = this.doc.objects[i]
      if (pointInRect(w, rectOf(o))) return o
    }
    return null
  }

  /** Nearest port to a screen point within PORT_TOL_PX, as an edge endpoint. */
  portAt(screenPt: Pt): EdgeEndpoint | null {
    const w = this.screenToWorld(screenPt)
    const tol = PORT_TOL_PX / (unitToPx(this.doc.units) * this.viewport.zoom)
    let best: EdgeEndpoint | null = null
    let bd = tol
    for (const o of this.doc.objects) {
      for (const p of o.ports ?? []) {
        const d = Math.hypot(o.x + p.fx * o.w - w.x, o.y + p.fy * o.h - w.y)
        if (d <= bd) {
          bd = d
          best = { obj: o.id, port: p.id }
        }
      }
    }
    return best
  }

  /** Nearest edge to a screen point within EDGE_TOL_PX. */
  edgeAt(screenPt: Pt): Edge | null {
    const w = this.screenToWorld(screenPt)
    const tol = EDGE_TOL_PX / (unitToPx(this.doc.units) * this.viewport.zoom)
    let best: Edge | null = null
    let bd = tol
    for (const e of this.doc.edges) {
      const ends = edgeEndpoints(this.doc, e)
      if (!ends) continue
      const d = distToGeom(w, edgeGeom(ends.from, ends.to, e.route))
      if (d <= bd) {
        bd = d
        best = e
      }
    }
    return best
  }

  /** Begin a connect gesture from a port (or object center if port omitted). */
  startConnect(pt: Pt, obj: string, port?: string): void {
    const o = this.doc.objects.find((o) => o.id === obj)
    if (!o) return
    this.mode = 'connect'
    this.connect = { from: port ? { obj, port } : { obj }, hover: null }
    this.cursorWorld = this.screenToWorld(pt)
  }

  /** Points for the live connect preview, or null. */
  connectPreview(): { from: Pt; to: Pt } | null {
    if (!this.connect) return null
    const from = endpointPos(this.doc, this.connect.from)
    if (!from) return null
    const hover = this.connect.hover
      ? endpointPos(this.doc, this.connect.hover)
      : null
    return { from, to: hover ?? this.cursorWorld }
  }

  private nextEdgeId(): string {
    let n = 0
    for (const e of this.doc.edges) {
      const m = /^e(\d+)$/.exec(e.id)
      if (m) n = Math.max(n, Number(m[1]))
    }
    return `e${n + 1}`
  }

  // --- input (screen px, canvas-relative) ---

  /** Begin a resize gesture on `id`, moving the world-space edges given by `dir`. */
  startResize(pt: Pt, id: string, dir: ResizeDir): void {
    const o = this.doc.objects.find((o) => o.id === id)
    if (!o || (dir.x === 0 && dir.y === 0)) return
    this.mode = 'resize'
    this.resizeId = id
    this.resizeDir = dir
    this.resizeOrig = { x: o.x, y: o.y, w: o.w, h: o.h }
    this.cursorWorld = this.screenToWorld(pt)
  }

  pointerDown(pt: Pt, opts: PointerOpts = {}): void {
    this.start = pt
    this.startWorld = this.screenToWorld(pt)
    this.cursorWorld = this.startWorld

    if (opts.button === 1) {
      this.mode = 'pan'
      this.vpStart = { ...this.viewport }
      return
    }
    if (opts.button !== undefined && opts.button !== 0) return

    const hit = this.objectAt(pt)
    if (hit) {
      if (opts.additive) {
        if (this.selectedIds.has(hit.id)) this.selectedIds.delete(hit.id)
        else this.selectedIds.add(hit.id)
        this.emitSelection()
        return
      }
      if (!this.selectedIds.has(hit.id)) this.setSelection([hit.id])
      this.dragIds = [...this.selectedIds]
      this.dragAnchor = { x: hit.x, y: hit.y }
      this.dragAnchorSize = { w: hit.w, h: hit.h }
      this.mode = 'drag'
      return
    }

    const edge = this.edgeAt(pt)
    if (edge) {
      if (opts.additive) {
        if (this.selectedIds.has(edge.id)) this.selectedIds.delete(edge.id)
        else this.selectedIds.add(edge.id)
        this.emitSelection()
      } else {
        this.setSelection([edge.id])
      }
      this.mode = 'idle'
      this.emit()
      return
    }

    this.mode = 'marquee'
    this.marquee = { x: this.startWorld.x, y: this.startWorld.y, w: 0, h: 0 }
    if (!opts.additive && this.selectedIds.size > 0) this.setSelection([])
    this.emit()
  }

  pointerMove(pt: Pt): void {
    const w = this.screenToWorld(pt)
    this.cursorWorld = w

    if (this.mode === 'drag') {
      const g = this.doc.grid
      const tol = SNAP_TOL_PX / (unitToPx(this.doc.units) * this.viewport.zoom)
      const { xs, ys } = this.snapTargets(new Set(this.dragIds))
      const raw = { x: w.x - this.startWorld.x, y: w.y - this.startWorld.y }
      const ax = this.dragAnchor.x + raw.x
      const ay = this.dragAnchor.y + raw.y
      const { w: aw, h: ah } = this.dragAnchorSize
      let dx = raw.x
      let dy = raw.y
      this.guides = []
      const sx = snapEdges([ax, ax + aw / 2, ax + aw], xs, tol)
      if (sx) {
        dx += sx.adj
        this.guides.push({ axis: 'x', at: sx.at })
      } else if (g.snap && g.size > 0) {
        dx = Math.round(ax / g.size) * g.size - this.dragAnchor.x
      }
      const sy = snapEdges([ay, ay + ah / 2, ay + ah], ys, tol)
      if (sy) {
        dy += sy.adj
        this.guides.push({ axis: 'y', at: sy.at })
      } else if (g.snap && g.size > 0) {
        dy = Math.round(ay / g.size) * g.size - this.dragAnchor.y
      }
      this.dragDelta = { x: dx, y: dy }
      this.emit()
      return
    }

    if (this.mode === 'marquee') {
      this.marquee = rectBetween(this.startWorld, w)
      const ids = this.doc.objects
        .filter((o) => rectsIntersect(this.marquee as Rect, rectOf(o)))
        .map((o) => o.id)
      this.setSelection(ids)
      this.emit()
      return
    }

    if (this.mode === 'resize' && this.resizeOrig && this.resizeId) {
      const { resizeDir: dir, resizeOrig: orig } = this
      const g = this.doc.grid
      const tol = SNAP_TOL_PX / (unitToPx(this.doc.units) * this.viewport.zoom)
      const { xs, ys } = this.snapTargets(new Set([this.resizeId]))
      this.guides = []
      let wx = w.x
      let wy = w.y
      const sx = nearest(w.x, xs, tol)
      if (sx !== null) {
        wx = sx
        this.guides.push({ axis: 'x', at: sx })
      } else if (g.snap && g.size > 0) {
        wx = Math.round(w.x / g.size) * g.size
      }
      const sy = nearest(w.y, ys, tol)
      if (sy !== null) {
        wy = sy
        this.guides.push({ axis: 'y', at: sy })
      } else if (g.snap && g.size > 0) {
        wy = Math.round(w.y / g.size) * g.size
      }
      const r = { x: orig.x, y: orig.y, w: orig.w, h: orig.h }
      if (dir.x > 0) {
        r.x = Math.min(orig.x, wx)
        r.w = Math.max(Math.abs(wx - orig.x), MIN_SIZE)
      } else if (dir.x < 0) {
        const x1 = orig.x + orig.w
        r.x = Math.min(wx, x1)
        r.w = Math.max(Math.abs(x1 - wx), MIN_SIZE)
      }
      if (dir.y > 0) {
        r.y = Math.min(orig.y, wy)
        r.h = Math.max(Math.abs(wy - orig.y), MIN_SIZE)
      } else if (dir.y < 0) {
        const y1 = orig.y + orig.h
        r.y = Math.min(wy, y1)
        r.h = Math.max(Math.abs(y1 - wy), MIN_SIZE)
      }
      this.resize = { id: this.resizeId, rect: r }
      this.emit()
      return
    }

    if (this.mode === 'connect' && this.connect) {
      const hover = this.portAt(pt)
      this.connect = {
        ...this.connect,
        hover: hover && hover.obj !== this.connect.from.obj ? hover : null,
      }
      this.emit()
      return
    }

    if (this.mode === 'pan' && this.vpStart) {
      this.viewport = {
        ...this.vpStart,
        x: this.vpStart.x + pt.x - this.start.x,
        y: this.vpStart.y + pt.y - this.start.y,
      }
      this.emit()
      return
    }

    this.emit()
  }

  pointerUp(): void {
    if (this.mode === 'drag' && this.dragDelta) {
      const { x: dx, y: dy } = this.dragDelta
      if (dx !== 0 || dy !== 0) {
        this.doc = moveObjects(this.doc, this.dragIds, dx, dy)
        this.emitDoc()
      }
    }
    if (this.mode === 'resize' && this.resize && this.resizeOrig) {
      const r = this.resize.rect
      const o = this.resizeOrig
      if (r.x !== o.x || r.y !== o.y || r.w !== o.w || r.h !== o.h) {
        this.doc = resizeObject(this.doc, this.resize.id, r)
        this.emitDoc()
      }
    }
    if (this.mode === 'connect' && this.connect?.hover) {
      const edge: Edge = {
        id: this.nextEdgeId(),
        from: this.connect.from,
        to: this.connect.hover,
        ...(this.connectRoute ? { route: this.connectRoute } : {}),
      }
      this.doc = addEdge(this.doc, edge)
      this.emitDoc()
    }
    this.mode = 'idle'
    this.dragDelta = null
    this.dragIds = []
    this.guides = []
    this.connect = null
    this.resize = null
    this.resizeId = null
    this.resizeOrig = null
    this.marquee = null
    this.emit()
  }

  private snapTargets(exclude: Set<string>): { xs: number[]; ys: number[] } {
    const xs: number[] = []
    const ys: number[] = []
    for (const o of this.doc.objects) {
      if (exclude.has(o.id)) continue
      xs.push(o.x, o.x + o.w / 2, o.x + o.w)
      ys.push(o.y, o.y + o.h / 2, o.y + o.h)
    }
    return { xs, ys }
  }

  /** Pan the viewport by screen-px deltas (e.g. trackpad scroll). */
  panBy(dx: number, dy: number): void {
    this.viewport = { ...this.viewport, x: this.viewport.x - dx, y: this.viewport.y - dy }
    this.emit()
  }

  wheel(pt: Pt, deltaY: number): void {
    const zoom = Math.min(
      ZOOM_MAX,
      Math.max(ZOOM_MIN, this.viewport.zoom * Math.pow(1.0015, -deltaY)),
    )
    if (zoom === this.viewport.zoom) return
    const w = this.screenToWorld(pt)
    const u = unitToPx(this.doc.units) * zoom
    this.viewport = {
      zoom,
      x: pt.x - w.x * u,
      y: this.doc.origin === 'top-left' ? pt.y - w.y * u : pt.y + w.y * u,
    }
    this.emit()
  }
}

/** Nearest candidate to `v` within `tol`, or null. */
function nearest(v: number, cands: number[], tol: number): number | null {
  let best: number | null = null
  let bd = tol
  for (const c of cands) {
    const d = Math.abs(c - v)
    if (d <= bd) {
      bd = d
      best = c
    }
  }
  return best
}

/**
 * Snap any of the moving `edges` to the nearest candidate within `tol`.
 * Returns the adjustment to apply to the gesture and the target line.
 */
function snapEdges(
  edges: number[],
  cands: number[],
  tol: number,
): { adj: number; at: number } | null {
  let best: { adj: number; at: number } | null = null
  for (const e of edges) {
    for (const c of cands) {
      const adj = c - e
      if (Math.abs(adj) <= tol && (!best || Math.abs(adj) < Math.abs(best.adj))) {
        best = { adj, at: c }
      }
    }
  }
  return best
}
