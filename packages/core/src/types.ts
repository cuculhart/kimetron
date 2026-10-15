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

export interface WorldObject {
  id: string
  kind: string
  x: number
  y: number
  w: number
  h: number
  data?: unknown
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface Doc {
  schemaVersion: 1
  units: Unit
  origin: Origin
  grid: GridConfig
  objects: WorldObject[]
}
