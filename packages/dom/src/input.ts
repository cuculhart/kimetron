import type { Engine, Pt } from '@kimetron/core'

export function attachInput(el: HTMLElement, engine: Engine): () => void {
  const toLocal = (e: { clientX: number; clientY: number }): Pt => {
    const r = el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const down = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId)
    engine.pointerDown(toLocal(e), { button: e.button, additive: e.shiftKey })
    e.preventDefault()
  }
  const move = (e: PointerEvent) => engine.pointerMove(toLocal(e))
  const up = (e: PointerEvent) => {
    engine.pointerUp()
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }
  const wheel = (e: WheelEvent) => {
    e.preventDefault()
    engine.wheel(toLocal(e), e.deltaY)
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
