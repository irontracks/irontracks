import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Physical Assessments
 * Tests assessment pages and the AI assessment report API.
 */

test.describe('Assessments Page — UI', () => {
    test('/assessments loads without 500 (no studentId)', async ({ page }) => {
        test.setTimeout(60_000)
        const res = await page.goto('/assessments', { waitUntil: 'domcontentloaded', timeout: 30_000 })
        expect(res?.status()).not.toBe(500)
    })

    test('/assessments/[id] with own userId loads without 500', async ({ page }) => {
        test.setTimeout(60_000)
        // Use admin user ID directly
        const res = await page.goto('/assessments/5b616014-e5b4-4db8-916b-eb0010378e70', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        })
        expect(res?.status()).not.toBe(500)
        await page.waitForTimeout(2000)
        const body = await page.textContent('body')
        expect(body?.length).toBeGreaterThan(20)
    })

    test('/assessments/new/[id] renders without crash', async ({ page }) => {
        test.setTimeout(60_000)
        const res = await page.goto('/assessments/new/00000000-0000-0000-0000-000000000000', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        })
        expect(res?.status()).not.toBe(500)
        await page.waitForTimeout(2000)
        const body = await page.textContent('body')
        expect(body?.length).toBeGreaterThan(20)
    })

    test('assessment page has no fatal JS errors', async ({ page }) => {
        test.setTimeout(60_000)
        const jsErrors: string[] = []
        page.on('pageerror', err => jsErrors.push(err.message))

        await page.goto('/assessments', { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await page.waitForTimeout(3000)

        const fatal = jsErrors.filter(e =>
            !e.includes('ResizeObserver') &&
            !e.includes('non-Error promise') &&
            !e.includes('AbortError')
        )
        expect(fatal).toHaveLength(0)
    })
})

test.describe('Assessment API', () => {
    test('GET /api/assessment-scanner returns non-500', async ({ request }) => {
        test.setTimeout(60_000)
        const res = await request.get('/api/assessment-scanner', { timeout: 30_000 })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/ai/assessment-report rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/ai/assessment-report', { data: {} })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})
