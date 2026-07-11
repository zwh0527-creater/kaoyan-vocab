import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startPwaRegistration } from './pwa'
import './styles.css'

startPwaRegistration()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
