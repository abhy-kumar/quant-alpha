import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

console.log('[Alpha] main.tsx executing...')

try {
  const rootEl = document.getElementById('root')
  console.log('[Alpha] #root element:', rootEl ? 'found' : 'MISSING')

  if (!rootEl) {
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif"><h1>Alpha: #root element not found</h1><p>The HTML root element is missing. Check index.html.</p></div>'
    throw new Error('#root element not found')
  }

  const root = createRoot(rootEl)
  console.log('[Alpha] createRoot succeeded')

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  console.log('[Alpha] render() called')
} catch (e) {
  console.error('[Alpha] Fatal error in main.tsx:', e)
  document.body.innerHTML = '<div style="padding:40px;font-family:monospace;white-space:pre-wrap;background:#fff;color:#c00">' +
    '<h1>Alpha failed to start</h1><pre>' + (e instanceof Error ? e.stack || e.message : String(e)) + '</pre></div>'
}
