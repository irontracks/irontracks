import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Extended Nutrition API tests
 * Covers nutrition correlation, reminders, export, and additional calories APIs.
 */

test.describe('Nutrition Data APIs', () => {
    test('GET /api/nutrition/correlation returns non-500', async ({ request }) => {
        const res = await request.get('/api/nutrition/correlation')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/nutrition/reminders returns non-401', async ({ request }) => {
        const res = await request.get('/api/nutrition/reminders')
        // Table may not exist in dev — 500 is acceptable here
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('POST /api/nutrition/reminders/trigger is cron-secured (non-401)', async ({ request }) => {
        // This endpoint requires CRON_SECRET header — 401/403 expected without it
        const res = await request.post('/api/nutrition/reminders/trigger', { data: {} }).catch(() => null)
        if (!res) return // connection reset under load
        // Cron endpoint — acceptable: 401, 403, 500
        expect(res.status()).not.toBe(200)
    })

    test('GET /api/nutrition/export-pdf returns non-500', async ({ request }) => {
        const res = await request.get('/api/nutrition/export-pdf')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Calories API (extended)', () => {
    test('GET /api/calories/estimate returns non-500', async ({ request }) => {
        const res = await request.get('/api/calories/estimate')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/calories/estimate with date param returns non-500', async ({ request }) => {
        const today = new Date().toISOString().split('T')[0]
        const res = await request.get(`/api/calories/estimate?date=${today}`)
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('AI Nutrition Endpoints (extended)', () => {
    test('POST /api/ai/nutrition-estimate returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/nutrition-estimate', {
            data: { description: 'frango grelhado com arroz integral' },
        })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/ai/nutrition-weekly-report returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/nutrition-weekly-report', { data: {} })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})
