import type { GridConfig, Origin, Pt, Rect, Unit, Viewport, WorldObject } from './types'
import { unitToPx } from './units'

export function worldToScreen(
  p: Pt,
  ctx: { units: Unit; origin: Origin },
  vp: Viewport,
): Pt {
  const u = unitToPx(ctx.units) * vp.zoom
  return {
    x: p.x * u + vp.x,
    y: ctx.origin === 'top-left' ? p.y * u + vp.y : vp.y - p.y * u,
  }
}

export function screenToWorld(
  p: Pt,
  ctx: { units: Unit; origin: Origin },
  vp: Viewport,
): Pt {
  const u = unitToPx(ctx.units) * vp.zoom
  return {
    x: (p.x - vp.x) / u,
    y: ctx.origin === 'top-left' ? (p.y - vp.y) / u : (vp.y - p.y) / u,
  }
}

export function snap(v: number, grid: GridConfig): number {
  return grid.snap && grid.size > 0 ? Math.round(v / grid.size) * grid.size : v
}

export function rectOf(o: WorldObject): Rect {
  return { x: o.x, y: o.y, w: o.w, h: o.h }
}

export function pointInRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** True when `inner` is fully inside `outer` (inclusive edges). */
export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

/** Overlap area of two rects (0 when disjoint). */
export function rectOverlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

export function rectBetween(a: Pt, b: Pt): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  }
}

// --- rotation (world CCW degrees, pivot = bbox center) ---

/** Rotate `p` around `c` by `deg` (CCW, world space). */
export function rotPt(p: Pt, c: Pt, deg: number): Pt {
  if (!deg) return p
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

/** Inverse-rotate `p` around `c` — maps a world point into the
    object's local (unrotated) frame. */
export function invRotPt(p: Pt, c: Pt, deg: number): Pt {
  return rotPt(p, c, -deg)
}

/** Center of an object's bbox — the rotation pivot. */
export function objCenter(o: { x: number; y: number; w: number; h: number }): Pt {
  return { x: o.x + o.w / 2, y: o.y + o.h / 2 }
}

/** Local-fraction point (0..1 of the bbox) resolved to world coords,
    including rotation. */
export function objPoint(
  o: { x: number; y: number; w: number; h: number; rot?: number },
  fx: number,
  fy: number,
): Pt {
  const p = { x: o.x + fx * o.w, y: o.y + fy * o.h }
  return o.rot ? rotPt(p, objCenter(o), o.rot) : p
}

/** The object's oriented bounding box — 4 world-space corners
    (unrotated objects get their plain rect corners). */
export function obbOf(o: { x: number; y: number; w: number; h: number; rot?: number }): Pt[] {
  const r = o.rot ?? 0
  const pts: Pt[] = [
    { x: o.x, y: o.y },
    { x: o.x + o.w, y: o.y },
    { x: o.x + o.w, y: o.y + o.h },
    { x: o.x, y: o.y + o.h },
  ]
  if (!r) return pts
  const c = objCenter(o)
  return pts.map((p) => rotPt(p, c, r))
}

/** Axis-aligned bounding box of a point set. */
export function aabbOf(pts: Pt[]): Rect {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }
}

/** Corners of an axis-aligned rect as a polygon (for SAT). */
export function rectPoly(r: Rect): Pt[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]
}

/** Convex-polygon intersection via the separating-axis test.
    Edge-only contact does NOT count as an overlap (consistent with
    rectsIntersect's strict inequalities). */
export function polysIntersect(a: Pt[], b: Pt[]): boolean {
  const EPS = 1e-9
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i]
      const p2 = poly[(i + 1) % poly.length]
      // edge normal
      const nx = p2.y - p1.y
      const ny = p1.x - p2.x
      let minA = Infinity
      let maxA = -Infinity
      for (const p of a) {
        const d = p.x * nx + p.y * ny
        if (d < minA) minA = d
        if (d > maxA) maxA = d
      }
      let minB = Infinity
      let maxB = -Infinity
      for (const p of b) {
        const d = p.x * nx + p.y * ny
        if (d < minB) minB = d
        if (d > maxB) maxB = d
      }
      if (maxA - minB <= EPS || maxB - minA <= EPS) return false
    }
  }
  return true
}
