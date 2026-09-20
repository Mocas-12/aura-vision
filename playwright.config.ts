import { defineConfig } from '@playwright/test'

// CI post-deploy runs set E2E_BASE_URL to smoke the production site directly;
// local runs default to a private production-mode preview (built with --mode e2e
// so VITE_API_BASE points at the real backend).
const baseURL = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: baseURL ?? 'http://localhost:4174',
    launchOptions: {
      // Auto-grant camera permission and feed a synthetic video stream.
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  ...(baseURL
    ? {}
    : {
        webServer: {
          command: 'npm run build:e2e && npx vite preview --port 4174 --strictPort',
          url: 'http://localhost:4174/aura-vision/',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
})
