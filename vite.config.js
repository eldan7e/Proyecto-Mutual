import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/ - Force reload: 2026-07-21
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1600,
  },
})
