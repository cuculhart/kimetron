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
  /** Offset from the object's anchor corner (o.x, o.y), in world units.
      Origin-independent. Apps move ports on resize if needed. */
  x: number
  y: number
}

export interface WorldObject {
  id: string
  kind: string
  x: number
  y: number
  w: number
  h: number
  ports?: Port[]
  data?: unknown
}

export type EdgeRoute = 'straight' | 'orthogonal' | 'bezier'

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
