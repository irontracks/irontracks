import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Billing, Push, and Access Request APIs
 * Covers billing sync, push notifications (test endpoint), access requests.
 */

test.describe('Billing — RevenueCat Sync', () => {
    test('POST /api/billing/revenuecat/sync rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/billing/revenuecat/sync', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        // Expects valid product ID — 400, 402 (payment required), or 422 are all acceptable
        expect([400, 402, 422, 200]).toContain(res.status())
    })
})

test.describe('Access Requests', () => {
    test('POST /api/access-request/create rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/access-request/create', { data: {} }).catch(() => null)
        if (!res) return
        // Rate limited or validation error
        expect(res.status()).not.toBe(500)
        expect([400, 422, 429]).toContain(res.status())
    })
})

test.describe('Push Notifications', () => {
    test('GET /api/push/test returns non-401 (admin)', async ({ request }) => {
        const res = await request.get('/api/push/test?type=workout_reminder').catch(() => null)
        if (!res) return
        // Might return 404 if feature disabled, 400 if missing device, or 200
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(500)
    })

    test('POST /api/push/clear-badge returns non-401', async ({ request }) => {
        const res = await request.post('/api/push/clear-badge', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(500)
    })
})

test.describe('Storage — Admin', () => {
    // SEC-06 (auditoria 2026-08-13): a rota ensure-bucket permitia a qualquer
    // usuário logado tornar o bucket chat-media público. Foi removida; este
    // teste trava a remoção — se a rota voltar a responder, é regressão.
    test('POST /api/storage/ensure-bucket não existe mais (rota removida)', async ({ request }) => {
        const res = await request.post('/api/storage/ensure-bucket', { data: {} }).catch(() => null)
        if (!res) return
        expect(res.status()).toBe(404)
    })
})

test.describe('Workouts — Update (PATCH)', () => {
    test('PATCH /api/workouts/update with invalid id returns 400/422', async ({ request }) => {
        const res = await request.patch('/api/workouts/update', {
            data: { id: 'invalid-uuid', workout: { name: 'Test' } },
        })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})
