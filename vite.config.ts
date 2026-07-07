import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base is './' so the built site works both as a static website and inside the
// Tauri desktop shell (served from a custom protocol root).
// The Tauri-specific tweaks below are inert for a plain web build.
export default defineConfig({
  base: './',
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // WebView2 on Windows is evergreen Chromium; target it directly.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'esnext',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
