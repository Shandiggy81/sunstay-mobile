import * as Sentry from '@sentry/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/weather-bg.css'
import './styles/quick-pills.css'
import App from './App.jsx'

// Public client DSN. Set VITE_SENTRY_DSN, or replace this placeholder.
// The placeholder stays disabled so it does not send. A real DSN turns on
// GlobalHandlers for unhandled errors and promise rejections.
const SENTRY_DSN_PLACEHOLDER = 'https://examplePublicKey@o0.ingest.sentry.io/0'
const sentryDsn = import.meta.env.VITE_SENTRY_DSN || SENTRY_DSN_PLACEHOLDER

Sentry.init({
    dsn: sentryDsn,
    enabled: sentryDsn !== SENTRY_DSN_PLACEHOLDER,
    environment: import.meta.env.MODE,
    integrations: [
        Sentry.globalHandlersIntegration({
            onerror: true,
            onunhandledrejection: true,
        }),
    ],
})

const container = document.getElementById('root')

try {
    const root = createRoot(container)
    root.render(
        <StrictMode>
            <App />
        </StrictMode>,
    )
} catch (e) {
    console.error("Critical Boot Error:", e)
    Sentry.captureException(e)
    document.body.innerHTML = `
        <div style="padding: 20px; font-family: sans-serif; text-align: center; color: #333;">
            <h1 style="color: #e11d48;">Sunstay Failed to Load</h1>
            <p>We encountered a critical error while starting the app.</p>
            <pre style="background: #f1f5f9; padding: 15px; border-radius: 8px; text-align: left; overflow: auto;">${e.toString()}</pre>
            <p style="margin-top: 20px; font-size: 12px; color: #64748b;">Please verify your Mapbox token and network connection.</p>
        </div>
    `
}
