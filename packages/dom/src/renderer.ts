import type { Engine, WorldObject } from '@kimetron/core'
import { attachInput } from './input'
import { injectStyles, marqueeFrame, objectFrame } from './style'

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

  const objEls = new Map<string, HTMLElement>()

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
      marqueeEl.remove()
      container.classList.remove('ki-canvas')
    },
  }
}
