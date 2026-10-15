import type { Engine } from '@kimetron/core'
import { unitToPx } from '@kimetron/core'

export interface Frame {
  left: number
  top: number
  width: number
  height: number
}

const GRID_LINE = 'var(--ki-grid, rgba(40, 60, 80, 0.10))'

export function gridBackground(engine: Engine): {
  backgroundImage: string
  backgroundSize: string
  backgroundPosition: string
} {
  const { doc, viewport: vp } = engine
  const s = doc.grid.size * unitToPx(doc.units) * vp.zoom
  return {
    backgroundImage:
      `linear-gradient(to right, ${GRID_LINE} 1px, transparent 1px),` +
      `linear-gradient(to bottom, ${GRID_LINE} 1px, transparent 1px)`,
    backgroundSize: `${s}px ${s}px`,
    backgroundPosition: `${vp.x}px ${vp.y}px`,
  }
}

export function objectFrame(engine: Engine, o: { x: number; y: number; w: number; h: number; id: string }): Frame {
  const { doc, viewport: vp } = engine
  const d = engine.dragDelta && engine.selectedIds.has(o.id) ? engine.dragDelta : { x: 0, y: 0 }
  const u = unitToPx(doc.units) * vp.zoom
  const corner = {
    x: o.x + d.x,
    y: doc.origin === 'top-left' ? o.y + d.y : o.y + d.y + o.h,
  }
  const s = engine.worldToScreen(corner)
  return { left: s.x, top: s.y, width: o.w * u, height: o.h * u }
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
.ki-marquee { position: absolute; left: 0; top: 0; border: 1px dashed var(--ki-sel, #3a7bd5); background: rgba(58, 123, 213, 0.08); pointer-events: none; }
`
  document.head.appendChild(el)
}
