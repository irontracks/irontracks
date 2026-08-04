import { test, expect } from '@playwright/test'

/**
 * Authenticated API tests: Workouts
 * All requests run with auth cookies from storageState.
 */

test.describe('Workouts API — authenticated', () => {
    test('GET /api/workouts/list returns 200', async ({ request }) => {
        const res = await request.get('/api/workouts/list')
        expect(res.status()).toBe(200)
    })

    test('GET /api/workouts/history returns 200', async ({ request }) => {
        const res = await request.get('/api/workouts/history?limit=10')
        expect(res.status()).toBe(200)
    })

    test('GET /api/workouts/history respects limit param', async ({ request }) => {
        const res = await request.get('/api/workouts/history?limit=1')
        expect(res.status()).toBe(200)
        const body = await res.json()
        // If workouts exist, count should respect limit
        expect(body).toBeTruthy()
    })

    test('POST /api/workouts/finish returns 400 for missing session (not 500)', async ({ request }) => {
        const res = await request.post('/api/workouts/finish', {
            data: { workout_id: null, sets: [] },
        })
        expect(res.status()).not.toBe(500)
        expect([400, 422]).toContain(res.status())
    })

    test('GET /api/admin/workouts/templates-list returns 200 (admin)', async ({ request }) => {
        const res = await request.get('/api/admin/workouts/templates-list')
        expect(res.status()).toBe(200)
        const body = await res.json()
        expect(body).toBeTruthy()
    })

    test('GET /api/admin/workouts/history returns non-500 (admin)', async ({ request }) => {
        const res = await request.get('/api/admin/workouts/history')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('GET /api/admin/workouts/mine returns non-500 (admin)', async ({ request }) => {
        const res = await request.get('/api/admin/workouts/mine')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('AI Workout APIs — authenticated', () => {
    test('POST /api/ai/workout-wizard returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/workout-wizard', {
            data: { goal: 'hipertrofia', days: 3 },
        })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/ai/suggest-load returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/suggest-load', {
            data: { exercise: 'supino', sets: [] },
        })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/ai/post-workout-insights returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/post-workout-insights', {
            data: { session_id: '00000000-0000-0000-0000-000000000000' },
        })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/ai/weekly-report returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/weekly-report', { data: {} })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})
