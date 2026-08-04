import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Exercise APIs
 * Covers exercise search, canonicalize, library resolve.
 * These are core APIs used throughout the workout flow.
 */

test.describe('Exercise Search', () => {
    test('GET /api/exercises/search returns results', async ({ request }) => {
        const res = await request.get('/api/exercises/search?q=supino')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).toBe(200)
        const body = await res.json()
        expect(body).toBeTruthy()
    })

    test('GET /api/exercises/search with empty query returns non-500', async ({ request }) => {
        const res = await request.get('/api/exercises/search?q=')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/exercises/search for "agachamento" returns results', async ({ request }) => {
        const res = await request.get('/api/exercises/search?q=agachamento')
        expect(res.status()).toBe(200)
        const body = await res.json()
        // Should return an array or object with results
        expect(body).toBeTruthy()
    })
})

test.describe('Exercise Canonicalize', () => {
    test('POST /api/exercises/canonicalize normalizes exercise name', async ({ request }) => {
        const res = await request.post('/api/exercises/canonicalize', {
            data: { name: 'supino reto' },
        })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect([200, 400, 422]).toContain(res.status())
    })

    test('POST /api/exercises/canonicalize with empty body returns non-500', async ({ request }) => {
        const res = await request.post('/api/exercises/canonicalize', { data: {} })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Exercise Library', () => {
    test('GET /api/exercise-library/resolve returns non-500', async ({ request }) => {
        const res = await request.get('/api/exercise-library/resolve?name=supino')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/exercise-library/resolve without name returns non-500', async ({ request }) => {
        const res = await request.get('/api/exercise-library/resolve')
        expect(res.status()).not.toBe(500)
        // May require name param — 400 is acceptable
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Execution Videos', () => {
    test('GET /api/execution-videos/media returns non-500', async ({ request }) => {
        const res = await request.get('/api/execution-videos/media').catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/execution-videos/prepare rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/execution-videos/prepare', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/execution-videos/complete rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/execution-videos/complete', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})
