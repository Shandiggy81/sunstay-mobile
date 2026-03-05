import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

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
    document.body.innerHTML = `
        <div style="padding: 20px; font-family: sans-serif; text-align: center; color: #333;">
            <h1 style="color: #e11d48;">Sunstay Failed to Load</h1>
            <p>We encountered a critical error while starting the app.</p>
            <pre style="background: #f1f5f9; padding: 15px; border-radius: 8px; text-align: left; overflow: auto;">${e.toString()}</pre>
            <p style="margin-top: 20px; font-size: 12px; color: #64748b;">Please verify your Mapbox token and network connection.</p>
        </div>
    `
}
