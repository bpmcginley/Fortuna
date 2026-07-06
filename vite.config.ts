import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base is './' so the built site works from any subpath (e.g. GitHub Pages project sites).
export default defineConfig({
  base: './',
  plugins: [react()],
})
