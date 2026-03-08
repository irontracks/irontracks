import { chromium, type FullConfig } from '@playwright/test'

/**
 * Global setup for authenticated E2E tests.
 *
 * Logs in via Supabase and persists the browser storage state so that
 * tests in the "authenticated" project can skip the login step.
 *
 * Required env vars:
 *   E2E_USER_EMAIL    – Supabase user email
 *   E2E_USER_PASSWORD – Supabase user password
 */
export default async function globalSetup(_config: FullConfig) {
    const email = process.env.E2E_USER_EMAIL
    const password = process.env.E2E_USER_PASSWORD

    if (!email || !password) {
        console.warn(
            '[E2E] Skipping authenticated setup — E2E_USER_EMAIL / E2E_USER_PASSWORD not set.',
        )
        return
    }

    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

    const browser = await chromium.launch()
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
        // Navigate to login page
        await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle', timeout: 15_000 })

        // Wait for login form to appear
        await page.waitForSelector('input[type="email"]', { timeout: 10_000 })

        // Fill credentials
        await page.fill('input[type="email"]', email)
        await page.fill('input[type="password"]', password)

        // Submit the form
        await page.click('button[type="submit"]')

        // Wait for redirect to dashboard (successful login)
        await page.waitForURL(
            (url) => url.pathname.includes('/dashboard') || url.pathname === '/',
            { timeout: 15_000 },
        )

        // Extra wait for Supabase session to settle in localStorage/cookies
        await page.waitForTimeout(2000)

        // Save storage state
        await context.storageState({ path: 'e2e/.auth/user.json' })
        console.log('[E2E] Authenticated storage state saved to e2e/.auth/user.json')
    } catch (err) {
        console.error('[E2E] Auth setup failed:', err)
        // Don't throw — let unauthenticated tests still run
    } finally {
        await browser.close()
    }
}
