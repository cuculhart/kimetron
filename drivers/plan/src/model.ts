import type { WorldObject } from '@kimetron/core'

/**
 * plan spike: a 10 mm-grid floor plan.
 * floor < furniture < walls via `layer`; occupancy via `solid`.
 * Walls are "thickness × length" rects — abutting edges is legal,
 * overlapping is not (collisionMode = 'reject').
 */

export interface ItemData {
  label?: string
}

const FLOOR_FILL = '#f7f3ea'
const WALL_FILL = '#44403a'
const WALL_STROKE = '#2e2a26'
const FURN_FILL = '#dccfb4'
const FURN_STROKE = '#8a7a5c'

function wall(id: string, x: number, y: number, w: number, h: number): WorldObject {
  return {
    id, kind: 'wall', x, y, w, h,
    solid: true, layer: 10,
    style: { fill: WALL_FILL, stroke: WALL_STROKE },
    data: {},
  }
}

function furniture(id: string, x: number, y: number, w: number, h: number, label: string): WorldObject {
  return {
    id, kind: 'furniture', x, y, w, h,
    solid: true, layer: 0,
    style: { fill: FURN_FILL, stroke: FURN_STROKE },
    data: { label } satisfies ItemData,
  }
}

export function sampleDoc(): { objects: WorldObject[] } {
  return {
    objects: [
      // substrate — non-solid, everything may sit on it
      {
        id: 'floor', kind: 'floor', x: 0, y: 0, w: 4400, h: 3400,
        layer: -10,
        style: { fill: FLOOR_FILL, stroke: '#c8bfae' },
        data: {},
      },
      // outer walls (120 mm thick) — corner cells belong to the horizontal walls
      wall('wS', 200, 200, 4000, 120),
      wall('wN', 200, 3080, 4000, 120),
      wall('wW', 200, 320, 120, 2760),
      wall('wE', 4080, 320, 120, 2760),
      // "|-" T junctions: end edges abut face edges
      wall('wP1', 2400, 320, 120, 1500), // rises from wS's top face
      wall('wP2', 2520, 1500, 800, 120), // leaves wP1's right face
      // door: solid (a doorway is occupied space) but may overlap walls
      {
        id: 'door1', kind: 'door', x: 800, y: 200, w: 800, h: 120,
        solid: true, layer: 11,
        style: { fill: '#fff', stroke: '#b0a48c' },
        data: { label: '開口' } satisfies ItemData,
      },
      // door swing — a quarter arc, radius = leaf length
      {
        id: 'swing1', kind: 'arc', x: 800, y: -480, w: 1600, h: 1600,
        shape: { a0: 90, a1: 180 },
        style: { stroke: '#8a7a5c', width: 1.5, dash: [4, 3] },
        data: {},
      },
      furniture('fDesk', 500, 500, 900, 500, '机'),
      furniture('fChair', 1500, 550, 450, 450, '椅子'),
      furniture('fShelf', 2700, 400, 1400, 350, '棚'),
      furniture('fSofa', 600, 2200, 1800, 850, 'ソファ'),
    ],
  }
}

/** The overlap matrix: doors may sit on walls (and walls on doors —
    dragging the wall must not be blocked by its door). */
export function canOverlap(a: WorldObject, b: WorldObject): boolean {
  const kinds = [a.kind, b.kind].sort()
  return kinds[0] === 'door' && kinds[1] === 'wall'
}

export const FURNITURE: Record<string, { w: number; h: number; label: string }> = {
  desk: { w: 900, h: 500, label: '机' },
  chair: { w: 450, h: 450, label: '椅子' },
  shelf: { w: 1400, h: 350, label: '棚' },
  table: { w: 1000, h: 1000, label: 'テーブル' },
}

let n = 0

export function spawn(kind: string): WorldObject {
  const t = FURNITURE[kind] ?? { w: 500, h: 500, label: kind }
  n += 1
  return furniture(
    `f${kind}-${n}`,
    500 + (n % 5) * 150,
    500 + (n % 3) * 150,
    t.w,
    t.h,
    t.label,
  )
}

export const GRID_CFG = { size: 10, snap: true, major: 10 }
