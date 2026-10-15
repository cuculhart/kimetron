import type { Doc, WorldConfig, WorldObject } from './types'

export function createDocument(cfg: WorldConfig = {}): Doc {
  return {
    schemaVersion: 1,
    units: cfg.units ?? 'mm',
    origin: cfg.origin ?? 'bottom-left',
    grid: { size: cfg.grid?.size ?? 10, snap: cfg.grid?.snap ?? true },
    objects: [],
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
  return { ...doc, objects: doc.objects.filter((o) => !set.has(o.id)) }
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
      ...(o.data !== undefined ? { data: o.data } : {}),
    })),
  }
}
