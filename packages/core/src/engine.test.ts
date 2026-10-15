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

  it('snaps the dragged object onto grid lines, not just the delta', () => {
    const off = { id: 'off', kind: 'rect', x: 23, y: 17, w: 40, h: 30 }
    const e = new Engine(
      { units: 'mm', origin: 'bottom-left', grid: { size: 10, snap: true } },
      [off],
    )
    e.viewport = { x: 0, y: 500, zoom: 1 }
    e.pointerDown(e.worldToScreen({ x: off.x + 1, y: off.y + 1 }))
    e.pointerMove(e.worldToScreen({ x: off.x + 3, y: off.y + 1 }))
    e.pointerUp()
    expect(e.doc.objects[0].x % 10).toBe(0)
    expect(e.doc.objects[0].y % 10).toBe(0)
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

describe('engine resize', () => {
  const obj = { id: 'a', kind: 'rect', x: 20, y: 20, w: 40, h: 30 }

  function make(cfg = {}) {
    const e = new Engine({ units: 'mm', origin: 'bottom-left', grid: { size: 10, snap: true }, ...cfg }, [obj])
    e.viewport = { x: 0, y: 500, zoom: 1 }
    return e
  }

  it('commits the new rect only on pointerUp, snapping the moving edges', () => {
    const e = make()
    let emitted = 0
    e.onDocChange(() => emitted++)
    // move the max-x / max-y edges (screen 'se' under bottom-left is {x:+1,y:-1}... here use {x:1,y:1} = grow toward +x,+y)
    e.startResize({ x: 0, y: 0 }, 'a', { x: 1, y: 1 })
    e.pointerMove(e.worldToScreen({ x: 97, y: 83 }))
    // preview only; edges snapped to 100/80 → rect stays anchored at orig min corner
    expect(e.resize?.rect).toEqual({ x: 20, y: 20, w: 80, h: 60 })
    expect(e.doc.objects[0].w).toBe(40)
    expect(emitted).toBe(0)

    e.pointerUp()
    expect(e.doc.objects[0]).toMatchObject({ x: 20, y: 20, w: 80, h: 60 })
    expect(emitted).toBe(1)
    expect(e.resize).toBeNull()
  })

  it('keeps the opposite corner fixed when dragging a min edge', () => {
    const e = make()
    e.startResize({ x: 0, y: 0 }, 'a', { x: -1, y: -1 }) // move min-x/min-y edges
    e.pointerMove(e.worldToScreen({ x: 5, y: 8 }))
    e.pointerUp()
    // snapped min corner lands at (10,10); max corner (60,50) stays fixed
    expect(e.doc.objects[0]).toMatchObject({ x: 10, y: 10, w: 50, h: 40 })
  })

  it('does not commit on a click without move', () => {
    const e = make()
    let emitted = 0
    e.onDocChange(() => emitted++)
    e.startResize({ x: 0, y: 0 }, 'a', { x: 1, y: 1 })
    e.pointerUp()
    expect(e.doc.objects[0]).toMatchObject({ x: 20, y: 20, w: 40, h: 30 })
    expect(emitted).toBe(0)
  })
})

describe('object snapping', () => {
  const cfg = { units: 'mm' as const, origin: 'bottom-left' as const, grid: { size: 10, snap: true } }

  it('snaps dragged edge to a neighbor edge in preference to the grid', () => {
    const e = new Engine(cfg, [
      { id: 'a', kind: 'rect', x: 20, y: 20, w: 40, h: 30 },
      { id: 'b', kind: 'rect', x: 90, y: 0, w: 30, h: 30 },
    ])
    e.viewport = { x: 0, y: 500, zoom: 1 }
    // grab 'a', drag so its max-x edge lands just short of b's min-x (90)
    e.pointerDown(e.worldToScreen({ x: 21, y: 21 }))
    e.pointerMove(e.worldToScreen({ x: 21 + 28, y: 21 })) // anchor lands x=48 → edges 48/68/88
    // nearest within tol: 88→90 (adj +2) wins over grid
    expect(e.dragDelta?.x).toBeCloseTo(30)
    expect(e.dragDelta?.y).toBeCloseTo(0)
    expect(e.guides).toEqual([{ axis: 'x', at: 90 }])
    e.pointerUp()
    expect(e.doc.objects[0].x).toBeCloseTo(50)
    expect(e.guides).toEqual([])
  })

  it('snaps the resize pointer to a neighbor edge', () => {
    const e = new Engine(cfg, [
      { id: 'a', kind: 'rect', x: 20, y: 20, w: 40, h: 30 },
      { id: 'b', kind: 'rect', x: 95, y: 0, w: 30, h: 30 },
    ])
    e.viewport = { x: 0, y: 500, zoom: 1 }
    e.startResize({ x: 0, y: 0 }, 'a', { x: 1, y: 0 })
    e.pointerMove(e.worldToScreen({ x: 94, y: 20 }))
    expect(e.resize?.rect.w).toBe(75) // snapped to x=95: 95-20
    e.pointerUp()
    expect(e.doc.objects[0].w).toBe(75)
  })
})

describe('history / z-order / duplicate', () => {
  const obj = { id: 'a', kind: 'rect', x: 0, y: 0, w: 10, h: 10 }

  it('undo/redo restores committed docs', () => {
    const e = new Engine({}, [{ ...obj }])
    e.viewport = { x: 0, y: 0, zoom: 1 }
    expect(e.canUndo).toBe(false)
    e.moveSelectedBy(0, 0) // no selection — but direct doc ops:
    e.addObject({ id: 'b', kind: 'rect', x: 5, y: 5, w: 10, h: 10 })
    expect(e.doc.objects).toHaveLength(2)
    expect(e.canUndo).toBe(true)
    e.undo()
    expect(e.doc.objects).toHaveLength(1)
    expect(e.canRedo).toBe(true)
    e.redo()
    expect(e.doc.objects).toHaveLength(2)
  })

  it('reorders objects front/back', () => {
    const e = new Engine({}, [
      { ...obj },
      { id: 'b', kind: 'rect', x: 0, y: 0, w: 10, h: 10 },
      { id: 'c', kind: 'rect', x: 0, y: 0, w: 10, h: 10 },
    ])
    e.setSelection(['a'])
    e.reorderSelected('front')
    expect(e.doc.objects.map((o) => o.id)).toEqual(['b', 'c', 'a'])
    e.reorderSelected('back')
    expect(e.doc.objects.map((o) => o.id)).toEqual(['a', 'b', 'c'])
    e.reorderSelected('forward')
    expect(e.doc.objects.map((o) => o.id)).toEqual(['b', 'a', 'c'])
  })

  it('duplicates selection with fresh ids and selects the copies', () => {
    const e = new Engine({ grid: { size: 10, snap: true } }, [{ ...obj }])
    e.setSelection(['a'])
    e.duplicateSelected()
    expect(e.doc.objects).toHaveLength(2)
    const copy = e.doc.objects[1]
    expect(copy.id).toBe('a-copy')
    expect(copy.x).toBe(10)
    expect(e.selectedIds.has('a-copy')).toBe(true)
    e.duplicateSelected()
    expect(e.doc.objects[2].id).toBe('a-copy-copy')
  })
})

describe('history edge cases', () => {
  it('setDoc (load) is one undoable commit', () => {
    const e = new Engine({}, [{ id: 'a', kind: 'rect', x: 0, y: 0, w: 10, h: 10 }])
    const loaded = deserializeDoc(serializeDoc({ ...createDocument(), objects: [{ id: 'z', kind: 'rect', x: 1, y: 2, w: 3, h: 4 }] }))
    e.setDoc(loaded)
    expect(e.doc.objects[0].id).toBe('z')
    e.undo()
    expect(e.doc.objects[0].id).toBe('a')
  })

  it('a new commit clears the redo stack', () => {
    const e = new Engine({}, [{ id: 'a', kind: 'rect', x: 0, y: 0, w: 10, h: 10 }])
    e.addObject({ id: 'b', kind: 'rect', x: 1, y: 1, w: 5, h: 5 })
    e.undo()
    e.addObject({ id: 'c', kind: 'rect', x: 2, y: 2, w: 5, h: 5 })
    expect(e.canRedo).toBe(false)
  })
})

describe('edges and ports', () => {
  const cfg = { units: 'mm' as const, origin: 'bottom-left' as const, grid: { size: 10, snap: true } }
  const two = [
    { id: 'a', kind: 'rect', x: 0, y: 0, w: 40, h: 30, ports: [{ id: 'r', x: 40, y: 15 }] },
    { id: 'b', kind: 'rect', x: 100, y: 0, w: 40, h: 30, ports: [{ id: 'l', x: 0, y: 15 }] },
  ]
  const make = () => {
    const e = new Engine(cfg, two)
    e.viewport = { x: 0, y: 500, zoom: 1 }
    return e
  }

  it('connect gesture commits an edge port-to-port', () => {
    const e = make()
    e.startConnect(e.worldToScreen({ x: 40, y: 15 }), 'a', 'r')
    e.pointerMove(e.worldToScreen({ x: 60, y: 15 }))
    expect(e.connect).not.toBeNull()
    expect(e.connectPreview()?.to.x).toBeCloseTo(60)
    expect(e.connectPreview()?.to.y).toBeCloseTo(15)
    // hover over b's left port (at world 100,15)
    e.pointerMove(e.worldToScreen({ x: 99, y: 16 }))
    expect(e.connect?.hover).toEqual({ obj: 'b', port: 'l' })
    e.pointerUp()
    expect(e.doc.edges).toHaveLength(1)
    expect(e.doc.edges[0]).toMatchObject({ id: 'e1', from: { obj: 'a', port: 'r' }, to: { obj: 'b', port: 'l' } })
  })

  it('cancels connect on empty drop and rejects self-connect', () => {
    const e = make()
    e.startConnect(e.worldToScreen({ x: 40, y: 15 }), 'a', 'r')
    e.pointerMove(e.worldToScreen({ x: 200, y: 100 }))
    e.pointerUp()
    expect(e.doc.edges).toHaveLength(0)
    // same-object port hover is not a valid target
    e.startConnect(e.worldToScreen({ x: 40, y: 15 }), 'a', 'r')
    e.pointerMove(e.worldToScreen({ x: 39, y: 15 }))
    expect(e.connect?.hover).toBeNull()
    e.pointerUp()
    expect(e.doc.edges).toHaveLength(0)
  })

  it('edge click selects and Delete removes; object removal prunes edges', () => {
    const e = make()
    e.startConnect(e.worldToScreen({ x: 40, y: 15 }), 'a', 'r')
    e.pointerMove(e.worldToScreen({ x: 99, y: 16 }))
    e.pointerUp()
    // click near the edge midpoint (world ~70,15)
    e.pointerDown(e.worldToScreen({ x: 70, y: 16 }))
    e.pointerUp()
    expect(e.selectedIds.has('e1')).toBe(true)
    e.removeSelected()
    expect(e.doc.edges).toHaveLength(0)
    // reconnect, then delete object 'b' → edge pruned
    e.startConnect(e.worldToScreen({ x: 40, y: 15 }), 'a', 'r')
    e.pointerMove(e.worldToScreen({ x: 99, y: 16 }))
    e.pointerUp()
    expect(e.doc.edges).toHaveLength(1)
    e.setSelection(['b'])
    e.removeSelected()
    expect(e.doc.edges).toHaveLength(0)
  })

  it('serializes edges and reads v1 docs without them', () => {
    const e = make()
    e.startConnect(e.worldToScreen({ x: 40, y: 15 }), 'a', 'r')
    e.pointerMove(e.worldToScreen({ x: 99, y: 16 }))
    e.pointerUp()
    const out = deserializeDoc(serializeDoc(e.doc))
    expect(out.edges).toEqual(e.doc.edges)
    const v1 = JSON.stringify({ units: 'mm', origin: 'bottom-left', grid: { size: 10, snap: true }, objects: [] })
    expect(deserializeDoc(v1).edges).toEqual([])
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
