import type { Engine, Pt } from '@kimetron/core'
import { screenDirToWorld } from './style'

export function attachInput(el: HTMLElement, engine: Engine): () => void {
  const toLocal = (e: { clientX: number; clientY: number }): Pt => {
    const r = el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const down = (e: PointerEvent) => {
    const handle = (e.target as HTMLElement).closest?.(
      '[data-ki-handle]',
    ) as HTMLElement | null
    if (handle?.dataset.kiObj) {
      engine.startResize(
        toLocal(e),
        handle.dataset.kiObj,
        screenDirToWorld(handle.dataset.kiHandle ?? '', engine.doc.origin),
      )
    } else {
      engine.pointerDown(toLocal(e), {
        button: e.button,
        additive: e.shiftKey,
      })
    }
    el.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  const move = (e: PointerEvent) => engine.pointerMove(toLocal(e))
  const up = (e: PointerEvent) => {
    engine.pointerUp()
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }
  const wheel = (e: WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      // trackpad pinch (or Ctrl+wheel): zoom
      engine.wheel(toLocal(e), e.deltaY)
    } else if (e.deltaX !== 0 || e.shiftKey) {
      // trackpad two-finger scroll or Shift+wheel: pan
      const dx = e.deltaX + (e.shiftKey ? e.deltaY : 0)
      const dy = e.shiftKey ? 0 : e.deltaY
      engine.panBy(dx, dy)
    } else {
      engine.wheel(toLocal(e), e.deltaY)
    }
  }

  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  el.addEventListener('wheel', wheel, { passive: false })

  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
    el.removeEventListener('wheel', wheel)
  }
}
