import { defineConfig } from '@playwright/test'
import fs from 'node:fs'

const systemChromiumPath = fs.existsSync('/usr/lib/chromium/chromium')
  ? '/usr/lib/chromium/chromium'
  : fs.existsSync('/usr/bin/chromium')
    ? '/usr/bin/chromium'
    : undefined

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 390, height: 844 }, // iPhone 390px default mobile viewport
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? systemChromiumPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
