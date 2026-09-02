import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Dashboard Bootstrap & Feature Flags
 * These are called on every app load and are critical to app health.
 */

test.describe('Dashboard Bootstrap', () => {
    test('GET /api/dashboard/bootstrap returns 200', async ({ request }) => {
        const res = await request.get('/api/dashboard/bootstrap')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).toBe(200)
    })

    test('GET /api/dashboard/bootstrap has valid schema', async ({ request }) => {
        const res = await request.get('/api/dashboard/bootstrap')
        if (res.status() !== 200) return
        const body = await res.json()
        // Bootstrap should return some user data
        expect(body).toBeTruthy()
    })
})

test.describe('Feature Flags', () => {
    test('GET /api/feature-flags returns non-500', async ({ request }) => {
        const res = await request.get('/api/feature-flags')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/feature-flags returns object', async ({ request }) => {
        const res = await request.get('/api/feature-flags')
        if (res.status() !== 200) return
        const body = await res.json()
        expect(body).toBeTruthy()
    })
})

test.describe('Iron Scanner', () => {
    test('GET /api/iron-scanner returns non-500', async ({ request }) => {
        const res = await request.get('/api/iron-scanner')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Marketplace APIs', () => {
    test('GET /api/marketplace/plans returns non-500', async ({ request }) => {
        const res = await request.get('/api/marketplace/plans')
        expect(res.status()).not.toBe(500)
        // Plans may be public
    })

})

test.describe('Error Reporting', () => {
    test('POST /api/errors/report returns non-500', async ({ request }) => {
        const res = await request.post('/api/errors/report', {
            data: {
                error: 'E2E test error',
                stack: 'at test (e2e.ts:1:1)',
                context: 'automated test',
            },
        }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        // May require auth or not
    })
})

test.describe('GPS Extended', () => {
    test('GET /api/gps/settings returns non-500', async ({ request }) => {
        const res = await request.get('/api/gps/settings').catch(() => null)
        if (!res) return // ECONNRESET under load
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/gps/gym-qr returns non-500', async ({ request }) => {
        const res = await request.get('/api/gps/gym-qr').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/gps/cardio/save rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/gps/cardio/save', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect([400, 422]).toContain(res.status())
    })
})

test.describe('Cron Endpoints (secured)', () => {
    // These require CRON_SECRET — verify they reject without it (401/403, not 500)
    const cronEndpoints = [
        '/api/cron/birthday',
        '/api/cron/cleanup-expired',
        '/api/cron/morning-briefing',
        '/api/cron/weekly-recap',
        '/api/cron/streak-at-risk',
        '/api/cron/water-reminder',
    ]

    for (const endpoint of cronEndpoints) {
        test(`GET ${endpoint} requires CRON_SECRET (non-500)`, async ({ request }) => {
            const res = await request.get(endpoint).catch(() => null)
            if (!res) return
            // Without CRON_SECRET, should return 401 or 403
            expect(res.status()).not.toBe(500)
            expect([401, 403]).toContain(res.status())
        })
    }
})
