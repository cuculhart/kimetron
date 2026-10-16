import { useEffect } from 'react'
import { formatLength } from '@kimetron/core'
import type { WorldObject } from '@kimetron/core'
import { IsleCanvas, useEngine, useEngineVersion } from '@kimetron/react'
import { canOverlap, FURNITURE, GRID_CFG, sampleDoc, spawn } from './model'
import type { ItemData } from './model'
import '../../demo/src/styles.css'

export function App() {
  const engine = useEngine({
    units: 'mm',
    origin: 'top-left',
    grid: GRID_CFG,
  })
  useEngineVersion(engine)

  useEffect(() => {
    engine.collisionMode = 'reject'
    engine.canOverlap = canOverlap
  }, [engine])

  useEffect(() => {
    const { objects } = sampleDoc()
    engine.setDoc({ ...engine.doc, objects })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'Delete' || e.key === 'Backspace') engine.removeSelected()
      else if (mod && e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); engine.redo() }
      else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); engine.undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); engine.redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine])

  const { doc } = engine
  const u = doc.units

  const add = (kind: string) => {
    const o = spawn(kind)
    engine.addObject(o)
    engine.setSelection([o.id])
  }

  return (
    <div className="app">
      <header className="bar">
        <strong><a href="../" style={{ color: 'inherit', textDecoration: 'none' }}>Kimetron Isle</a></strong>
        <span className="sep" />
        <span className="hint">floor-plan driver (spike)</span>
        {Object.keys(FURNITURE).map((k) => (
          <button key={k} onClick={() => add(k)}>+{FURNITURE[k].label}</button>
        ))}
        <span className="sep" />
        <button onClick={() => engine.undo()} disabled={!engine.canUndo}>undo</button>
        <button onClick={() => engine.redo()} disabled={!engine.canRedo}>redo</button>
      </header>
      <IsleCanvas
        engine={engine}
        style={{ flex: 1 }}
        renderObject={(o: WorldObject) => {
          if (o.kind === 'floor') return null
          const d = o.data as ItemData | undefined
          return (
            <div className="obj-label">
              {d?.label && <b>{d.label}</b>}
              <span>
                {formatLength(o.w, u)} × {formatLength(o.h, u)}
              </span>
            </div>
          )
        }}
      />
      <footer className="bar">
        <span>scale {engine.scaleText()}</span>
        <span>
          cursor ({formatLength(engine.cursorWorld.x, u)},{' '}
          {formatLength(engine.cursorWorld.y, u)})
        </span>
        <span>selected {engine.selectedIds.size}</span>
        <span>objects {doc.objects.length}</span>
        <span className="sep" />
        <span className="hint">
          10 mm grid / 100 mm major — solids may abut but not overlap (reject); doors may sit on walls (canOverlap)
        </span>
      </footer>
    </div>
  )
}
