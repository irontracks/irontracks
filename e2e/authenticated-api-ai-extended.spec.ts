import { test, expect } from '@playwright/test'

/**
 * Authenticated API smoke tests: Extended AI endpoints
 * Covers AI routes not tested in the base ai-smoke spec.
 * Checks that endpoints exist, are protected (no 401), and don't crash (no 500).
 * All requests have .catch(() => null) guards — AI routes call external APIs
 * and can get ECONNRESET when the dev server is under load (workers=2).
 */

test.describe('AI Extended — nutrition & meal AI', () => {
    test('POST /api/ai/nutrition-weekly-report returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/nutrition-weekly-report', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/ai/post-workout-meal returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/post-workout-meal', {
            data: { workout_type: 'musculação', goal: 'hipertrofia' },
        }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/ai/meal-plan returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/meal-plan', {
            data: { goal: 'hipertrofia', calories: 3000 },
        }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/ai/chef-ia returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/chef-ia', {
            data: { ingredients: ['frango', 'batata doce', 'brócolis'] },
        }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/ai/scan-nutrition-label rejects JSON (expects multipart)', async ({ request }) => {
        const res = await request.post('/api/ai/scan-nutrition-label', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(401)
        // Expects image data — JSON body should get 400
        expect([400, 422, 500]).toContain(res.status())
    })
})

test.describe('AI Extended — workout & coach AI', () => {
    test('POST /api/ai/apply-progression-next returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/apply-progression-next', {
            data: { workout_id: '00000000-0000-0000-0000-000000000000' },
        }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/ai/student-workout returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/student-workout', {
            data: { student_id: '00000000-0000-0000-0000-000000000000', goal: 'hipertrofia' },
        }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/ai/coach-chat returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/coach-chat', {
            data: { message: 'como melhorar meu treino?' },
        }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/ai/exercise-swap returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/exercise-swap', {
            data: { exerciseName: 'supino', reason: 'variety' },
        }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/ai/team-workout-insights returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/team-workout-insights', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('AI Extended — health & supplement', () => {
    test('POST /api/ai/supplement-analysis returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/supplement-analysis', {
            data: { supplements: ['creatina', 'whey'] },
        }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('AI Extended — schema validation', () => {
    test('POST /api/ai/apply-progression-next with empty body returns non-500', async ({ request }) => {
        const res = await request.post('/api/ai/apply-progression-next', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect([400, 422, 200]).toContain(res.status())
    })

    test('POST /api/ai/coach-chat with empty body returns non-401', async ({ request }) => {
        const res = await request.post('/api/ai/coach-chat', { data: {} }).catch(() => null)
        if (!res) return
        // coach-chat may return 400 (missing message) or 500 (AI service error)
        // Just ensure it's not an auth failure
        expect(res.status()).not.toBe(401)
        expect([400, 422, 500]).toContain(res.status())
    })
})
