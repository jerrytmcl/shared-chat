import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installDiagnostics } from './lib/diagnostics'
import App from './App.jsx'

installDiagnostics()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
