import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import App from './App'

const root = document.getElementById('root')
if (!root) {
  throw new Error('#root missing')
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
