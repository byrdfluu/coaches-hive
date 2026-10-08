import { defineConfig } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd(), true)

export default defineConfig({
  testDir: './tests',
  retries: 0,
  timeout: 60 * 1000,
  workers: 1,
  use: {
    browserName: 'webkit',
    baseURL: 'http://localhost:3000',
    serviceWorkers: 'block',
    trace: 'on-first-retry',
  },
  webServer: {
    command: process.env.PLAYWRIGHT_USE_BUILD === 'true' ? 'npm start' : 'npm run dev',
    port: 3000,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === 'true',
    timeout: 120 * 1000,
  },
})
