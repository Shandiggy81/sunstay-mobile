import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    base: '/',
    envPrefix: ['VITE_'],
    plugins: [react()],
    server: {
        port: 5173,
        open: true,
    },
    publicDir: 'public',
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['react', 'react-dom'],
                    map: ['mapbox-gl'],
                    ui: ['framer-motion'],
                },
            },
        },
    },
})
