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
  renderOrder,
  resizeObject,
  rotateObject,
  type ZOrder,
} from './doc'
import { distToGeom, edgeGeom } from './edge'
import {
  aabbOf,
  invRotPt,
  objCenter,
  objPoint,
  obbOf,
  polysIntersect,
  rectBetween,
  rectPoly,
  screenToWorld,
  worldToScreen,
} from './geometry'
import { hitObject, shapeSnapPoints } from './shape'
import type { Doc, Edge, EdgeEndpoint, EdgeRoute, GridConfig, Origin, Pt, Rect, Unit, Viewport, WorldConfig, WorldObject } from './types'
import { formatScale, unitToPx } from './units'

type Mode = 'idle' | 'drag' | 'marquee' | 'pan' | 'resize' | 'connect' | 'rotate'

export interface PointerOpts {
  button?: number
  additive?: boolean
  /** Alt+drag: drag only the hit object, ignoring its group. */
  detached?: boolean
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
const HIT_TOL_PX = 6

export class Engine {
  doc: Doc
  viewport: Viewport = { x: 40, y: 40, zoom: 1 }
  readonly selectedIds = new Set<string>()
  dragDelta: Pt | null = null
  resize: { id: string; rect: Rect } | null = null
  guides: Guide[] = []
  /** In-progress connect gesture: source endpoint and hovered target (if any).
      `invalid` is set when the hovered endpoint fails `canConnect`. */
  connect: { from: EdgeEndpoint; hover: EdgeEndpoint | null; invalid: boolean } | null = null
  /** Route assigned to edges created by the connect gesture. */
  connectRoute: Edge['route'] = 'straight'
  /** Defaults merged into edges created by the connect gesture
      (route/style/markers/label; id/from/to are always taken from the gesture). */
  connectEdge?: Partial<Edge>
  /** Optional policy hook — return false to reject a connection (commit and hover are blocked). */
  canConnect?: (from: EdgeEndpoint, to: EdgeEndpoint) => boolean
  /** Optional hook — edge ids removed when a connection commits, in the
      same commit (e.g. replacing the wire on an occupied calc input). */
  connectReplace?: (from: EdgeEndpoint, to: EdgeEndpoint) => Iterable<string>
  /** Collision handling for `solid` objects:
      'none' = physics-free, 'flag' = mark colliding gestures via
      `dragInvalid` but commit anyway, 'reject' = refuse the commit. */
  collisionMode: 'none' | 'flag' | 'reject' = 'none'
  /** Optional exception hook — return true to allow a pair of solids
      to overlap (e.g. a door object placed on a wall). */
  canOverlap?: (a: WorldObject, b: WorldObject) => boolean
  /** True while the drag/resize hover position illegally overlaps a solid. */
  dragInvalid = false
  /** Extra snap candidates injected by the app (page frames, guides). */
  snapExtra: { xs: number[]; ys: number[] } = { xs: [], ys: [] }
  /** In-progress rotate gesture preview: target id and live angle (deg). */
  rotate: { id: string; deg: number } | null = null
  /** Angle snap for the rotate gesture while `pointerMove`'s
      `angleSnap` opt is held (deg; 0 disables snapping). */
  rotateSnapDeg = 15
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
  private resizeCenter: Pt = { x: 0, y: 0 }
  private resizeRot = 0
  private rotateId: string | null = null
  private rotateOrig = 0
  private rotateCenter: Pt = { x: 0, y: 0 }
  private rotateStartAng = 0
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
    const ids = [...this.selectedIds].filter((id) => !this.lockedById(id))
    this.doc = moveObjects(this.doc, ids, dx, dy)
    this.emitDoc()
  }

  private lockedById(id: string): boolean {
    return this.doc.objects.some((o) => o.id === id && o.locked === true)
  }

  removeSelected(): void {
    if (this.selectedIds.size === 0) return
    const objIds = [...this.selectedIds].filter(
      (id) => this.doc.objects.some((o) => o.id === id) && !this.lockedById(id),
    )
    const edgeIds = [...this.selectedIds].filter((id) =>
      this.doc.edges.some((e) => e.id === id),
    )
    this.doc = removeEdges(removeObjects(this.doc, objIds), edgeIds)
    this.selectedIds.clear()
    this.emitDoc()
    this.emitSelection()
  }

