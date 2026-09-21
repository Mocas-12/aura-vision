import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VERCEL ? '/' : '/aura-vision/',
  plugins: [react()],
  test: {
    environment: 'node',
    // Playwright lives in e2e/; keep vitest away from its *.spec.ts files.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
})
