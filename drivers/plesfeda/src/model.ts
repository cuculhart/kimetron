import type { Edge, WorldObject } from '@kimetron/core'

/** plesfeda-like WBS task: tree structure + derived numbering + deps. */
export interface Task {
  id: string
  parent: string | null
  name: string
  effort: number
  deps?: string[]
}

export interface TaskData {
  wbs: string
  name: string
  effort: number
}

const NODE_W = 64
const NODE_H = 14
const COL_STEP = 76
const ROW_STEP = 20
const MARGIN = 8

const PORTS = [
  { id: 'l', fx: 0, fy: 0.5 },
  { id: 'r', fx: 1, fy: 0.5 },
]

/**
 * Derive canvas objects/edges from the task tree.
 * Layout is a pure function of the tree — positions are NOT stored
 * (same principle as plesfeda's derived layout).
 */
export function layoutTasks(tasks: Task[]): {
  objects: WorldObject[]
  edges: Edge[]
} {
  const children = (id: string) => tasks.filter((t) => t.parent === id)
  const objects: WorldObject[] = []
  let row = 0

  const walk = (t: Task, wbs: string, depth: number) => {
    objects.push({
      id: t.id,
      kind: 'task',
      x: MARGIN + depth * COL_STEP,
      y: MARGIN + row++ * ROW_STEP,
      w: NODE_W,
      h: NODE_H,
      ports: PORTS.map((p) => ({ ...p })),
      data: { wbs, name: t.name, effort: t.effort } satisfies TaskData,
    })
    children(t.id).forEach((k, i) => walk(k, `${wbs}.${i + 1}`, depth + 1))
  }

  tasks.filter((t) => t.parent === null).forEach((t, i) => walk(t, `${i + 1}`, 0))

  const edges: Edge[] = tasks.flatMap((t) =>
    (t.deps ?? []).map((d) => ({
      id: `dep-${d}-${t.id}`,
      from: { obj: d, port: 'r' },
      to: { obj: t.id, port: 'l' },
      route: 'orthogonal' as const,
    })),
  )
  return { objects, edges }
}

export const SAMPLE_TASKS: Task[] = [
  { id: 't1', parent: null, name: '企画', effort: 3 },
  { id: 't11', parent: 't1', name: '要件定義', effort: 5 },
  { id: 't12', parent: 't1', name: '画面設計', effort: 4, deps: ['t11'] },
  { id: 't2', parent: null, name: '実装', effort: 8, deps: ['t12'] },
  { id: 't21', parent: 't2', name: 'core エンジン', effort: 5 },
  { id: 't22', parent: 't2', name: 'dom レンダラ', effort: 3, deps: ['t21'] },
  { id: 't23', parent: 't2', name: 'アダプタ', effort: 2, deps: ['t21'] },
  { id: 't3', parent: null, name: '検証・公開', effort: 3, deps: ['t2'] },
]