  /** Patch an edge's presentation fields (route/style/markers/label). One commit. */
  updateEdge(id: string, patch: Partial<Omit<Edge, 'id' | 'from' | 'to'>>): void {
    if (!this.doc.edges.some((e) => e.id === id)) return
    this.doc = {
      ...this.doc,
      edges: this.doc.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }
    this.emitDoc()
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
      .filter((o) => this.selectedIds.has(o.id) && !o.locked)
      .map((o) => ({
        ...o,
        id: fresh(o.id),
        x: o.x + step,
        y: o.y + step,
        ...(o.shape
          ? {
              shape: {
                ...o.shape,
                points: o.shape.points?.map((p) => ({ ...p })),
              },
            }
          : {}),
      }))
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
    const tol = HIT_TOL_PX / (unitToPx(this.doc.units) * this.viewport.zoom)
    const objs = renderOrder(this.doc.objects)
    for (let i = objs.length - 1; i >= 0; i--) {
      if (hitObject(objs[i], w, tol)) return objs[i]
    }
    return null
  }

  /** Solid objects whose footprint intersects `rect` — edge-touching
      is not an overlap. Rotated objects use their OBB. */
  collisions(rect: Rect, exclude?: ReadonlySet<string>): WorldObject[] {
    const poly = rectPoly(rect)
    return this.doc.objects.filter(
      (o) =>
        o.solid === true && !exclude?.has(o.id) && polysIntersect(poly, obbOf(o)),
    )
  }

  /** Would `mover` (at the position/rotation it carries) illegally
      overlap a non-excluded solid? */
  private blockedBySolid(mover: WorldObject, exclude: ReadonlySet<string>): boolean {
    if (!mover.solid) return false
    const pts = obbOf(mover)
    return this.doc.objects.some(
      (o) =>
        o.solid === true &&
        !exclude.has(o.id) &&
        polysIntersect(pts, obbOf(o)) &&
        !this.canOverlap?.(mover, o),
    )
  }

