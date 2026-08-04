import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Nutrition
 * Tests the /dashboard/nutrition page and nutrition-related APIs.
 * User is admin + vip_elite so all nutrition features should be available.
 */

test.describe('Nutrition Page — UI', () => {
    test('nutrition page loads without 500', async ({ page }) => {
        const res = await page.goto('/dashboard/nutrition', { waitUntil: 'domcontentloaded' })
        expect(res?.status()).not.toBe(500)
    })

    test('nutrition page renders content (not blank)', async ({ page }) => {
        await page.goto('/dashboard/nutrition')
        await page.waitForTimeout(3000)

        // Should not redirect to login
        expect(page.url()).not.toContain('/login')
        expect(page.url()).not.toContain('irontracks.com.br/login')

        const body = await page.textContent('body')
        expect(body?.length).toBeGreaterThan(50)
    })

    test('nutrition page has no fatal JS errors', async ({ page }) => {
        const jsErrors: string[] = []
        page.on('pageerror', err => jsErrors.push(err.message))

        await page.goto('/dashboard/nutrition')
        await page.waitForTimeout(4000)

        const fatal = jsErrors.filter(e =>
            !e.includes('ResizeObserver') &&
            !e.includes('non-Error promise') &&
            !e.includes('AbortError') &&
            !e.includes('ChunkLoadError')
        )
        expect(fatal).toHaveLength(0)
    })

    test('nutrition page does not show 404 error text', async ({ page }) => {
        await page.goto('/dashboard/nutrition')
        await page.waitForTimeout(3000)

        const body = (await page.textContent('body') ?? '').toLowerCase()
        expect(body).not.toContain('página não encontrada')
        expect(body).not.toContain('404')
    })
})

test.describe('Nutrition API', () => {
    test('GET /api/calories/estimate returns non-500', async ({ request }) => {
        const res = await request.get('/api/calories/estimate')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/ai/nutrition-estimate requires body (not 500)', async ({ request }) => {
        const res = await request.post('/api/ai/nutrition-estimate', {
            data: { description: 'arroz com feijão' },
        })
        // Should not 500 — may 400 if missing required fields, that's fine
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/nutrition/export-pdf returns non-500', async ({ request }) => {
        const res = await request.get('/api/nutrition/export-pdf')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})
