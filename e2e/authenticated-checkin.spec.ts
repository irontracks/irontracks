import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Check-in
 * The /checkin page requires a QR token — without one it shows an error state.
 * Tests that the page handles missing/invalid tokens gracefully.
 */

test.describe('Check-in Page', () => {
    test('/checkin without token shows error state (not crash)', async ({ page }) => {
        const res = await page.goto('/checkin', { waitUntil: 'domcontentloaded' })
        expect(res?.status()).not.toBe(500)
        await page.waitForTimeout(2000)

        const body = await page.textContent('body')
        // Should show IRONTRACKS branding at minimum
        expect(body?.toUpperCase()).toContain('IRON')
        // Should show some error message about invalid/missing token
        expect(body?.toLowerCase()).toMatch(/token|inválido|erro|check/i)
    })

    test('/checkin with fake token shows error state (not crash)', async ({ page }) => {
        const res = await page.goto('/checkin?token=fake-token-123', { waitUntil: 'domcontentloaded' })
        expect(res?.status()).not.toBe(500)
        await page.waitForTimeout(3000)

        const body = await page.textContent('body')
        expect(body?.length).toBeGreaterThan(20)
        // Should NOT be a blank page
        expect(body?.trim()).not.toBe('')
    })

    test('/checkin has no fatal JS errors', async ({ page }) => {
        const jsErrors: string[] = []
        page.on('pageerror', err => jsErrors.push(err.message))

        await page.goto('/checkin?token=invalid')
        await page.waitForTimeout(3000)

        const fatal = jsErrors.filter(e =>
            !e.includes('ResizeObserver') &&
            !e.includes('non-Error promise') &&
            !e.includes('AbortError')
        )
        expect(fatal).toHaveLength(0)
    })
})

test.describe('GPS & Check-in API', () => {
    test('POST /api/gps/qr-checkin rejects invalid token (not 500)', async ({ request }) => {
        const res = await request.post('/api/gps/qr-checkin', {
            data: { qr_token: 'invalid-token-test' },
        })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        const body = await res.json()
        expect(body.ok).toBe(false)
    })

    test('GET /api/gps/gyms returns non-500', async ({ request }) => {
        const res = await request.get('/api/gps/gyms')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/gps/settings returns non-500', async ({ request }) => {
        const res = await request.get('/api/gps/settings')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})
