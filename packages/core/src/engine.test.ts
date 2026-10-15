import { describe, expect, it } from 'vitest'
import {
  createDocument,
  deserializeDoc,
  Engine,
  formatLength,
  formatScale,
  screenToWorld,
  serializeDoc,
  snap,
  unitToPx,
  worldToScreen,
} from './index'

const vp = { x: 100, y: 400, zoom: 1 }

describe('units', () => {
  it('converts world units to css px at 96dpi', () => {
    expect(unitToPx('px')).toBe(1)
    expect(unitToPx('inch')).toBe(96)
    expect(unitToPx('mm')).toBeCloseTo(96 / 25.4, 6)
    expect(unitToPx('cm')).toBeCloseTo(96 / 2.54, 6)
    expect(unitToPx('m')).toBeCloseTo(96 / 0.0254, 3)
  })

  it('formats lengths and scale', () => {
    expect(formatLength(12.5, 'mm')).toBe('12.5 mm')
    expect(formatLength(10, 'px')).toBe('10 px')
    expect(formatScale(1)).toBe('1:1')
    expect(formatScale(0.5)).toBe('1:2')
    expect(formatScale(4)).toBe('4:1')
  })
})

describe('transforms', () => {
  const mm = { units: 'mm' as const, origin: 'bottom-left' as const }

  it('roundtrips world<->screen in bottom-left origin', () => {
    const w = { x: 30, y: 20 }
    const s = worldToScreen(w, mm, vp)
    expect(s.y).toBeLessThan(vp.y)
    const rt = screenToWorld(s, mm, vp)
    expect(rt.x).toBeCloseTo(w.x, 9)
    expect(rt.y).toBeCloseTo(w.y, 9)
  })

  it('roundtrips in top-left origin', () => {
    const tl = { units: 'mm' as const, origin: 'top-left' as const }
    const w = { x: 30, y: 20 }
    const s = worldToScreen(w, tl, vp)
    expect(s.y).toBeGreaterThan(vp.y)
    const rt = screenToWorld(s, tl, vp)
    expect(rt.x).toBeCloseTo(w.x, 9)
    expect(rt.y).toBeCloseTo(w.y, 9)
  })

  it('snaps to grid when enabled', () => {
    expect(snap(13, { size: 10, snap: true })).toBe(10)
    expect(snap(13, { size: 10, snap: false })).toBe(13)
  })
})

describe('engine drag', () => {
  const obj = { id: 'a', kind: 'rect', x: 20, y: 20, w: 40, h: 30 }

  function make(cfg = {}) {
    const e = new Engine({ units: 'mm', origin: 'bottom-left', grid: { size: 10, snap: true }, ...cfg }, [obj])
    e.viewport = { x: 0, y: 500, zoom: 1 }
    return e
  }

  it('commits position only on pointerUp', () => {
    const e = make()
    let emitted = 0
    e.onDocChange(() => emitted++)
    const s0 = e.worldToScreen({ x: obj.x + 1, y: obj.y + 1 })
    e.pointerDown(s0)
    expect(e.selectedIds.has('a')).toBe(true)

    const s1 = e.worldToScreen({ x: obj.x + 1 + 15, y: obj.y + 1 + 10 })
    e.pointerMove(s1)
    expect(e.dragDelta).toEqual({ x: 20, y: 10 })
    expect(e.doc.objects[0].x).toBe(20)
    expect(emitted).toBe(0)

    e.pointerUp()
    expect(e.doc.objects[0].x).toBe(40)
    expect(e.doc.objects[0].y).toBe(30)
    expect(emitted).toBe(1)
    expect(e.dragDelta).toBeNull()
  })

  it('does not mutate doc on click without move', () => {
    const e = make()
    const s0 = e.worldToScreen({ x: 21, y: 21 })
    e.pointerDown(s0)
    e.pointerUp()
    expect(e.doc.objects[0].x).toBe(20)
  })

  it('marquee selects intersecting objects and clears on empty area', () => {
    const e = make()
    e.pointerDown(e.worldToScreen({ x: 0, y: 0 }))
    e.pointerMove(e.worldToScreen({ x: 100, y: 100 }))
    expect(e.selectedIds.has('a')).toBe(true)
    e.pointerUp()
    e.pointerDown(e.worldToScreen({ x: 200, y: 200 }))
    e.pointerMove(e.worldToScreen({ x: 300, y: 300 }))
    e.pointerUp()
    expect(e.selectedIds.size).toBe(0)
  })

  it('wheel zoom keeps the cursor world point fixed', () => {
    const e = make()
    const pt = { x: 250, y: 300 }
    const before = e.screenToWorld(pt)
    e.wheel(pt, -240)
    const after = e.screenToWorld(pt)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
    expect(e.viewport.zoom).toBeGreaterThan(1)
  })

  it('pans with middle button', () => {
    const e = make()
    e.pointerDown({ x: 10, y: 10 }, { button: 1 })
    e.pointerMove({ x: 60, y: 40 })
    e.pointerUp()
    expect(e.viewport.x).toBe(50)
    expect(e.viewport.y).toBe(530)
  })
})

describe('doc serialize', () => {
  it('roundtrips units/origin/grid/objects', () => {
    const doc = createDocument({ units: 'inch', origin: 'top-left', grid: { size: 0.5, snap: false } })
    const withObj = { ...doc, objects: [{ id: 'x', kind: 'rect', x: 1, y: 2, w: 3, h: 4 }] }
    const out = deserializeDoc(serializeDoc(withObj))
    expect(out).toEqual(withObj)
  })

  it('rejects invalid json', () => {
    expect(() => deserializeDoc('{"foo":1}')).toThrow()
  })
})