  /** Nearest port to a screen point within PORT_TOL_PX, as an edge endpoint. */
  portAt(screenPt: Pt): EdgeEndpoint | null {
    const w = this.screenToWorld(screenPt)
    const tol = PORT_TOL_PX / (unitToPx(this.doc.units) * this.viewport.zoom)
    let best: EdgeEndpoint | null = null
    let bd = tol
    for (const o of this.doc.objects) {
      for (const p of o.ports ?? []) {
        const wp = objPoint(o, p.fx, p.fy)
        const d = Math.hypot(wp.x - w.x, wp.y - w.y)
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
    this.connect = { from: port ? { obj, port } : { obj }, hover: null, invalid: false }
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

  /** Begin a resize gesture on `id`, moving the local-space edges given
      by `dir` (for a rotated object the handles ride its rotation, so
      `dir` is in the object's own axes). */
  startResize(pt: Pt, id: string, dir: ResizeDir): void {
    const o = this.doc.objects.find((o) => o.id === id)
    if (!o || o.locked || (dir.x === 0 && dir.y === 0)) return
    this.mode = 'resize'
    this.resizeId = id
    this.resizeDir = dir
    this.resizeOrig = { x: o.x, y: o.y, w: o.w, h: o.h }
    this.resizeCenter = objCenter(o)
    this.resizeRot = o.rot ?? 0
    this.cursorWorld = this.screenToWorld(pt)
  }

  /** Begin a rotate gesture on `id` (e.g. its rotate handle). */
  startRotate(pt: Pt, id: string): void {
    const o = this.doc.objects.find((o) => o.id === id)
    if (!o || o.locked) return
    this.mode = 'rotate'
    this.rotateId = id
    this.rotateOrig = o.rot ?? 0
    this.rotateCenter = objCenter(o)
    const w = this.screenToWorld(pt)
    this.rotateStartAng = Math.atan2(w.y - this.rotateCenter.y, w.x - this.rotateCenter.x)
    this.rotate = { id, deg: this.rotateOrig }
    this.cursorWorld = w
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
      if (hit.locked) return // selectable but not draggable
      this.dragIds = opts.detached
        ? [hit.id]
        : this.expandDragIds(this.selectedIds)
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

  pointerMove(pt: Pt, opts: { angleSnap?: boolean } = {}): void {
    const w = this.screenToWorld(pt)
    this.cursorWorld = w

    if (this.mode === 'rotate' && this.rotateId && this.rotate) {
      const ang = Math.atan2(w.y - this.rotateCenter.y, w.x - this.rotateCenter.x)
      let deg = this.rotateOrig + ((ang - this.rotateStartAng) * 180) / Math.PI
      if (opts.angleSnap && this.rotateSnapDeg > 0) {
        deg = Math.round(deg / this.rotateSnapDeg) * this.rotateSnapDeg
      }
      deg = ((deg % 360) + 360) % 360
      this.rotate = { id: this.rotateId, deg }
      if (this.collisionMode !== 'none') {
        const o = this.doc.objects.find((o) => o.id === this.rotateId)
        this.dragInvalid =
          o !== undefined &&
          this.blockedBySolid({ ...o, rot: deg }, new Set([o.id]))
      }
      this.emit()
      return
    }

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
      if (this.collisionMode !== 'none') {
        const moving = new Set(this.dragIds)
        this.dragInvalid = this.dragIds.some((id) => {
          const o = this.doc.objects.find((o) => o.id === id)
          return (
            o !== undefined &&
            this.blockedBySolid({ ...o, x: o.x + dx, y: o.y + dy }, moving)
          )
        })
      }
      this.emit()
      return
    }

    if (this.mode === 'marquee') {
      this.marquee = rectBetween(this.startWorld, w)
      const mq = rectPoly(this.marquee)
      const ids = new Set(
        this.doc.objects
          .filter((o) => polysIntersect(mq, obbOf(o)))
          .map((o) => o.id),
      )
      const groups = new Set(
        this.doc.objects.filter((o) => ids.has(o.id) && o.group).map((o) => o.group),
      )
      if (groups.size > 0) {
        for (const o of this.doc.objects) {
          if (o.group && groups.has(o.group)) ids.add(o.id)
        }
      }
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
      // rotated objects resize along their own axes — inverse-rotate the
      // pointer into the local frame, then run the usual rect math
      const lp = this.resizeRot
        ? invRotPt({ x: wx, y: wy }, this.resizeCenter, this.resizeRot)
        : { x: wx, y: wy }
      const r = { x: orig.x, y: orig.y, w: orig.w, h: orig.h }
      if (dir.x > 0) {
        r.x = Math.min(orig.x, lp.x)
        r.w = Math.max(Math.abs(lp.x - orig.x), MIN_SIZE)
      } else if (dir.x < 0) {
        const x1 = orig.x + orig.w
        r.x = Math.min(lp.x, x1)
        r.w = Math.max(Math.abs(x1 - lp.x), MIN_SIZE)
      }
      if (dir.y > 0) {
        r.y = Math.min(orig.y, lp.y)
        r.h = Math.max(Math.abs(lp.y - orig.y), MIN_SIZE)
      } else if (dir.y < 0) {
        const y1 = orig.y + orig.h
        r.y = Math.min(lp.y, y1)
        r.h = Math.max(Math.abs(y1 - lp.y), MIN_SIZE)
      }
      this.resize = { id: this.resizeId, rect: r }
      if (this.collisionMode !== 'none') {
        const mover = this.doc.objects.find((o) => o.id === this.resizeId)
        this.dragInvalid =
          mover !== undefined &&
          this.blockedBySolid({ ...mover, ...r }, new Set([this.resizeId]))
      }
      this.emit()
      return
    }

    if (this.mode === 'connect' && this.connect) {
      const hover = this.portAt(pt)
      const h = hover && hover.obj !== this.connect.from.obj ? hover : null
      this.connect = {
        ...this.connect,
        hover: h,
        invalid: h !== null && !!this.canConnect && !this.canConnect(this.connect.from, h),
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
    const blocked = this.collisionMode === 'reject' && this.dragInvalid
    if (this.mode === 'drag' && this.dragDelta && !blocked) {
      const { x: dx, y: dy } = this.dragDelta
      if (dx !== 0 || dy !== 0) {
        this.doc = moveObjects(this.doc, this.dragIds, dx, dy)
        this.emitDoc()
      }
    }
    if (this.mode === 'rotate' && this.rotate && !blocked) {
      const o = this.doc.objects.find((o) => o.id === this.rotate!.id)
      if (o && this.rotate.deg !== (o.rot ?? 0)) {
        this.doc = rotateObject(this.doc, o.id, this.rotate.deg)
        this.emitDoc()
      }
    }
    if (this.mode === 'resize' && this.resize && this.resizeOrig && !blocked) {
      const r = this.resize.rect
      const o = this.resizeOrig
      if (r.x !== o.x || r.y !== o.y || r.w !== o.w || r.h !== o.h) {
        this.doc = resizeObject(this.doc, this.resize.id, r)
        this.emitDoc()
      }
    }
    if (this.mode === 'connect' && this.connect?.hover && !this.connect.invalid) {
      const edge: Edge = {
        ...this.connectEdge,
        id: this.nextEdgeId(),
        from: this.connect.from,
        to: this.connect.hover,
        route: this.connectEdge?.route ?? this.connectRoute,
      }
      const drop = this.connectReplace
        ? [...this.connectReplace(this.connect.from, this.connect.hover)]
        : []
      let doc = drop.length > 0 ? removeEdges(this.doc, drop) : this.doc
      doc = addEdge(doc, edge)
      this.doc = doc
      this.emitDoc()
    }
    this.mode = 'idle'
    this.dragDelta = null
    this.dragIds = []
    this.dragInvalid = false
    this.guides = []
    this.connect = null
    this.resize = null
    this.resizeId = null
    this.resizeOrig = null
    this.marquee = null
    this.rotate = null
    this.rotateId = null
    this.emit()
  }

  /** Selection-expanded drag set: same-group members, minus locked. */
  private expandDragIds(ids: Iterable<string>): string[] {
    const set = new Set(ids)
    const groups = new Set(
      this.doc.objects.filter((o) => set.has(o.id) && o.group).map((o) => o.group),
    )
    for (const o of this.doc.objects) {
      if (o.group && groups.has(o.group)) set.add(o.id)
    }
    return [...set].filter((id) => !this.lockedById(id))
  }

  /** World-space bounding box of the selected objects, or null.
      Rotated objects contribute their OBB's axis-aligned bounds. */
  selectionBounds(): Rect | null {
    const objs = this.doc.objects.filter((o) => this.selectedIds.has(o.id))
    if (objs.length === 0) return null
    return aabbOf(objs.flatMap((o) => obbOf(o)))
  }

  private snapTargets(exclude: Set<string>): { xs: number[]; ys: number[] } {
    const xs: number[] = [...this.snapExtra.xs]
    const ys: number[] = [...this.snapExtra.ys]
    const p = this.doc.page
    if (p) {
      xs.push(p.x, p.x + p.w / 2, p.x + p.w)
      ys.push(p.y, p.y + p.h / 2, p.y + p.h)
    }
    for (const o of this.doc.objects) {
      if (exclude.has(o.id)) continue
      const corners = obbOf(o)
      for (const pt of corners) {
        xs.push(pt.x)
        ys.push(pt.y)
      }
      for (let i = 0; i < 4; i++) {
        const a = corners[i]
        const b = corners[(i + 1) % 4]
        xs.push((a.x + b.x) / 2)
        ys.push((a.y + b.y) / 2)
      }
      const c = objCenter(o)
      xs.push(c.x)
      ys.push(c.y)
      for (const sp of shapeSnapPoints(o)) {
        xs.push(sp.x)
        ys.push(sp.y)
      }
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
