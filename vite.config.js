import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
     tailwindcss(),
  ],
  server: {
    port: 5000,
    host: true,
    allowedHosts: true,
  },
  optimizeDeps: {
    include: [
      'use-sync-external-store/shim/index.js',
      'use-sync-external-store',
    ],
  },
})
