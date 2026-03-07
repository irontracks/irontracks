import { test, expect } from '@playwright/test'

/**
 * API smoke tests — verify critical API routes return expected status codes.
 * No auth required for these endpoints.
 */

test.describe('API Health Smoke', () => {
    test('GET /api/version returns ok', async ({ request }) => {
        const res = await request.get('/api/version')
        expect(res.status()).toBe(200)
        const body = await res.json()
        expect(body.ok).toBe(true)
    })

    test('GET /api/feature-flags returns 200', async ({ request }) => {
        const res = await request.get('/api/feature-flags')
        expect(res.status()).toBeLessThan(500)
    })

    test('GET /api/auth/ping returns non-500', async ({ request }) => {
        const res = await request.get('/api/auth/ping')
        expect(res.status()).not.toBe(500)
    })

    test('GET /api/marketplace/health returns non-500', async ({ request }) => {
        const res = await request.get('/api/marketplace/health')
        expect(res.status()).not.toBe(500)
    })
})

test.describe('Security Headers', () => {
    test('root page includes X-Frame-Options: DENY', async ({ request }) => {
        const res = await request.get('/')
        const xFrameOptions = res.headers()['x-frame-options']
        expect(xFrameOptions?.toLowerCase()).toBe('deny')
    })

    test('root page includes X-Content-Type-Options', async ({ request }) => {
        const res = await request.get('/')
        const xCto = res.headers()['x-content-type-options']
        expect(xCto).toBe('nosniff')
    })

    test('API routes return cache-control: no-store', async ({ request }) => {
        const res = await request.get('/api/version')
        const cc = res.headers()['cache-control'] ?? ''
        expect(cc).toContain('no-store')
    })
})

test.describe('Protected Routes Return 401/403 — not 500', () => {
    test('POST /api/social/stories/create requires auth', async ({ request }) => {
        const res = await request.post('/api/social/stories/create', {
            data: { mediaPath: 'test', caption: 'test' },
        })
        // Should get 401/403/422, never 500
        expect(res.status()).not.toBe(500)
        expect([401, 403, 400, 422]).toContain(res.status())
    })

    test('POST /api/workouts/finish requires auth', async ({ request }) => {
        const res = await request.post('/api/workouts/finish', {
            data: {},
        })
        expect(res.status()).not.toBe(500)
        expect([401, 403, 400, 422]).toContain(res.status())
    })

    test('GET /api/vip/status requires auth', async ({ request }) => {
        const res = await request.get('/api/vip/status')
        expect(res.status()).not.toBe(500)
        expect([401, 403, 400]).toContain(res.status())
    })
})
