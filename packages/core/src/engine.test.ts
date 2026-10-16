import { describe, expect, it } from 'vitest'
import {
  createDocument,
  deserializeDoc,
  endpointPos,
  Engine,
  formatLength,
  formatScale,
  screenToWorld,
  rectContains,
  rectOverlapArea,
  serializeDoc,
  snap,
  unitToPx,
  type WorldObject,
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
    { id: 'a', kind: 'rect', x: 0, y: 0, w: 40, h: 30, ports: [{ id: 'r', fx: 1, fy: 0.5 }] },
    { id: 'b', kind: 'rect', x: 100, y: 0, w: 40, h: 30, ports: [{ id: 'l', fx: 0, fy: 0.5 }] },
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

  it('keeps ports on the edges after resize (normalized fractions)', () => {
    const e = make()
    const a = () => e.doc.objects.find((o) => o.id === 'a')!
    // shrink 'a' from w=40 to w=10 via the min-x edge
    e.startResize({ x: 0, y: 0 }, 'a', { x: -1, y: 0 })
    e.pointerMove(e.worldToScreen({ x: 30, y: 15 }))
    e.pointerUp()
    const o = a()
    expect(o.w).toBe(10)
    // 'r' port at fx=1 must sit on the right edge, not inside the rect
    const pos = endpointPos(e.doc, { obj: 'a', port: 'r' })
    expect(pos?.x).toBeCloseTo(o.x + o.w)
  })

  it('canConnect rejects the commit and flags hover as invalid', () => {
    const e = make()
    e.canConnect = (_from, to) => to.obj !== 'b'
    e.startConnect(e.worldToScreen({ x: 40, y: 15 }), 'a', 'r')
    e.pointerMove(e.worldToScreen({ x: 99, y: 16 }))
    expect(e.connect?.hover).toEqual({ obj: 'b', port: 'l' })
    expect(e.connect?.invalid).toBe(true)
    e.pointerUp()
    expect(e.doc.edges).toHaveLength(0)
  })

  it('connectEdge stamps style/markers onto gesture-created edges', () => {
    const e = make()
    e.connectEdge = {
      route: 'bezier',
      style: { color: '#b45309', width: 1.8 },
      markerEnd: 'arrow',
    }
    e.startConnect(e.worldToScreen({ x: 40, y: 15 }), 'a', 'r')
    e.pointerMove(e.worldToScreen({ x: 99, y: 16 }))
    e.pointerUp()
    expect(e.doc.edges[0]).toMatchObject({
      route: 'bezier',
      style: { color: '#b45309', width: 1.8 },
      markerEnd: 'arrow',
    })
  })

  it('serializes edge style/markers and object style', () => {
    const e = make()
    e.connectEdge = { style: { color: 'var(--dep)', width: 2, dash: [4, 4] }, markerEnd: 'dot' }
    e.startConnect(e.worldToScreen({ x: 40, y: 15 }), 'a', 'r')
    e.pointerMove(e.worldToScreen({ x: 99, y: 16 }))
    e.pointerUp()
    e.doc = {
      ...e.doc,
      objects: e.doc.objects.map((o) =>
        o.id === 'a' ? { ...o, style: { fill: '#fef3c7', stroke: '#e0d77a' } } : o,
      ),
    }
    const out = deserializeDoc(serializeDoc(e.doc))
    expect(out.edges).toEqual(e.doc.edges)
    expect(out.objects[0].style).toEqual({ fill: '#fef3c7', stroke: '#e0d77a' })
  })

  it('smoothstep resolves to the same geometry as orthogonal', () => {
    const e = make()
    e.connectRoute = 'smoothstep'
    e.startConnect(e.worldToScreen({ x: 40, y: 15 }), 'a', 'r')
    e.pointerMove(e.worldToScreen({ x: 99, y: 16 }))
    e.pointerUp()
    expect(e.doc.edges[0].route).toBe('smoothstep')
    // hit test works on smoothstep (midpoint click selects it)
    e.pointerDown(e.worldToScreen({ x: 70, y: 15 }))
    e.pointerUp()
    expect(e.selectedIds.has(e.doc.edges[0].id)).toBe(true)
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

describe('shape kinds', () => {
  function make(objs: WorldObject[]) {
    const e = new Engine({ units: 'mm', origin: 'bottom-left', grid: { size: 10, snap: true } }, objs)
    e.viewport = { x: 0, y: 500, zoom: 1 }
    return e
  }
  const hit = (e: Engine, w: { x: number; y: number }) =>
    e.objectAt(e.worldToScreen(w))?.id ?? null

  it('hits a diagonal line only near the chord, not its bbox', () => {
    const e = make([{ id: 'l', kind: 'line', x: 0, y: 0, w: 40, h: 40 }])
    expect(hit(e, { x: 20, y: 20 })).toBe('l') // on the diagonal
    expect(hit(e, { x: 38, y: 2 })).toBe(null) // inside bbox, far from line
  })

  it('hits a custom chord (horizontal rule)', () => {
    const e = make([
      {
        id: 'r',
        kind: 'line',
        x: 0,
        y: 0,
        w: 60,
        h: 10,
        shape: { points: [{ fx: 0, fy: 0.5 }, { fx: 1, fy: 0.5 }] },
      },
    ])
    expect(hit(e, { x: 30, y: 5 })).toBe('r')
    expect(hit(e, { x: 30, y: 1 })).toBe(null)
  })

  it('ellipse: filled hits inside, unfilled hits only the ring', () => {
    const e = make([
      { id: 'ring', kind: 'ellipse', x: 0, y: 0, w: 40, h: 40 },
      { id: 'disk', kind: 'ellipse', x: 60, y: 0, w: 40, h: 40, style: { fill: '#fc0' } },
    ])
    expect(hit(e, { x: 20, y: 20 })).toBe(null) // center of unfilled ring
    expect(hit(e, { x: 40, y: 20 })).toBe('ring') // on the ring
    expect(hit(e, { x: 80, y: 20 })).toBe('disk') // inside filled disk
  })

  it('arc hits along the swept range only', () => {
    const e = make([{ id: 'a', kind: 'arc', x: 0, y: 0, w: 40, h: 40, shape: { a0: 0, a1: 90 } }])
    expect(hit(e, { x: 40, y: 20 })).toBe('a') // a=0 endpoint
    expect(hit(e, { x: 0, y: 20 })).toBe(null) // opposite side of ellipse, not swept
  })

  it('curve hits along the anchors path', () => {
    const e = make([
      {
        id: 'c',
        kind: 'curve',
        x: 0,
        y: 0,
        w: 60,
        h: 40,
        shape: { points: [{ fx: 0, fy: 0 }, { fx: 0.5, fy: 1 }, { fx: 1, fy: 0 }] },
      },
    ])
    expect(hit(e, { x: 30, y: 39.5 })).toBe('c') // just below the curve apex
    expect(hit(e, { x: 30, y: 5 })).toBe(null) // below the curve
  })

  it('snaps dragged objects to shape anchors (line endpoints)', () => {
    const e = make([
      { id: 'l', kind: 'line', x: 0, y: 0, w: 40, h: 40 },
      { id: 'b', kind: 'rect', x: 80, y: 80, w: 10, h: 10 },
    ])
    // drag rect's top-left corner toward the line endpoint at (0,0)... (40,40) end is nearer
    e.pointerDown(e.worldToScreen({ x: 85, y: 85 }))
    // move so bbox edge (x=80+dx) lands at 40 (line's (1,1) endpoint x)
    e.pointerMove(e.worldToScreen({ x: 85 - 41, y: 85 }))
    expect(e.dragDelta?.x).toBe(-40) // snapped: 80-40=40 = endpoint x
  })

  it('serializes shape and extended style fields', () => {
    const doc = createDocument({ units: 'mm', origin: 'top-left' })
    const withShape = {
      ...doc,
      objects: [
        {
          id: 'c',
          kind: 'curve',
          x: 1,
          y: 2,
          w: 30,
          h: 20,
          shape: { points: [{ fx: 0, fy: 0.5 }, { fx: 0.5, fy: 0 }, { fx: 1, fy: 0.5 }] },
          style: { stroke: '#333', width: 2.5, dash: [2, 2], capStart: 'dot' as const, capEnd: 'arrow' as const },
        },
        { id: 'a', kind: 'arc', x: 0, y: 0, w: 40, h: 40, shape: { a0: 0, a1: 270 } },
      ],
    }
    const out = deserializeDoc(serializeDoc(withShape))
    expect(out).toEqual(withShape)
  })
})

describe('lock, group, page and connectReplace', () => {
  function make(objs: WorldObject[], docExtra: Partial<ReturnType<typeof createDocument>> = {}) {
    const e = new Engine({ units: 'mm', origin: 'bottom-left', grid: { size: 10, snap: true } }, objs)
    if (Object.keys(docExtra).length) e.doc = { ...e.doc, ...docExtra }
    e.viewport = { x: 0, y: 500, zoom: 1 }
    return e
  }
  const dragBy = (e: Engine, from: { x: number; y: number }, to: { x: number; y: number }, opts?: { detached?: boolean }) => {
    e.pointerDown(e.worldToScreen(from), opts)
    e.pointerMove(e.worldToScreen(to))
    e.pointerUp()
  }

  it('locked object: selectable, not draggable, not removable, not resizable', () => {
    const e = make([{ id: 'a', kind: 'rect', x: 0, y: 0, w: 20, h: 10, locked: true }])
    dragBy(e, { x: 10, y: 5 }, { x: 30, y: 25 })
    expect(e.doc.objects[0].x).toBe(0)
    expect(e.selectedIds.has('a')).toBe(true)
    e.removeSelected()
    expect(e.doc.objects.length).toBe(1)
    e.startResize(e.worldToScreen({ x: 0, y: 0 }), 'a', { x: 1, y: 1 })
    e.pointerMove(e.worldToScreen({ x: 50, y: 50 }))
    e.pointerUp()
    expect(e.doc.objects[0].w).toBe(20)
  })

  it('group members drag together; Alt+drag detaches', () => {
    const objs = [
      { id: 'g1', kind: 'rect', x: 0, y: 0, w: 10, h: 10, group: 'g' },
      { id: 'g2', kind: 'rect', x: 20, y: 0, w: 10, h: 10, group: 'g' },
      { id: 'u', kind: 'rect', x: 50, y: 0, w: 10, h: 10 },
    ]
    const e = make(objs)
    e.setSelection(['g1'])
    dragBy(e, { x: 5, y: 5 }, { x: 15, y: 5 })
    const moved = e.doc.objects
    expect(moved[0].x).toBe(10)
    expect(moved[1].x).toBe(30)
    expect(moved[2].x).toBe(50)

    const e2 = make(objs)
    e2.setSelection(['g1'])
    dragBy(e2, { x: 5, y: 5 }, { x: 15, y: 5 }, { detached: true })
    expect(e2.doc.objects[0].x).toBe(10)
    expect(e2.doc.objects[1].x).toBe(20)
  })

  it('snapExtra and doc.page edges join snap targets', () => {
    const e = make([{ id: 'b', kind: 'rect', x: 80, y: 80, w: 10, h: 10 }], {
      page: { x: 0, y: 0, w: 200, h: 100 },
    })
    // drag left edge toward page's right edge x=200 — wait, object at 80; move so its right edge snaps to 200? drag by 113 → right edge at 203, tol 6px≈1.6mm — snap to 200 needs |203-200|>tol. Instead snap left edge to page left edge x=0: drag dx=-81 → left at -1, snaps to 0 → dx=-80
    e.pointerDown(e.worldToScreen({ x: 85, y: 85 }))
    e.pointerMove(e.worldToScreen({ x: 85 - 81, y: 85 }))
    expect(e.dragDelta?.x).toBe(-80) // snapped to page edge x=0
    e.pointerUp()

    const e2 = make([{ id: 'b', kind: 'rect', x: 80, y: 80, w: 10, h: 10 }])
    e2.snapExtra = { xs: [50], ys: [] }
    e2.pointerDown(e2.worldToScreen({ x: 85, y: 85 }))
    e2.pointerMove(e2.worldToScreen({ x: 85 - 29, y: 85 }))
    expect(e2.dragDelta?.x).toBe(-30) // snapped: 80-30=50 = snapExtra x
  })

  it('connectReplace swaps the wire on an occupied input', () => {
    const ports = [
      { id: 'out', fx: 1, fy: 0.5 },
      { id: 'a', fx: 0, fy: 0.5 },
    ]
    const e = make([
      { id: 's1', kind: 'rect', x: 0, y: 0, w: 10, h: 10, ports: [ports[0]] },
      { id: 's2', kind: 'rect', x: 0, y: 30, w: 10, h: 10, ports: [ports[0]] },
      { id: 't', kind: 'rect', x: 60, y: 10, w: 10, h: 10, ports: [ports[0], ports[1]] },
    ])
    const connect = (fromObj: string, sx: number, sy: number) => {
      e.startConnect(e.worldToScreen({ x: sx, y: sy }), fromObj, 'out')
      e.pointerMove(e.worldToScreen({ x: 60, y: 15 }))
      e.pointerUp()
    }
    connect('s1', 10, 5)
    expect(e.doc.edges.length).toBe(1)
    e.connectReplace = (_f, to) =>
      e.doc.edges.filter((w) => w.to.obj === to.obj && w.to.port === to.port).map((w) => w.id)
    connect('s2', 10, 35)
    expect(e.doc.edges.length).toBe(1)
    expect(e.doc.edges[0].from.obj).toBe('s2')
    // undo restores the replaced wire and drops the new one
    e.undo()
    expect(e.doc.edges.length).toBe(1)
    expect(e.doc.edges[0].from.obj).toBe('s1')
  })

  it('rectContains and rectOverlapArea', () => {
    expect(rectContains({ x: 0, y: 0, w: 100, h: 100 }, { x: 10, y: 10, w: 20, h: 20 })).toBe(true)
    expect(rectContains({ x: 0, y: 0, w: 100, h: 100 }, { x: 90, y: 10, w: 20, h: 20 })).toBe(false)
    expect(rectOverlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(25)
    expect(rectOverlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 })).toBe(0)
  })

  it('serializes locked/group/page/double', () => {
    const doc = createDocument({ units: 'mm', origin: 'top-left' })
    const d = {
      ...doc,
      page: { x: 0, y: 0, w: 200, h: 100 },
      objects: [
        { id: 'a', kind: 'rect', x: 1, y: 2, w: 3, h: 4, locked: true, group: 'g1' },
        { id: 'l', kind: 'line', x: 0, y: 0, w: 10, h: 10, style: { stroke: '#333', width: 4, double: true } },
      ],
      edges: [
        { id: 'e1', from: { obj: 'a' }, to: { obj: 'l' }, style: { color: '#333', width: 4, double: true } },
      ],
    }
    const out = deserializeDoc(serializeDoc(d))
    expect(out).toEqual(d)
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
