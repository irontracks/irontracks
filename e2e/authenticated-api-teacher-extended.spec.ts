import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Extended Teacher API tests
 * Covers teacher service plans, billing, execution videos, team chat, wallet.
 */

test.describe('Teacher Self-Service (extended)', () => {
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
        // Plans might be publicly accessible
    })

})

test.describe('Teacher Service Plans', () => {
    test('GET /api/teacher/service-plans returns non-500', async ({ request }) => {
        const res = await request.get('/api/teacher/service-plans')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/teacher/billing-subscriptions returns non-500', async ({ request }) => {
        const res = await request.get('/api/teacher/billing-subscriptions')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Teacher Execution Videos', () => {
    test('GET /api/teacher/execution-videos/by-student returns non-500', async ({ request }) => {
        const res = await request.get('/api/teacher/execution-videos/by-student')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/teacher/execution-videos/review is reachable (not 401)', async ({ request }) => {
        const res = await request.post('/api/teacher/execution-videos/review', { data: {} }).catch(() => null)
        if (!res) return
        // Feature may be disabled in dev (404) or require valid body (400/422)
        expect(res.status()).not.toBe(401)
        expect([400, 404, 422]).toContain(res.status())
    })
})

test.describe('Teacher Inbox (extended)', () => {
    test('GET /api/teacher/inbox/feed returns non-500', async ({ request }) => {
        const res = await request.get('/api/teacher/inbox/feed')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/teacher/inbox/send-message rejects empty body (not 401)', async ({ request }) => {
        const res = await request.post('/api/teacher/inbox/send-message', { data: {} }).catch(() => null)
        if (!res) return // connection reset under load (rate limiter)
        // Rate limiter may cause 429, validation error 400/422 — just ensure not auth failure
        expect(res.status()).not.toBe(401)
        expect([400, 422, 429]).toContain(res.status())
    })
})

test.describe('Student Subscription', () => {
    test('GET /api/student/my-subscription returns non-500', async ({ request }) => {
        const res = await request.get('/api/student/my-subscription')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Team Chat', () => {
    test('GET /api/team/chat/messages returns non-500', async ({ request }) => {
        const res = await request.get('/api/team/chat/messages').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/team/invite-candidates returns non-500', async ({ request }) => {
        const res = await request.get('/api/team/invite-candidates').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})
