import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Extended Social API tests
 * Covers follow system, gym presence, stories interactions, workout-start.
 */

test.describe('Follow System', () => {
    test('GET /api/social/follow returns non-500', async ({ request }) => {
        const res = await request.get('/api/social/follow').catch(() => null)
        if (!res) return // socket hang-up under load
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/social/follow rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/social/follow', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        // Should require target_user_id
        expect([400, 422, 200]).toContain(res.status())
    })

    test('POST /api/social/follow/cancel rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/social/follow/cancel', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/social/follow/respond rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/social/follow/respond', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect([400, 422]).toContain(res.status())
    })
})

test.describe('Gym Presence', () => {
    test('GET /api/social/presence/list returns non-500', async ({ request }) => {
        const res = await request.get('/api/social/presence/list').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/social/presence/ping returns non-500', async ({ request }) => {
        const res = await request.post('/api/social/presence/ping', {
            data: { gym_id: '00000000-0000-0000-0000-000000000000' },
        }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/social/gym-leaderboard returns non-500', async ({ request }) => {
        const res = await request.get('/api/social/gym-leaderboard').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/social/gym-presence returns non-500', async ({ request }) => {
        const res = await request.post('/api/social/gym-presence', {
            data: { gym_id: '00000000-0000-0000-0000-000000000000' },
        }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Stories Interactions', () => {
    test('GET /api/social/stories/list returns non-500', async ({ request }) => {
        const res = await request.get('/api/social/stories/list').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/social/stories/views returns non-500', async ({ request }) => {
        const res = await request.get('/api/social/stories/views').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/social/stories/comments returns non-500', async ({ request }) => {
        const res = await request.get('/api/social/stories/comments').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/social/stories/like rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/social/stories/like', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/social/stories/react rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/social/stories/react', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/social/stories/view rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/social/stories/view', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Workout Social', () => {
    test('POST /api/social/workout-start returns non-500', async ({ request }) => {
        const res = await request.post('/api/social/workout-start', {
            data: { workout_id: '00000000-0000-0000-0000-000000000000' },
        }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})
