import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@capra/theme/base.css'
import '@capra/icons/styles.css'
import '@capra/core/styles.css'
import './index.css'
import './app/styles/nb-palettes.css'
import '@jupyter-widgets/controls/css/widgets.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
