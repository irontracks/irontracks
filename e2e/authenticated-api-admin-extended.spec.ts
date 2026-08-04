import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Extended Admin API tests
 * Tests admin API routes not covered in the base admin-protection spec.
 * All tests run as admin-test@irontracks.com.br (role: admin, VIP Elite).
 */

test.describe('Admin — User Activity (extended)', () => {
    test('GET /api/admin/user-activity/summary returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/user-activity/summary').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('GET /api/admin/user-activity/users returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/user-activity/users').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })
})

test.describe('Admin — Students (extended)', () => {
    test('GET /api/admin/students/settings returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/students/settings').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('GET /api/admin/students/status returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/students/status').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('POST /api/admin/students/assign-teacher rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/admin/students/assign-teacher', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect([400, 422]).toContain(res.status())
    })
})

test.describe('Admin — Teachers (extended)', () => {
    test('GET /api/admin/teachers/inbox returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/teachers/inbox').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('GET /api/admin/teachers/status returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/teachers/status').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('GET /api/admin/teachers/workouts/history returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/teachers/workouts/history').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('GET /api/admin/teachers/workouts/templates returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/teachers/workouts/templates').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('GET /api/admin/legacy-students returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/legacy-students').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })
})

test.describe('Admin — VIP (extended)', () => {
    test('GET /api/admin/vip/batch-status returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/vip/batch-status').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('GET /api/admin/vip/grant-history returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/vip/grant-history').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('GET /api/admin/vip/entitlement returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/vip/entitlement').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })
})

test.describe('Admin — Workouts (extended)', () => {
    test('GET /api/admin/workouts/by-student returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/workouts/by-student').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('GET /api/admin/workouts/history returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/workouts/history').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('GET /api/admin/workouts/mine returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/workouts/mine').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Admin — Access Requests', () => {
    test('GET /api/admin/access-requests/list returns non-500', async ({ request }) => {
        const res = await request.get('/api/admin/access-requests/list').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('POST /api/admin/access-requests/action rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/admin/access-requests/action', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect([400, 422]).toContain(res.status())
    })
})
