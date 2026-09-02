import { test, expect } from '@playwright/test'

/**
 * Authenticated API tests: Teacher & Student management
 * Admin user also has teacher capabilities.
 */

test.describe('Teacher Self-Service API', () => {
    test('GET /api/teachers/me returns non-500', async ({ request }) => {
        const res = await request.get('/api/teachers/me')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/teachers/my-plan returns non-500', async ({ request }) => {
        const res = await request.get('/api/teachers/my-plan')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/teachers/plans returns non-500', async ({ request }) => {
        const res = await request.get('/api/teachers/plans')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

})

test.describe('Teacher Inbox API', () => {
    test('GET /api/teacher/inbox/feed returns non-500', async ({ request }) => {
        const res = await request.get('/api/teacher/inbox/feed')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Teacher Service Plans API', () => {
    test('GET /api/teacher/service-plans returns non-500', async ({ request }) => {
        const res = await request.get('/api/teacher/service-plans')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Student APIs', () => {
    test('GET /api/students/me/status returns non-500', async ({ request }) => {
        const res = await request.get('/api/students/me/status')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/student/my-subscription returns non-500', async ({ request }) => {
        const res = await request.get('/api/student/my-subscription')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Admin — Students & Teachers', () => {
    test('GET /api/admin/students/list returns 200 (admin)', async ({ request }) => {
        const res = await request.get('/api/admin/students/list')
        expect(res.status()).toBe(200)
    })

    test('GET /api/admin/teachers/list returns 200 (admin)', async ({ request }) => {
        const res = await request.get('/api/admin/teachers/list')
        expect(res.status()).toBe(200)
    })

    test('GET /api/admin/access-requests/list returns non-500 (admin)', async ({ request }) => {
        const res = await request.get('/api/admin/access-requests/list')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('GET /api/admin/user-activity/summary returns non-500 (admin)', async ({ request }) => {
        const res = await request.get('/api/admin/user-activity/summary')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/admin/user-activity/users returns non-500 (admin)', async ({ request }) => {
        const res = await request.get('/api/admin/user-activity/users')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})
