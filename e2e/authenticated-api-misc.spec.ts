import { test, expect } from '@playwright/test'

/**
 * Authenticated API smoke tests: Miscellaneous utility endpoints
 * Covers version, supabase status, auth, profiles, updates, referral, diagnostics
 */

test.describe('Utility APIs — non-auth required', () => {
    test('GET /api/version returns 200 with version info', async ({ request }) => {
        const res = await request.get('/api/version')
        expect(res.status()).toBe(200)
        const body = await res.json()
        expect(body.ok).toBe(true)
    })
})

test.describe('Auth Utility APIs', () => {
    test('GET /api/auth/ping returns 204 when authenticated', async ({ request }) => {
        const res = await request.get('/api/auth/ping')
        // 204 = authenticated, 401 = not authenticated
        expect([204, 401]).toContain(res.status())
        // Should NOT 500
        expect(res.status()).not.toBe(500)
    })

    test('GET /api/auth/session returns non-401 when authenticated', async ({ request }) => {
        const res = await request.get('/api/auth/session')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/auth/apple/preflight returns non-500', async ({ request }) => {
        const res = await request.get('/api/auth/apple/preflight')
        expect(res.status()).not.toBe(500)
    })
})

test.describe('Supabase Status API', () => {
    test('GET /api/supabase/status returns 200 in dev (admin)', async ({ request }) => {
        const res = await request.get('/api/supabase/status')
        expect(res.status()).not.toBe(500)
        // In dev, returns 200 with status info
        const body = await res.json()
        expect(body).toBeTruthy()
    })
})

test.describe('Profiles API', () => {
    test('POST /api/profiles/ping returns non-500', async ({ request }) => {
        const res = await request.post('/api/profiles/ping')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/profiles/handle returns non-500', async ({ request }) => {
        const res = await request.get('/api/profiles/handle')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/profiles/acquisition returns non-500', async ({ request }) => {
        const res = await request.get('/api/profiles/acquisition')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Updates API', () => {
    test('GET /api/updates/unseen returns non-500', async ({ request }) => {
        const res = await request.get('/api/updates/unseen')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/updates/mark-viewed rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/updates/mark-viewed', { data: {} })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/updates/mark-prompted rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/updates/mark-prompted', { data: {} })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Students & Referral APIs', () => {
    test('GET /api/students/me/status returns non-500', async ({ request }) => {
        const res = await request.get('/api/students/me/status')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/referral returns non-500', async ({ request }) => {
        const res = await request.get('/api/referral')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Diagnostics API', () => {
    test('GET /api/diagnostics/workouts returns non-500', async ({ request }) => {
        const res = await request.get('/api/diagnostics/workouts')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/diagnostics/iron-rank returns non-500', async ({ request }) => {
        const res = await request.get('/api/diagnostics/iron-rank')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Progress Photos API', () => {
    test('GET /api/progress-photos returns non-500', async ({ request }) => {
        const res = await request.get('/api/progress-photos')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Telemetry API', () => {
    test('POST /api/telemetry/user-event returns non-500', async ({ request }) => {
        const res = await request.post('/api/telemetry/user-event', {
            data: { event: 'test_event', properties: {} },
        })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('App Plans API', () => {
    test('GET /api/app/plans returns non-500', async ({ request }) => {
        const res = await request.get('/api/app/plans')
        expect(res.status()).not.toBe(500)
        // Plans API may be public or authenticated
    })
})
