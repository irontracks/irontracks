import { test, expect } from '@playwright/test'

/**
 * Admin route protection tests — verify admin API routes reject unauthenticated
 * requests with 401/403 and NEVER return 500.
 */

test.describe('Admin Routes Require Auth', () => {
    const adminRoutes = [
        { method: 'GET', path: '/api/admin/students' },
        { method: 'GET', path: '/api/admin/teachers' },
        { method: 'GET', path: '/api/admin/workouts/templates-list' },
        { method: 'GET', path: '/api/admin/error-reports' },
        { method: 'GET', path: '/api/admin/execution-videos' },
        { method: 'POST', path: '/api/admin/students/delete' },
        { method: 'POST', path: '/api/admin/delete-auth-user' },
    ]

    for (const route of adminRoutes) {
        test(`${route.method} ${route.path} rejects unauthenticated`, async ({ request }) => {
            const res = route.method === 'POST'
                ? await request.post(route.path, { data: {} })
                : await request.get(route.path)

            // Must not crash
            expect(res.status()).not.toBe(500)
            // Must reject
            expect([401, 403, 400, 422]).toContain(res.status())
        })
    }
})

test.describe('Zod Validation — delete-auth-user', () => {
    test('rejects empty body', async ({ request }) => {
        const res = await request.post('/api/admin/delete-auth-user', {
            data: {},
        })
        expect(res.status()).not.toBe(500)
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(body.error).toBeTruthy()
    })

    test('rejects missing token', async ({ request }) => {
        const res = await request.post('/api/admin/delete-auth-user', {
            data: { user_id: 'fake-user-id' },
        })
        expect(res.status()).not.toBe(500)
        const body = await res.json()
        expect(body.ok).toBe(false)
    })

    test('rejects invalid token', async ({ request }) => {
        const res = await request.post('/api/admin/delete-auth-user', {
            data: { user_id: 'fake-user-id', token: 'invalid-token' },
        })
        // Should return 401 (invalid token), not 500
        expect(res.status()).not.toBe(500)
        const body = await res.json()
        expect(body.ok).toBe(false)
    })
})
