import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { reactRouter } from '@react-router/dev/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})

