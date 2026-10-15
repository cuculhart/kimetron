import {
  addObject,
  createDocument,
  moveObjects,
  removeObjects,
} from './doc'
import {
  pointInRect,
  rectBetween,
  rectOf,
  rectsIntersect,
  screenToWorld,
  worldToScreen,
} from './geometry'
import type { Doc, GridConfig, Origin, Pt, Rect, Unit, Viewport, WorldConfig, WorldObject } from './types'
import { formatScale, unitToPx } from './units'

type Mode = 'idle' | 'drag' | 'marquee' | 'pan'

export interface PointerOpts {
  button?: number
  additive?: boolean
}

export type EngineListener = (engine: Engine) => void

const ZOOM_MIN = 0.02
const ZOOM_MAX = 50

export class Engine {
  doc: Doc
  viewport: Viewport = { x: 40, y: 40, zoom: 1 }
  readonly selectedIds = new Set<string>()
  dragDelta: Pt | null = null
  marquee: Rect | null = null
  cursorWorld: Pt = { x: 0, y: 0 }
  version = 0

  private mode: Mode = 'idle'
  private start: Pt = { x: 0, y: 0 }
  private startWorld: Pt = { x: 0, y: 0 }
  private vpStart: Viewport | null = null
  private dragIds: string[] = []
  private listeners = new Set<EngineListener>()
  private docListeners = new Set<(doc: Doc) => void>()
  private selectionListeners = new Set<(ids: ReadonlySet<string>) => void>()

  constructor(cfg: WorldConfig = {}, objects: WorldObject[] = []) {
    this.doc = { ...createDocument(cfg), objects }
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

  setDoc(doc: Doc): void {
    this.doc = doc
    for (const id of [...this.selectedIds]) {
      if (!doc.objects.some((o) => o.id === id)) this.selectedIds.delete(id)
    }
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
    this.doc = removeObjects(this.doc, this.selectedIds)
    this.selectedIds.clear()
    this.emitDoc()
    this.emitSelection()
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

  // --- input (screen px, canvas-relative) ---

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
      this.mode = 'drag'
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
      const raw = { x: w.x - this.startWorld.x, y: w.y - this.startWorld.y }
      this.dragDelta = g.snap
        ? {
            x: Math.round(raw.x / g.size) * g.size,
            y: Math.round(raw.y / g.size) * g.size,
          }
        : raw
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
    this.mode = 'idle'
    this.dragDelta = null
    this.dragIds = []
    this.marquee = null
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
