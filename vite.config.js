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
                manualChunks(id) {
                    if (id.includes('node_modules/react-dom/') || id.includes('node_modules/react/')) return 'vendor';
                    if (id.includes('node_modules/mapbox-gl/')) return 'map';
                    if (id.includes('node_modules/framer-motion/')) return 'ui';
                    if (id.includes('node_modules/@xweather/mapsgl/')) return 'mapsgl';
                },
            },
        },
    },
})
