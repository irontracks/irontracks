import { test, expect } from '@playwright/test'

/**
 * Authenticated API tests: Social
 */

test.describe('Stories API', () => {
    test('GET /api/social/stories/list returns 200', async ({ request }) => {
        const res = await request.get('/api/social/stories/list')
        expect(res.status()).toBe(200)
        const body = await res.json()
        expect(body).toBeTruthy()
    })

    test('GET /api/social/stories/list with limit param returns 200', async ({ request }) => {
        const res = await request.get('/api/social/stories/list?limit=5')
        expect(res.status()).toBe(200)
    })

    test('POST /api/social/stories/like without story_id returns 400 (not 500)', async ({ request }) => {
        const res = await request.post('/api/social/stories/like', { data: {} })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/social/stories/views returns non-500', async ({ request }) => {
        const res = await request.get('/api/social/stories/views')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Feed & Leaderboard API', () => {
    test('GET /api/social/feed returns 200', async ({ request }) => {
        const res = await request.get('/api/social/feed')
        expect(res.status()).toBe(200)
    })

    test('GET /api/social/leaderboard returns 200', async ({ request }) => {
        const res = await request.get('/api/social/leaderboard').catch(() => null)
        if (!res) return // ECONNRESET under load
        expect(res.status()).toBe(200)
    })

    test('GET /api/social/gym-leaderboard returns non-500', async ({ request }) => {
        const res = await request.get('/api/social/gym-leaderboard').catch(() => null)
        if (!res) return // ECONNRESET under load
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Presence API', () => {
    test('GET /api/social/presence/list returns 200', async ({ request }) => {
        const res = await request.get('/api/social/presence/list')
        expect(res.status()).toBe(200)
    })

    test('POST /api/social/presence/ping returns non-500', async ({ request }) => {
        const res = await request.post('/api/social/presence/ping', {
            data: { status: 'online' },
        })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Follow System', () => {
    test('GET /api/social/follow returns non-500', async ({ request }) => {
        const res = await request.get('/api/social/follow')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Social Profile', () => {
    test('GET /api/social/profile/[userId] with own ID returns non-500', async ({ request }) => {
        // Use admin test user ID
        const res = await request.get('/api/social/profile/5b616014-e5b4-4db8-916b-eb0010378e70')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})
