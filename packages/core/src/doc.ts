import type { Doc, Edge, Pt, WorldConfig, WorldObject } from './types'

export function createDocument(cfg: WorldConfig = {}): Doc {
  return {
    schemaVersion: 2,
    units: cfg.units ?? 'mm',
    origin: cfg.origin ?? 'bottom-left',
    grid: { size: cfg.grid?.size ?? 10, snap: cfg.grid?.snap ?? true },
    objects: [],
    edges: [],
  }
}

export function addObject(doc: Doc, o: WorldObject): Doc {
  return { ...doc, objects: [...doc.objects, o] }
}

export function moveObject(doc: Doc, id: string, x: number, y: number): Doc {
  return {
    ...doc,
    objects: doc.objects.map((o) => (o.id === id ? { ...o, x, y } : o)),
  }
}

export function moveObjects(doc: Doc, ids: Iterable<string>, dx: number, dy: number): Doc {
  const set = new Set(ids)
  return {
    ...doc,
    objects: doc.objects.map((o) => (set.has(o.id) ? { ...o, x: o.x + dx, y: o.y + dy } : o)),
  }
}

export function removeObjects(doc: Doc, ids: Iterable<string>): Doc {
  const set = new Set(ids)
  return {
    ...doc,
    objects: doc.objects.filter((o) => !set.has(o.id)),
    // edges referencing removed objects are dropped (no orphans)
    edges: doc.edges.filter(
      (e) => !set.has(e.from.obj) && !set.has(e.to.obj),
    ),
  }
}

export function addEdge(doc: Doc, e: Edge): Doc {
  return { ...doc, edges: [...doc.edges, e] }
}

export function removeEdges(doc: Doc, ids: Iterable<string>): Doc {
  const set = new Set(ids)
  return { ...doc, edges: doc.edges.filter((e) => !set.has(e.id)) }
}

/** Resolve an endpoint to a world point, or null if the target is gone. */
export function endpointPos(doc: Doc, ep: { obj: string; port?: string }): Pt | null {
  const o = doc.objects.find((o) => o.id === ep.obj)
  if (!o) return null
  if (ep.port) {
    const p = o.ports?.find((p) => p.id === ep.port)
    if (p) return { x: o.x + p.fx * o.w, y: o.y + p.fy * o.h }
  }
  return { x: o.x + o.w / 2, y: o.y + o.h / 2 }
}

/** World points of both ends of an edge, or null if either end is dangling. */
export function edgeEndpoints(doc: Doc, e: Edge): { from: Pt; to: Pt } | null {
  const from = endpointPos(doc, e.from)
  const to = endpointPos(doc, e.to)
  return from && to ? { from, to } : null
}

export type ZOrder = 'front' | 'back' | 'forward' | 'backward'

/** Reorder `objects` array (render order = array order; last = topmost). */
export function reorderObjects(
  doc: Doc,
  ids: Iterable<string>,
  op: ZOrder,
): Doc {
  const set = new Set(ids)
  if (set.size === 0) return doc
  const objs = [...doc.objects]
  const sel = objs.filter((o) => set.has(o.id))
  const rest = objs.filter((o) => !set.has(o.id))
  if (op === 'front') return { ...doc, objects: [...rest, ...sel] }
  if (op === 'back') return { ...doc, objects: [...sel, ...rest] }
  const indices = objs.map((o, i) => (set.has(o.id) ? i : -1)).filter((i) => i >= 0)
  if (op === 'forward') {
    for (let k = indices.length - 1; k >= 0; k--) {
      const i = indices[k]
      if (i + 1 >= objs.length || set.has(objs[i + 1].id)) continue
      ;[objs[i], objs[i + 1]] = [objs[i + 1], objs[i]]
    }
  } else {
    for (const i of indices) {
      if (i === 0 || set.has(objs[i - 1].id)) continue
      ;[objs[i], objs[i - 1]] = [objs[i - 1], objs[i]]
    }
  }
  return { ...doc, objects: objs }
}

export function resizeObject(
  doc: Doc,
  id: string,
  r: { x: number; y: number; w: number; h: number },
): Doc {
  return {
    ...doc,
    objects: doc.objects.map((o) =>
      o.id === id ? { ...o, x: r.x, y: r.y, w: r.w, h: r.h } : o,
    ),
  }
}

export function serializeDoc(doc: Doc): string {
  return JSON.stringify(doc, null, 2)
}

export function deserializeDoc(json: string): Doc {
  const raw = JSON.parse(json) as Partial<Doc>
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.objects)) {
    throw new Error('invalid kimetron document')
  }
  const base = createDocument({
    units: raw.units,
    origin: raw.origin,
    grid: raw.grid,
  })
  return {
    ...base,
    objects: raw.objects.map((o) => ({
      id: String(o.id),
      kind: typeof o.kind === 'string' ? o.kind : 'rect',
      x: Number(o.x) || 0,
      y: Number(o.y) || 0,
      w: Number(o.w) || 0,
      h: Number(o.h) || 0,
      ...(Array.isArray(o.ports)
        ? {
            ports: o.ports.map((p) => ({
              id: String(p.id),
              fx: Number(p.fx) || 0,
              fy: Number(p.fy) || 0,
            })),
          }
        : {}),
      ...(o.data !== undefined ? { data: o.data } : {}),
    })),
    edges: Array.isArray(raw.edges)
      ? raw.edges
          .filter((e) => e && e.from && e.to)
          .map((e) => ({
            id: String(e.id),
            from: { obj: String(e.from.obj), ...(e.from.port ? { port: String(e.from.port) } : {}) },
            to: { obj: String(e.to.obj), ...(e.to.port ? { port: String(e.to.port) } : {}) },
            ...(e.route ? { route: e.route } : {}),
            ...(e.label !== undefined ? { label: String(e.label) } : {}),
          }))
      : [],
  }
}
