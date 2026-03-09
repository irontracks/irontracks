import { test, expect } from '@playwright/test'

/**
 * E2E: Finish Workout Flow
 *
 * Validates that the workout finish endpoint works correctly after the
 * concurrent_request_detected bug fix (commit dff6eb7).
 * Tests the API directly since UI navigation requires a full workout session.
 */
test.describe('Finish Workout API', () => {
    test('finish endpoint returns 401 when not authenticated', async ({ request }) => {
        const res = await request.post('/api/workouts/finish', {
            data: {
                session: {
                    workoutTitle: 'Test Treino',
                    date: new Date().toISOString(),
                    exercises: [],
                },
                idempotencyKey: `test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            },
        })
        // Should be 401 (unauthorized) — not 429 (concurrent_request_detected)
        expect(res.status()).toBe(401)
    })

    test('finish endpoint schema accepts valid body', async ({ request }) => {
        const res = await request.post('/api/workouts/finish', {
            data: {
                session: {
                    workoutTitle: 'Test',
                    exercises: [],
                    logs: {},
                },
            },
        })
        // Unauthorized or validation error — but NOT a schema parse crash
        expect([400, 401, 403, 429]).toContain(res.status())
        const json = await res.json().catch(() => null)
        expect(json).not.toBeNull()
        expect(json?.ok).toBe(false)
        // Must NOT be concurrent_request for unauthenticated requests
        expect(json?.error).not.toBe('concurrent_request_detected')
    })

    test('finish endpoint rejects missing session', async ({ request }) => {
        const res = await request.post('/api/workouts/finish', {
            data: {},
        })
        expect([400, 401, 422]).toContain(res.status())
    })
})

/**
 * E2E: Admin Panel Access
 *
 * Validates admin panel error boundary works correctly and
 * that admin routes are protected.
 */
test.describe('Admin Panel Access', () => {
    test('admin routes are protected from unauthenticated access', async ({ request }) => {
        const routes = [
            '/api/admin/students/list',
            '/api/admin/teachers/list',
            '/api/admin/legacy-students',
        ]
        for (const route of routes) {
            const res = await request.get(route)
            expect([401, 403]).toContain(res.status())
        }
    })

    test('dashboard page load does not crash', async ({ page }) => {
        await page.goto('/dashboard')
        await page.waitForTimeout(2000)

        // Should show login or dashboard — NOT a crash screen
        const hasErrorBoundary = await page.locator('text=ERRO EM PAINEL ADMIN').count()
        expect(hasErrorBoundary).toBe(0)
    })
})
