import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/theme.css'
import './styles.css'
import ErrorBoundary from './ErrorBoundary.jsx'

const BG_TIMEOUT_MS = 10 * 1000
const UPDATED_FLAG = 'nova_updated_toast'
let hiddenAt = 0

let updateNotice = ''
try {
  updateNotice = sessionStorage.getItem(UPDATED_FLAG) || ''
  sessionStorage.removeItem(UPDATED_FLAG)
} catch {}

let swReg = null

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      swReg = registration
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        try { sessionStorage.setItem(UPDATED_FLAG, '1') } catch {}
        window.location.reload()
      })
    }).catch(() => {})
  })
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now()
  } else {
    if (swReg) { try { swReg.update() } catch {} }
    const hiddenFor = hiddenAt ? Date.now() - hiddenAt : 0
    if (hiddenFor >= BG_TIMEOUT_MS) {
      try { sessionStorage.setItem(UPDATED_FLAG, '1') } catch {}
      window.location.reload()
    }
    hiddenAt = 0
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App updateNotice={updateNotice} />
    </ErrorBoundary>
  </React.StrictMode>
)