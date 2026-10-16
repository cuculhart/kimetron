import type { Edge, Port, WorldObject } from '@kimetron/core'

/**
 * sethera-piece spike: a tiny estimate board.
 * pieces (text/number) + Σ zone + calc pieces wired by edges.
 */

export interface PieceData {
  label?: string
  value?: number | null
}

export interface ZoneData {
  fn: 'sum' | 'count'
  label?: string
}

export type CalcOp = 'add' | 'sub' | 'mul' | 'div'
export const OP_LABEL: Record<CalcOp, string> = {
  add: '＋', sub: '−', mul: '×', div: '÷',
}

export interface CalcData {
  op: CalcOp
  constA?: number | null
  constB?: number | null
}

export interface Meta {
  /** custom-piece group: members should move as one (engine gap P25) */
  groupId?: string
  /** lock: should block drag/resize/delete (engine gap P26) */
  locked?: boolean
}

export type AnyData = (PieceData | ZoneData | CalcData) & Meta

const GRID = 5

// ports — direction is a driver-level convention:
// values flow out of 'out'; calc inputs are 'a'/'b'
const OUT: Port[] = [{ id: 'out', fx: 1, fy: 0.5 }]
const CALC_PORTS: Port[] = [
  { id: 'a', fx: 0, fy: 0.3 },
  { id: 'b', fx: 0, fy: 0.7 },
  { id: 'out', fx: 1, fy: 0.5 },
]

const PIECE_FILL = '#fef3c7'
const ZONE_FILL = 'rgba(58, 123, 213, 0.07)'
const ZONE_STROKE = '#3a7bd5'
const CALC_FILL = '#eef2f7'
const LOCK_STROKE = '#d97706'

function piece(
  id: string, x: number, y: number, label: string, value: number | null,
  meta: Meta = {},
): WorldObject {
  return {
    id, kind: 'piece', x, y, w: 50, h: 15, ports: OUT.map((p) => ({ ...p })),
    style: {
      fill: PIECE_FILL,
      ...(meta.locked ? { stroke: LOCK_STROKE } : {}),
    },
    data: { label, value, ...meta },
  }
}

function zone(id: string, x: number, y: number, w: number, h: number, fn: ZoneData['fn'], label: string): WorldObject {
  return {
    id, kind: 'zone', x, y, w, h, ports: OUT.map((p) => ({ ...p })),
    style: { fill: ZONE_FILL, stroke: ZONE_STROKE },
    data: { fn, label },
  }
}

function calc(id: string, x: number, y: number, op: CalcOp, constB?: number): WorldObject {
  return {
    id, kind: 'calc', x, y, w: 34, h: 18, ports: CALC_PORTS.map((p) => ({ ...p })),
    style: { fill: CALC_FILL },
    data: { op, constB: constB ?? null } satisfies CalcData,
  }
}

/** A "rule" approximated as a thin rect — true line kind is engine gap P24. */
function rule(id: string, x: number, y: number, w: number): WorldObject {
  return {
    id, kind: 'rule', x, y, w, h: 1,
    style: { fill: '#333', stroke: '#333' },
    data: {},
  }
}

export function sampleDoc(): { objects: WorldObject[]; edges: Edge[] } {
  const objects: WorldObject[] = [
    zone('z1', 15, 15, 100, 55, 'sum', 'Σ 小計'),
    piece('pA', 25, 25, '品A', 700),
    piece('pB', 25, 45, '品B', 500),
    piece('pShip', 25, 85, '送料', 800),
    calc('cAdd', 165, 45, 'add'),
    calc('cTax', 285, 45, 'mul', 1.1),
    piece('pNote', 25, 125, '備考: 要確認', null, { locked: true }),
    rule('r1', 15, 150, 100),
    // a "custom piece" pair sharing a group — should move as one (gap P25)
    piece('gHead', 165, 100, '見出し', null, { groupId: 'g1' }),
    piece('gBody', 165, 118, '説明文', null, { groupId: 'g1' }),
  ]
  const WIRE = { route: 'bezier' as const, style: { color: '#b45309', width: 1.8 }, markerEnd: 'arrow' as const }
  const edges: Edge[] = [
    { id: 'w1', from: { obj: 'z1', port: 'out' }, to: { obj: 'cAdd', port: 'a' }, ...WIRE },
    { id: 'w2', from: { obj: 'pShip', port: 'out' }, to: { obj: 'cAdd', port: 'b' }, ...WIRE },
    { id: 'w3', from: { obj: 'cAdd', port: 'out' }, to: { obj: 'cTax', port: 'a' }, ...WIRE },
  ]
  return { objects, edges }
}

function rectContains(outer: WorldObject, inner: WorldObject): boolean {
  return (
    inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

/** Resolve an object's numeric value: piece → value, zone → Σ members,
    calc → op(wired inputs or constants). Cycles return null. */
export function objectValue(
  id: string,
  objects: WorldObject[],
  edges: Edge[],
  seen = new Set<string>(),
): number | null {
  if (seen.has(id)) return null
  const o = objects.find((o) => o.id === id)
  if (!o) return null
  seen.add(id)
  const d = o.data as AnyData | undefined
  if (o.kind === 'piece') return (d as PieceData)?.value ?? null
  if (o.kind === 'zone') {
    const members = objects.filter((m) => m.id !== id && m.kind !== 'zone' && rectContains(o, m))
    const fn = (d as ZoneData)?.fn
    if (fn === 'count') return members.length
    const vals = members
      .map((m) => objectValue(m.id, objects, edges, new Set(seen)))
      .filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null
  }
  if (o.kind === 'calc') {
    const cd = d as CalcData
    const input = (port: 'a' | 'b', fallback: number | null | undefined) => {
      const e = edges.find((e) => e.to.obj === id && e.to.port === port)
      return e ? objectValue(e.from.obj, objects, edges, new Set(seen)) : (fallback ?? null)
    }
    const a = input('a', cd?.constA)
    const b = input('b', cd?.constB)
    if (a === null || b === null) return null
    switch (cd?.op) {
      case 'add': return a + b
      case 'sub': return a - b
      case 'mul': return a * b
      case 'div': return b === 0 ? null : a / b
    }
  }
  return null
}

/** sethera's wiring rule: values flow out → calc inputs a/b.
    Also blocks a second wire onto an occupied input (replace is a gap). */
export function canConnect(from: { obj: string; port?: string }, to: { obj: string; port?: string }, edges: Edge[]): boolean {
  if (from.port !== 'out') return false
  if (to.port !== 'a' && to.port !== 'b') return false
  return !edges.some((e) => e.to.obj === to.obj && e.to.port === to.port)
}

export const WIRE_DEFAULTS = {
  route: 'bezier' as const,
  style: { color: '#b45309', width: 1.8 },
  markerEnd: 'arrow' as const,
}

export const GRID_CFG = { size: GRID, snap: true }
