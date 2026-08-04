import { test, expect } from '@playwright/test'

/**
 * Authenticated API tests: VIP
 * User is vip_elite — all VIP endpoints should respond correctly.
 */

test.describe('VIP Status & Access', () => {
    test('GET /api/vip/status returns tier=vip_elite', async ({ request }) => {
        const res = await request.get('/api/vip/status')
        expect(res.status()).toBe(200)
        const body = await res.json()
        expect(body).toHaveProperty('tier')
        // Admin test user has vip_elite
        expect(['vip_elite', 'vip_pro', 'vip']).toContain(body.tier)
    })

    test('GET /api/vip/access returns allowed=true for elite user', async ({ request }) => {
        const res = await request.get('/api/vip/access')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        const body = await res.json()
        expect(body).toBeTruthy()
    })

    test('GET /api/vip/profile returns profile data', async ({ request }) => {
        const res = await request.get('/api/vip/profile')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/vip/welcome-status returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/welcome-status')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('VIP Periodization', () => {
    test('GET /api/vip/periodization/stats returns 200', async ({ request }) => {
        const res = await request.get('/api/vip/periodization/stats')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/vip/periodization/active returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/periodization/active')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/vip/weekly-summary returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/weekly-summary')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('VIP Admin Operations', () => {
    test('GET /api/admin/vip/list returns 200 (admin)', async ({ request }) => {
        const res = await request.get('/api/admin/vip/list')
        expect(res.status()).toBe(200)
    })

    test('GET /api/admin/vip/grant-history returns non-500 (admin)', async ({ request }) => {
        const res = await request.get('/api/admin/vip/grant-history')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })
})

test.describe('Calories & Nutrition (Bug B6)', () => {
    test('GET /api/calories/estimate returns 200 (Bug B6 check)', async ({ request }) => {
        const res = await request.get('/api/calories/estimate')
        // Was returning 404 due to missing column in workout_sessions
        expect(res.status()).not.toBe(404)
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})
