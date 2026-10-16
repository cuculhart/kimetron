export type Unit = 'mm' | 'cm' | 'm' | 'inch' | 'px'
export type Origin = 'bottom-left' | 'top-left'

export interface GridConfig {
  size: number
  snap: boolean
}

export interface WorldConfig {
  units?: Unit
  origin?: Origin
  grid?: Partial<GridConfig>
}

export interface Pt {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Port {
  id: string
  /** Position as a fraction of the object's size, 0..1.
      World position = (o.x + fx*o.w, o.y + fy*o.h) — tracks resizes. */
  fx: number
  fy: number
}

export interface WorldObjectStyle {
  /** CSS color string, e.g. '#fef3c7' or 'var(--fill)'. */
  fill?: string
  /** Border (stroke) color. */
  stroke?: string
}

export interface WorldObject {
  id: string
  kind: string
  x: number
  y: number
  w: number
  h: number
  ports?: Port[]
  style?: WorldObjectStyle
  data?: unknown
}

export type EdgeRoute = 'straight' | 'orthogonal' | 'smoothstep' | 'bezier'

export interface EdgeStyle {
  /** CSS color string, e.g. '#b45309' or 'var(--dep)'. */
  color?: string
  /** Stroke width in screen px — a semantic attribute, not world size. */
  width?: number
  /** stroke-dasharray pattern, e.g. [4, 4] for dashed. */
  dash?: number[]
}

export type EdgeMarker = 'arrow' | 'dot'

export interface EdgeEndpoint {
  obj: string
  /** Port id; omitted = object center. */
  port?: string
}

export interface Edge {
  id: string
  from: EdgeEndpoint
  to: EdgeEndpoint
  route?: EdgeRoute
  style?: EdgeStyle
  markerStart?: EdgeMarker
  markerEnd?: EdgeMarker
  label?: string
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface Doc {
  schemaVersion: number
  units: Unit
  origin: Origin
  grid: GridConfig
  objects: WorldObject[]
  edges: Edge[]
}
