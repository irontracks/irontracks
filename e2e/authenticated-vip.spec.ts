import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: VIP Features
 * User is vip_elite — all VIP pages and APIs must work.
 * These tests directly cover bugs B5 (VIP tab blank) and B6 (404 calories_estimate).
 */

test.describe('VIP Pages — Not Blank (Bug B5)', () => {
    test('VIP dashboard tab loads content (not blank)', async ({ page }) => {
        await page.goto('/dashboard')
        await page.waitForTimeout(4000)

        // Click VIP tab
        const vipTab = page.locator('button:has-text("VIP"), [role="tab"]:has-text("VIP")')
        if (await vipTab.count() > 0) {
            await vipTab.first().click()
            await page.waitForTimeout(3000)

            const body = await page.textContent('body')
            // Must have content — not a blank screen
            expect(body?.length).toBeGreaterThan(100)

            // Must NOT show generic error or empty state only
            const html = await page.content()
            expect(html).not.toContain('Erro interno')
        }
    })

    test('/dashboard/vip/analytics loads without blank (Bug B5)', async ({ page }) => {
        const res = await page.goto('/dashboard/vip/analytics', { waitUntil: 'domcontentloaded' })
        expect(res?.status()).not.toBe(500)
        await page.waitForTimeout(3000)

        // May redirect to /marketplace if access denied, but must not be blank or 500
        const url = page.url()
        const body = await page.textContent('body')
        expect(body?.length).toBeGreaterThan(50)
        // Should be on analytics OR marketplace (redirect for non-VIP), not login
        expect(url).not.toContain('/login')
    })

    test('/dashboard/vip/chef-ia loads without blank', async ({ page }) => {
        const res = await page.goto('/dashboard/vip/chef-ia', { waitUntil: 'domcontentloaded' })
        expect(res?.status()).not.toBe(500)
        await page.waitForTimeout(3000)

        const body = await page.textContent('body')
        expect(body?.length).toBeGreaterThan(50)
        expect(page.url()).not.toContain('/login')
    })

    test('/dashboard/vip/offline loads without blank', async ({ page }) => {
        const res = await page.goto('/dashboard/vip/offline', { waitUntil: 'domcontentloaded' })
        expect(res?.status()).not.toBe(500)
        await page.waitForTimeout(3000)

        const body = await page.textContent('body')
        expect(body?.length).toBeGreaterThan(50)
    })
})

test.describe('VIP API — Status & Access (Bug B6)', () => {
    test('GET /api/vip/status returns tier for authenticated user', async ({ request }) => {
        const res = await request.get('/api/vip/status')
        expect(res.status()).toBe(200)
        const body = await res.json()
        // Should have tier info
        expect(body).toHaveProperty('tier')
        expect(body.tier).toBeTruthy()
    })

    test('GET /api/vip/welcome-status returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/welcome-status')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/vip/periodization/stats returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/periodization/stats')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/vip/periodization/active returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/periodization/active')
        // 403 is ok if feature requires a specific VIP sub-tier, but not 500 or 401
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/vip/profile returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/profile')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/vip/access returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/access')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('calories estimate API returns non-500 (Bug B6)', async ({ request }) => {
        // This was the 404 bug — calories_estimate column on workout_sessions
        const res = await request.get('/api/calories/estimate')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(404)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('VIP Chat API', () => {
    test('GET /api/vip/chat/thread returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/chat/thread')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})
