import { defineConfig, type Plugin } from 'vite'
import { handleApi } from './server/http.ts'

const localApi: Plugin = {
  name: 'configurator-api',
  configureServer(server) {
    server.middlewares.use('/api/quote', (req, res) => void handleApi('quote', req, res))
    server.middlewares.use('/api/cart', (req, res) => void handleApi('cart', req, res))
  },
  configurePreviewServer(server) {
    server.middlewares.use('/api/quote', (req, res) => void handleApi('quote', req, res))
    server.middlewares.use('/api/cart', (req, res) => void handleApi('cart', req, res))
  },
}

export default defineConfig({
  publicDir: 'Tent_glb (1)',
  plugins: [localApi],
  build: { rollupOptions: { output: { manualChunks(id) {
    if (id.includes('/node_modules/three/')) return 'three'
  } } } },
})
