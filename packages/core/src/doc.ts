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
