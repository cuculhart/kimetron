import type { Engine, WorldObject } from '@kimetron/core'
import { attachInput } from './input'
import {
  edgeAttrs,
  edgeMarkerDefs,
  handlePoints,
  injectStyles,
  marqueeFrame,
  objectFrame,
  portPoints,
  routePathD,
} from './style'

const SVG_NS = 'http://www.w3.org/2000/svg'

function markerEl(def: { id: string; kind: string; color: string }): SVGMarkerElement {
  const m = document.createElementNS(SVG_NS, 'marker')
  m.setAttribute('id', def.id)
  m.setAttribute('markerUnits', 'userSpaceOnUse')
  m.setAttribute('orient', 'auto-start-reverse')
  let glyph: SVGElement
  if (def.kind === 'arrow') {
    m.setAttribute('markerWidth', '10')
    m.setAttribute('markerHeight', '8')
    m.setAttribute('refX', '9')
    m.setAttribute('refY', '4')
    glyph = document.createElementNS(SVG_NS, 'path')
    glyph.setAttribute('d', 'M 0 0 L 10 4 L 0 8 z')
  } else {
    m.setAttribute('markerWidth', '8')
    m.setAttribute('markerHeight', '8')
    m.setAttribute('refX', '4')
    m.setAttribute('refY', '4')
    glyph = document.createElementNS(SVG_NS, 'circle')
    glyph.setAttribute('cx', '4')
    glyph.setAttribute('cy', '4')
    glyph.setAttribute('r', '3')
  }
  glyph.style.fill = def.color
  m.appendChild(glyph)
  return m
}

export interface RendererOptions {
  engine: Engine
  renderObject?: (o: WorldObject) => HTMLElement | string
}

export interface Renderer {
  destroy(): void
}

