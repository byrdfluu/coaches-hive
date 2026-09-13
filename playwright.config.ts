import { defineConfig } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd(), true)

export default defineConfig({
  testDir: './tests',
  retries: 0,
  workers: 1,
  use: {
    browserName: 'webkit',
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
})
