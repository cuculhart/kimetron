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

export function rectBetween(a: Pt, b: Pt): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  }
}
