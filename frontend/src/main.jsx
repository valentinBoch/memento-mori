// frontend/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './i18n';
import { registerSW } from 'virtual:pwa-register'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Register PWA Service Worker (only if supported)
if ('serviceWorker' in navigator) {
  // auto update the SW
  registerSW({ immediate: true, onRegisteredSW(swUrl, registration) { /* noop */ } })
}