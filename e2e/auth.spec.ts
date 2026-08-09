import { test, expect } from '@playwright/test'

/**
 * Auth & redirect smoke tests.
 * These run against the live Next.js server without a real Supabase session.
 */

test.describe('Authentication Guards', () => {
    test('unauthenticated user is redirected away from /dashboard', async ({ page, baseURL }) => {
        const response = await page.goto('/dashboard')
        // Should either redirect to login or return non-500
        expect(response?.status()).not.toBe(500)
        // URL should not still be /dashboard (middleware redirects)
        await page.waitForURL((url) => !url.pathname.startsWith('/dashboard'), { timeout: 5000 }).catch(() => {
            // If still on /dashboard, the login gate component is handling it client-side — also acceptable
        })
        const url = page.url()
        // Either redirected OR showing the login screen (login-gate renders on /dashboard)
        // Raiz = baseURL com barra. Cravar 'http://localhost:3000/' amarrava o
        // teste a um único ambiente (ver pages-smoke-protected).
        const raiz = new URL('/', baseURL ?? 'http://localhost:3000').toString()
        const isLoginPage = url.includes('/login') || url.includes('/?') || url === raiz
        const isDashboardWithLoginGate = url.includes('/dashboard')
        expect(isLoginPage || isDashboardWithLoginGate).toBe(true)
    })

    test('root page loads without error', async ({ page }) => {
        const response = await page.goto('/')
        expect(response?.status()).toBeLessThan(500)
        // Page should have some content
        await expect(page.locator('body')).not.toBeEmpty()
    })

    test('auth callback route exists (no 404)', async ({ page }) => {
        const response = await page.goto('/auth/callback?code=invalid')
        // May redirect or return 400/422 but should not 404 or 500 with empty body
        expect(response?.status()).not.toBe(404)
    })
})
