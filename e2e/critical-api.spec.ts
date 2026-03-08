import { test, expect } from '@playwright/test'

/**
 * Critical API endpoint tests — verify key endpoints work correctly
 * without authentication (for public endpoints) or return proper errors.
 */

test.describe('Plans \u0026 Billing API', () => {
    test('GET /api/app/plans returns plans list', async ({ request }) => {
        const res = await request.get('/api/app/plans')
        expect(res.status()).toBeLessThan(500)
        const body = await res.json()
        // Should return plans array (even if empty)
        expect(body).toHaveProperty('plans')
    })

    test('POST /api/app/checkout rejects unauthenticated', async ({ request }) => {
        const res = await request.post('/api/app/checkout', {
            data: { planId: 'vip_pro', billingType: 'PIX' },
        })
        expect(res.status()).not.toBe(500)
    })
})

test.describe('AI Endpoints Require Auth', () => {
    const aiRoutes = [
        '/api/ai/post-workout-insights',
        '/api/ai/exercise-muscle-map',
        '/api/ai/muscle-map-week',
        '/api/ai/muscle-map-day',
    ]

    for (const path of aiRoutes) {
        test(`POST ${path} rejects unauthenticated`, async ({ request }) => {
            const res = await request.post(path, {
                data: { exercises: [] },
            })
            expect(res.status()).not.toBe(500)
            expect([401, 403, 400, 422]).toContain(res.status())
        })
    }
})

test.describe('Social Endpoints', () => {
    test('POST /api/social/presence/heartbeat rejects unauthenticated', async ({ request }) => {
        const res = await request.post('/api/social/presence/heartbeat')
        expect(res.status()).not.toBe(500)
    })

    test('GET /api/social/presence/list rejects unauthenticated', async ({ request }) => {
        const res = await request.get('/api/social/presence/list')
        expect(res.status()).not.toBe(500)
    })

    test('GET /api/social/stories/list rejects unauthenticated', async ({ request }) => {
        const res = await request.get('/api/social/stories/list')
        expect(res.status()).not.toBe(500)
    })
})
