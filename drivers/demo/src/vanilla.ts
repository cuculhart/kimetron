import { Engine } from '@kimetron/core'
import { createRenderer } from '@kimetron/dom'

const engine = new Engine({
  units: 'mm',
  origin: 'bottom-left',
  grid: { size: 10, snap: true },
})
const ports4 = () => [
  { id: 'l', fx: 0, fy: 0.5 },
  { id: 't', fx: 0.5, fy: 1 },
  { id: 'r', fx: 1, fy: 0.5 },
  { id: 'b', fx: 0.5, fy: 0 },
]

engine.addObject({ id: 'vanilla', kind: 'rect', x: 20, y: 20, w: 60, h: 40, ports: ports4() })
engine.addObject({ id: 'no-react', kind: 'rect', x: 100, y: 80, w: 50, h: 30, ports: ports4() })

const el = document.getElementById('canvas') as HTMLElement
createRenderer(el, { engine })

const r = el.getBoundingClientRect()
engine.placeOrigin({ w: r.width, h: r.height })
