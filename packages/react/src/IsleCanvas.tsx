import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Engine } from '@kimetron/core'
import type { Doc, WorldConfig, WorldObject } from '@kimetron/core'
import { attachInput, edgeAttrs, edgeMarkerDefs, gridBackground, handlePoints, injectStyles, marqueeFrame, objectFrame, portPoints, routePathD } from '@kimetron/dom'

export function useEngine(cfg?: WorldConfig): Engine {
  const ref = useRef<Engine | null>(null)
  if (!ref.current) ref.current = new Engine(cfg)
  return ref.current
}

export function useEngineVersion(engine: Engine): number {
  return useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.version,
  )
}

export interface IsleCanvasProps {
  engine: Engine
  renderObject?: (o: WorldObject) => ReactNode
  onDocChange?: (doc: Doc) => void
  onSelectionChange?: (ids: ReadonlySet<string>) => void
  autoOrigin?: boolean
  className?: string
  style?: CSSProperties
}

export function IsleCanvas({
  engine,
  renderObject,
  onDocChange,
  onSelectionChange,
  autoOrigin = true,
  className,
  style,
}: IsleCanvasProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEngineVersion(engine)

  useEffect(() => {
    injectStyles()
    const el = ref.current
    if (!el) return
    const detach = attachInput(el, engine)
    const offDoc = onDocChange ? engine.onDocChange(onDocChange) : undefined
    const offSel = onSelectionChange ? engine.onSelectionChange(onSelectionChange) : undefined
    return () => {
      detach()
      offDoc?.()
      offSel?.()
    }
  }, [engine, onDocChange, onSelectionChange])

  const origin = engine.doc.origin
  useEffect(() => {
    if (!autoOrigin || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) engine.placeOrigin({ w: r.width, h: r.height })
  }, [autoOrigin, origin, engine])

  const marquee = marqueeFrame(engine)
  const connectPreview = engine.connectPreview()
  const selObj =
    engine.selectedIds.size === 1
      ? engine.doc.objects.find((o) => engine.selectedIds.has(o.id))
      : undefined
  const handles = selObj ? handlePoints(objectFrame(engine, selObj)) : []

  return (
    <div
      ref={ref}
      className={className ?? 'ki-canvas'}
      style={{ ...gridBackground(engine), ...style }}
    >
      <svg className="ki-edges">
        <defs>
          {engine.doc.edges.flatMap((e) =>
            edgeMarkerDefs(engine, e).map((m) => (
              <marker
                key={m.id}
                id={m.id}
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
                markerWidth={m.kind === 'arrow' ? 10 : 8}
                markerHeight={8}
                refX={m.kind === 'arrow' ? 9 : 4}
                refY={4}
              >
                {m.kind === 'arrow' ? (
                  <path d="M 0 0 L 10 4 L 0 8 z" style={{ fill: m.color }} />
                ) : (
                  <circle cx={4} cy={4} r={3} style={{ fill: m.color }} />
                )}
              </marker>
            )),
          )}
        </defs>
        {engine.doc.edges.map((e) => {
          const a = edgeAttrs(engine, e)
          if (!a) return null
          return (
            <path
              key={e.id}
              className={engine.selectedIds.has(e.id) ? 'ki-edge ki-sel' : 'ki-edge'}
              d={a.d}
              stroke={a.stroke}
              strokeWidth={a.strokeWidth}
              strokeDasharray={a.strokeDasharray}
              markerStart={a.markerStart}
              markerEnd={a.markerEnd}
            />
          )
        })}
        {connectPreview && (
          <path
            className={
              engine.connect?.invalid ? 'ki-edge-preview ki-invalid' : 'ki-edge-preview'
            }
            d={routePathD(engine, connectPreview.from, connectPreview.to, 'straight')}
          />
        )}
      </svg>
      {engine.doc.objects.map((o) => {
        const f = objectFrame(engine, o)
        const sel = engine.selectedIds.has(o.id)
        return (
          <div
            key={o.id}
            className={sel ? 'ki-obj ki-sel' : 'ki-obj'}
            style={{
              transform: `translate(${f.left}px, ${f.top}px)`,
              width: f.width,
              height: f.height,
              background: o.style?.fill,
              borderColor: sel ? undefined : o.style?.stroke,
            }}
          >
            {renderObject ? renderObject(o) : o.id}
          </div>
        )
      })}
      <div className="ki-ports">
        {engine.doc.objects.flatMap((o) =>
          portPoints(engine, o).map(({ port, x, y }) => (
            <div
              key={`${o.id}:${port.id}`}
              className="ki-port"
              data-ki-obj={o.id}
              data-ki-port={port.id}
              style={{ transform: `translate(${x}px, ${y}px)` }}
            />
          )),
        )}
      </div>
      {engine.guides.map((g, i) => {
        const pos = engine.worldToScreen({ x: g.at, y: g.at })
        return (
          <div
            key={i}
            className={g.axis === 'x' ? 'ki-guide ki-guide-v' : 'ki-guide ki-guide-h'}
            style={g.axis === 'x' ? { left: pos.x } : { top: pos.y }}
          />
        )
      })}
      {handles.map((h) => (
        <div
          key={h.dir}
          className="ki-handle"
          data-ki-handle={h.dir}
          data-ki-obj={selObj?.id}
          style={{ transform: `translate(${h.x}px, ${h.y}px)`, cursor: h.cursor }}
        />
      ))}
      {marquee && (
        <div
          className="ki-marquee"
          style={{
            transform: `translate(${marquee.left}px, ${marquee.top}px)`,
            width: marquee.width,
            height: marquee.height,
          }}
        />
      )}
    </div>
  )
}
