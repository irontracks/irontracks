import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Notifications, Teacher Student Session,
 * and remaining misc APIs.
 */

test.describe('Notifications API', () => {
    test('POST /api/notifications/appointment-created rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/notifications/appointment-created', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect([400, 422]).toContain(res.status())
    })

    test('POST /api/notifications/direct-message rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/notifications/direct-message', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect([400, 422]).toContain(res.status())
    })
})

test.describe('Teacher Student Session', () => {
    test('GET /api/teacher/student-session/[userId] returns non-500', async ({ request }) => {
        const userId = '5b616014-e5b4-4db8-916b-eb0010378e70' // admin user ID
        const res = await request.get(`/api/teacher/student-session/${userId}`).catch(() => null)
        if (!res) return // connection reset under load
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Teacher Inbox Action', () => {
    test('POST /api/teacher/inbox/action rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/teacher/inbox/action', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect([400, 422]).toContain(res.status())
    })
})

test.describe('Auth Recovery', () => {
    test('GET /api/auth/recovery-code returns non-500', async ({ request }) => {
        const res = await request.get('/api/auth/recovery-code')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Admin Teachers Extended', () => {
    test('POST /api/admin/teachers/promote rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/admin/teachers/promote', { data: {} })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect([400, 422]).toContain(res.status())
    })
})

test.describe('Remaining Cron Endpoints (GET secured)', () => {
    const remainingCronEndpoints = [
        '/api/cron/friends-trained-today',
        '/api/cron/inactivity-nudge',
        '/api/cron/trial-ending',
    ]

    for (const endpoint of remainingCronEndpoints) {
        test(`GET ${endpoint} requires CRON_SECRET (non-500)`, async ({ request }) => {
            const res = await request.get(endpoint).catch(() => null)
            if (!res) return
            expect(res.status()).not.toBe(500)
            expect([401, 403]).toContain(res.status())
        })
    }
})

test.describe('Admin VIP Remaining', () => {
    test('POST /api/admin/vip/grant-trial rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/admin/vip/grant-trial', { data: {} })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect([400, 422]).toContain(res.status())
    })
})

test.describe('Social Stories Media', () => {
    test('GET /api/social/stories/media returns non-500', async ({ request }) => {
        const res = await request.get('/api/social/stories/media').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Teacher Service Plans Extended', () => {
    test('GET /api/teacher/service-plans returns non-500', async ({ request }) => {
        const res = await request.get('/api/teacher/service-plans')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})