export function createRenderer(container: HTMLElement, opts: RendererOptions): Renderer {
  const { engine } = opts
  const renderObject = opts.renderObject ?? ((o: WorldObject) => o.id)

  injectStyles()
  container.classList.add('ki-canvas')

  const edgeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  edgeSvg.setAttribute('class', 'ki-edges')
  container.appendChild(edgeSvg)

  const marqueeEl = document.createElement('div')
  marqueeEl.className = 'ki-marquee'
  marqueeEl.style.display = 'none'
  container.appendChild(marqueeEl)

  const portLayer = document.createElement('div')
  portLayer.className = 'ki-ports'
  container.appendChild(portLayer)

  const guideLayer = document.createElement('div')
  guideLayer.className = 'ki-guides'
  container.appendChild(guideLayer)

  const objEls = new Map<string, HTMLElement>()

  const handleEls = handlePoints({ left: 0, top: 0, width: 0, height: 0 }).map((h) => {
    const el = document.createElement('div')
    el.className = 'ki-handle'
    el.dataset.kiHandle = h.dir
    el.hidden = true
    container.appendChild(el)
    return el
  })

  function render(): void {
    const seen = new Set<string>()
    for (const o of engine.doc.objects) {
      seen.add(o.id)
      let el = objEls.get(o.id)
      if (!el) {
        el = document.createElement('div')
        el.className = 'ki-obj'
        el.dataset.id = o.id
        const content = renderObject(o)
        if (typeof content === 'string') el.textContent = content
        else el.appendChild(content)
        container.appendChild(el)
        objEls.set(o.id, el)
      }
      const f = objectFrame(engine, o)
      el.style.transform = `translate(${f.left}px, ${f.top}px)`
      el.style.width = `${f.width}px`
      el.style.height = `${f.height}px`
      const sel = engine.selectedIds.has(o.id)
      el.classList.toggle('ki-sel', sel)
      el.style.background = o.style?.fill ?? ''
      el.style.borderColor = sel ? '' : (o.style?.stroke ?? '')
    }
    for (const [id, el] of objEls) {
      if (!seen.has(id)) {
        el.remove()
        objEls.delete(id)
      }
    }

    const selObj =
      engine.selectedIds.size === 1
        ? engine.doc.objects.find((o) => engine.selectedIds.has(o.id))
        : undefined
    if (selObj) {
      const pts = handlePoints(objectFrame(engine, selObj))
      for (const el of handleEls) {
        const p = pts.find((p) => p.dir === el.dataset.kiHandle)
        if (!p) continue
        el.hidden = false
        el.dataset.kiObj = selObj.id
        el.style.transform = `translate(${p.x}px, ${p.y}px)`
        el.style.cursor = p.cursor
      }
    } else {
      for (const el of handleEls) el.hidden = true
    }

    const defs = document.createElementNS(SVG_NS, 'defs')
    for (const e of engine.doc.edges) {
      for (const m of edgeMarkerDefs(engine, e)) defs.appendChild(markerEl(m))
    }
    const edgeEls = engine.doc.edges.flatMap((e) => {
      const a = edgeAttrs(engine, e)
      if (!a) return []
      const p = document.createElementNS(SVG_NS, 'path')
      p.setAttribute('class', engine.selectedIds.has(e.id) ? 'ki-edge ki-sel' : 'ki-edge')
      p.setAttribute('d', a.d)
      if (a.stroke) p.setAttribute('stroke', a.stroke)
      if (a.strokeWidth) p.setAttribute('stroke-width', String(a.strokeWidth))
      if (a.strokeDasharray) p.setAttribute('stroke-dasharray', a.strokeDasharray)
      if (a.markerStart) p.setAttribute('marker-start', a.markerStart)
      if (a.markerEnd) p.setAttribute('marker-end', a.markerEnd)
      return [p]
    })
    const preview = engine.connectPreview()
    if (preview) {
      const p = document.createElementNS(SVG_NS, 'path')
      p.setAttribute(
        'class',
        engine.connect?.invalid ? 'ki-edge-preview ki-invalid' : 'ki-edge-preview',
      )
      p.setAttribute('d', routePathD(engine, preview.from, preview.to, 'straight'))
      edgeEls.push(p)
    }
    edgeSvg.replaceChildren(defs, ...edgeEls)

    portLayer.replaceChildren(
      ...engine.doc.objects.flatMap((o) =>
        portPoints(engine, o).map(({ port, x, y }) => {
          const el = document.createElement('div')
          el.className = 'ki-port'
          el.dataset.kiObj = o.id
          el.dataset.kiPort = port.id
          el.style.transform = `translate(${x}px, ${y}px)`
          return el
        }),
      ),
    )

    guideLayer.replaceChildren(
      ...engine.guides.map((g) => {
        const el = document.createElement('div')
        if (g.axis === 'x') {
          el.className = 'ki-guide ki-guide-v'
          el.style.left = `${engine.worldToScreen({ x: g.at, y: 0 }).x}px`
        } else {
          el.className = 'ki-guide ki-guide-h'
          el.style.top = `${engine.worldToScreen({ x: 0, y: g.at }).y}px`
        }
        return el
      }),
    )

    const mf = marqueeFrame(engine)
    if (mf) {
      marqueeEl.style.display = ''
      marqueeEl.style.transform = `translate(${mf.left}px, ${mf.top}px)`
      marqueeEl.style.width = `${mf.width}px`
      marqueeEl.style.height = `${mf.height}px`
    } else {
      marqueeEl.style.display = 'none'
    }
  }

  const unsubscribe = engine.subscribe(render)
  const detach = attachInput(container, engine)
  render()

  return {
    destroy() {
      unsubscribe()
      detach()
      for (const el of objEls.values()) el.remove()
      objEls.clear()
      for (const el of handleEls) el.remove()
      marqueeEl.remove()
      guideLayer.remove()
      portLayer.remove()
      edgeSvg.remove()
      container.classList.remove('ki-canvas')
    },
  }
}
