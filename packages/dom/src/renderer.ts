import type { Engine, WorldObject } from '@kimetron/core'
import { attachInput } from './input'
import { handlePoints, injectStyles, marqueeFrame, objectFrame } from './style'

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

  const marqueeEl = document.createElement('div')
  marqueeEl.className = 'ki-marquee'
  marqueeEl.style.display = 'none'
  container.appendChild(marqueeEl)

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
      el.classList.toggle('ki-sel', engine.selectedIds.has(o.id))
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
      container.classList.remove('ki-canvas')
    },
  }
}
