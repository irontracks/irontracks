import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Extended page tests
 * Covers VIP sub-pages, admin acquisition page, wait-approval, workout update API.
 */

test.describe('VIP Sub-Pages', () => {
    test('/dashboard/vip/analytics loads without 500', async ({ page }) => {
        test.setTimeout(60_000)
        const res = await page.goto('/dashboard/vip/analytics', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        })
        expect(res?.status()).not.toBe(500)
    })

    test('/dashboard/vip/analytics renders content', async ({ page }) => {
        test.setTimeout(60_000)
        await page.goto('/dashboard/vip/analytics', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        })
        await page.waitForTimeout(3000)
        expect(page.url()).not.toContain('/login')
        const body = await page.textContent('body')
        expect(body?.length).toBeGreaterThan(20)
    })

    test('/dashboard/vip/chef-ia loads without 500', async ({ page }) => {
        test.setTimeout(60_000)
        const res = await page.goto('/dashboard/vip/chef-ia', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        })
        expect(res?.status()).not.toBe(500)
    })

    test('/dashboard/vip/chef-ia renders content', async ({ page }) => {
        test.setTimeout(60_000)
        await page.goto('/dashboard/vip/chef-ia', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        })
        await page.waitForTimeout(3000)
        expect(page.url()).not.toContain('/login')
        const body = await page.textContent('body')
        expect(body?.length).toBeGreaterThan(20)
    })

    test('/dashboard/vip/offline loads without 500', async ({ page }) => {
        test.setTimeout(60_000)
        const res = await page.goto('/dashboard/vip/offline', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        })
        expect(res?.status()).not.toBe(500)
    })
})

test.describe('Admin Acquisition Page', () => {
    test('/admin/acquisition loads without 500', async ({ page }) => {
        test.setTimeout(60_000)
        const res = await page.goto('/admin/acquisition', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        })
        expect(res?.status()).not.toBe(500)
    })

    test('/admin/acquisition renders without blank (admin user)', async ({ page }) => {
        test.setTimeout(60_000)
        await page.goto('/admin/acquisition', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        })
        await page.waitForTimeout(3000)
        const body = await page.textContent('body')
        expect(body?.length).toBeGreaterThan(20)
    })
})

test.describe('Wait Approval Page', () => {
    test('/wait-approval loads without 500', async ({ page }) => {
        test.setTimeout(30_000)
        const res = await page.goto('/wait-approval', {
            waitUntil: 'domcontentloaded',
            timeout: 20_000,
        })
        // Admin may be redirected away from wait-approval — either way, no 500
        expect(res?.status()).not.toBe(500)
    })
})

test.describe('Workouts Update API', () => {
    test('PATCH /api/workouts/update rejects empty body (not 500)', async ({ request }) => {
        const res = await request.patch('/api/workouts/update', { data: {} })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect([400, 422]).toContain(res.status())
    })
})

test.describe('Storage APIs', () => {
    test('GET /api/storage/signed-upload returns non-500', async ({ request }) => {
        const res = await request.get('/api/storage/signed-upload')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/storage/sign-cloudinary returns non-500', async ({ request }) => {
        const res = await request.get('/api/storage/sign-cloudinary')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('No JS errors on extended pages', () => {
    test('/dashboard/vip/analytics has no fatal JS errors', async ({ page }) => {
        test.setTimeout(60_000)
        const jsErrors: string[] = []
        page.on('pageerror', err => jsErrors.push(err.message))

        await page.goto('/dashboard/vip/analytics', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        })
        await page.waitForTimeout(3000)

        const fatal = jsErrors.filter(e =>
            !e.includes('ResizeObserver') &&
            !e.includes('non-Error promise') &&
            !e.includes('AbortError')
        )
        expect(fatal).toHaveLength(0)
    })
})
