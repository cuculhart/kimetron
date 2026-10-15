import { KIMETRON_VERSION } from '@kimetron/core'

export function App() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem' }}>
      <h1>Kimetron Isle</h1>
      <p>World-coordinate canvas engine — position is data.</p>
      <p>engine v{KIMETRON_VERSION} — playground under construction.</p>
    </main>
  )
}
