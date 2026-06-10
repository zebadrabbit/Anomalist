/**
 * Anomalist Screenshot Automation
 *
 * Takes screenshots of key UI views for the docs wiki.
 * Run from the docs/ directory: node scripts/screenshots.mjs
 *
 * Requirements:
 *   - Anomalist running at ANOMALIST_URL (default: http://localhost:3000)
 *   - ANOMALIST_USER and ANOMALIST_PASS env vars set (owner account)
 *   - npx playwright install chromium (first time)
 *
 * Output: docs/public/screenshots/*.png
 */

import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'screenshots')
const BASE_URL = process.env.ANOMALIST_URL || 'http://localhost:3000'
const USER = process.env.ANOMALIST_USER || 'admin'
const PASS = process.env.ANOMALIST_PASS || 'password'

// 1920×1080 so screenshots look sharp in docs
const VIEWPORT = { width: 1920, height: 1080 }

mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: VIEWPORT })
const page = await ctx.newPage()

// ─── helpers ────────────────────────────────────────────────────────────────

async function shot(name, fn) {
  console.log(`📸  ${name}`)
  await fn()
  await page.waitForLoadState('networkidle')
  await page.screenshot({
    path: join(OUT_DIR, `${name}.png`),
    fullPage: false,
  })
}

async function login() {
  await page.goto(`${BASE_URL}/login`)
  await page.fill('[name=username]', USER)
  await page.fill('[name=password]', PASS)
  await page.click('[type=submit]')
  await page.waitForURL(`${BASE_URL}/`)
}

// ─── shots ──────────────────────────────────────────────────────────────────

await login()

// Dashboard overview (canvas + widget list)
await shot('dashboard', async () => {
  await page.goto(`${BASE_URL}/`)
})

// Add widget panel — open it
await shot('add-widget', async () => {
  await page.goto(`${BASE_URL}/`)
  const addBtn = page.locator('button', { hasText: /add widget/i })
  await addBtn.click()
  await page.waitForSelector('[data-widget-picker]', { state: 'visible' })
})

// Widget settings — click the first widget on the canvas
await shot('widget-settings', async () => {
  await page.goto(`${BASE_URL}/`)
  const firstWidget = page.locator('[data-canvas-widget]').first()
  await firstWidget.click()
  await page.waitForSelector('[data-settings-panel]', { state: 'visible' })
})

// Twitch settings panel
await shot('twitch-settings', async () => {
  await page.goto(`${BASE_URL}/settings`)
  const twitchTab = page.locator('[data-tab=twitch]')
  if (await twitchTab.count()) await twitchTab.click()
})

// Alert configuration
await shot('alerts', async () => {
  await page.goto(`${BASE_URL}/settings`)
  const alertTab = page.locator('[data-tab=alerts]')
  if (await alertTab.count()) await alertTab.click()
})

// Media library
await shot('media', async () => {
  await page.goto(`${BASE_URL}/media`)
})

// User management
await shot('users', async () => {
  await page.goto(`${BASE_URL}/settings/users`)
})

// Overlay (as OBS would see it) — screenshot at overlay resolution
await shot('overlay', async () => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`${BASE_URL}/overlay`)
  await page.waitForTimeout(1000) // let animations settle
})

// ─── done ────────────────────────────────────────────────────────────────────

await browser.close()
console.log(`\n✅  Screenshots written to docs/public/screenshots/`)
console.log(`    ${Object.keys({ dashboard: 1, 'add-widget': 1, 'widget-settings': 1, 'twitch-settings': 1, alerts: 1, media: 1, users: 1, overlay: 1 }).length} files`)
