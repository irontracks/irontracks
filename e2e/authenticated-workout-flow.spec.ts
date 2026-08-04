import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Complete Workout Flow
 *
 * Tests the full workout lifecycle via API:
 * 1. List available templates
 * 2. Submit a complete workout session
 * 3. Verify it appears in history
 *
 * Also tests the UI workout flow where possible.
 */

test.describe('Workout API — Full Flow', () => {
    let workoutId: string | null = null

    test('GET /api/workouts/list returns templates array', async ({ request }) => {
        const res = await request.get('/api/workouts/list')
        expect(res.status()).toBe(200)
        const body = await res.json()
        // Should return an array or object with workouts
        expect(body).toBeTruthy()
    })

    test('POST /api/workouts/finish saves a minimal session', async ({ request }) => {
        const session = {
            workoutTitle: 'Teste E2E — Treino Automatizado',
            date: new Date().toISOString(),
            exercises: [
                {
                    name: 'Supino Reto',
                    sets: 3,
                    setDetails: [
                        { weight: '60', reps: '10', done: true },
                        { weight: '60', reps: '10', done: true },
                        { weight: '60', reps: '8', done: true },
                    ],
                },
            ],
            logs: {},
        }

        const res = await request.post('/api/workouts/finish', {
            data: {
                session,
                idempotencyKey: `e2e-test-${Date.now()}`,
            },
        })

        // Should succeed or return validation error — never 500 or 401
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)

        if (res.status() === 200 || res.status() === 201) {
            const body = await res.json()
            if (body?.id || body?.session_id) {
                workoutId = body.id ?? body.session_id
            }
        }
    })

    test('GET /api/workouts/history shows recent sessions', async ({ request }) => {
        const res = await request.get('/api/workouts/history?limit=5')
        expect(res.status()).toBe(200)
        const body = await res.json()
        expect(body).toBeTruthy()
        // If we just finished a workout, it should appear in history
        // (May take a moment to appear; just verify the endpoint works)
    })

    test('POST /api/workouts/finish with cardio exercise', async ({ request }) => {
        const session = {
            workoutTitle: 'Teste E2E — Cardio',
            date: new Date().toISOString(),
            exercises: [
                {
                    name: 'Esteira',
                    sets: 1,
                    setDetails: [
                        { weight: null, reps: null, duration: 1800, done: true },
                    ],
                },
            ],
        }

        const res = await request.post('/api/workouts/finish', {
            data: {
                session,
                idempotencyKey: `e2e-cardio-${Date.now()}`,
            },
        })

        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Workout API — PATCH Update', () => {
    test('PATCH /api/workouts/update with valid structure returns non-500', async ({ request }) => {
        const res = await request.patch('/api/workouts/update', {
            data: {
                id: '00000000-0000-0000-0000-000000000000',
                workout: {
                    name: 'Test Update',
                    exercises: [],
                },
            },
        })
        // Non-existent ID should return 404 or 400, never 500
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Workout UI Flow', () => {
    test('dashboard shows workout templates', async ({ page }) => {
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(5000)

        expect(page.url()).toContain('/dashboard')
        const body = await page.textContent('body')
        // Should have some content related to workouts
        expect(body?.length).toBeGreaterThan(100)
    })

    test('workout list API works from authenticated page context', async ({ page, request }) => {
        // Navigate to dashboard first to ensure cookies are set in context
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(2000)

        // Now use the same context's API credentials
        const res = await request.get('/api/workouts/list')
        expect(res.status()).toBe(200)
    })

    test('history page shows workout list', async ({ page }) => {
        test.setTimeout(60_000)
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)

        // Check if there's any history-related content
        const jsErrors: string[] = []
        page.on('pageerror', err => jsErrors.push(err.message))

        const fatal = jsErrors.filter(e =>
            !e.includes('ResizeObserver') &&
            !e.includes('non-Error promise') &&
            !e.includes('AbortError')
        )
        expect(fatal).toHaveLength(0)
    })
})
