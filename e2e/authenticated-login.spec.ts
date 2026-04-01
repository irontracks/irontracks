import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Login / Auth Flow
 *
 * The login form lives at / (root). When already authenticated,
 * the root page server-redirects to /dashboard.
 *
 * Requires: auth storage state (e2e/.auth/user.json).
 */
test.describe('Login Flow', () => {
    // Authenticated users hitting / should be redirected to /dashboard
    test('authenticated user at / is redirected to dashboard', async ({ page }) => {
        await page.goto('/')
        await page.waitForURL(url => url.toString().includes('/dashboard'), { timeout: 15_000 })
        expect(page.url()).toContain('/dashboard')
    })

    test('dashboard page has IronTracks brand', async ({ page }) => {
        await page.goto('/')
        await page.waitForTimeout(3000)
        const body = await page.textContent('body')
        expect(body?.toLowerCase()).toContain('iron')
    })

    test('direct /dashboard access works without re-login', async ({ page }) => {
        await page.goto('/dashboard')
        await page.waitForTimeout(3000)
        expect(page.url()).toContain('/dashboard')
        // Should NOT be back on login
        const body = await page.textContent('body')
        expect(body?.toLowerCase()).not.toContain('entrar com email')
    })
})
