import type { Engine, Origin, ResizeDir } from '@kimetron/core'
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
.ki-handle { position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px; background: #fff; border: 1px solid var(--ki-sel, #3a7bd5); box-sizing: border-box; z-index: 10; }
.ki-handle[hidden] { display: none; }
.ki-guides { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.ki-guide { position: absolute; background: var(--ki-guide, #e0393e); }
.ki-guide-v { top: 0; bottom: 0; width: 1px; }
.ki-guide-h { left: 0; right: 0; height: 1px; }
`
  document.head.appendChild(el)
}
