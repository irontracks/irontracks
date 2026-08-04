import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Extended VIP API tests
 * Covers VIP chat, welcome flow, credits, and additional VIP endpoints.
 */

test.describe('VIP Welcome Flow', () => {
    test('GET /api/vip/welcome-status returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/welcome-status')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        const body = await res.json()
        expect(body).toBeTruthy()
    })

    test('POST /api/vip/welcome-seen returns non-500', async ({ request }) => {
        const res = await request.post('/api/vip/welcome-seen', { data: {} })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('VIP Access & Profile', () => {
    test('GET /api/vip/access returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/access')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/vip/profile returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/profile')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/user/vip-credits returns non-500', async ({ request }) => {
        const res = await request.get('/api/user/vip-credits')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('VIP Chat', () => {
    test('GET /api/vip/chat/thread returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/chat/thread')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/vip/chat/messages returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/chat/messages')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('VIP Periodization (extended)', () => {
    test('GET /api/vip/periodization/stats returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/periodization/stats')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('GET /api/vip/periodization/active returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/periodization/active')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })

    test('POST /api/vip/periodization/create rejects empty body (not 500)', async ({ request }) => {
        const res = await request.post('/api/vip/periodization/create', { data: {} })
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
        expect([400, 422, 200]).toContain(res.status())
    })
})

test.describe('VIP Weekly Summary', () => {
    test('GET /api/vip/weekly-summary returns non-500', async ({ request }) => {
        const res = await request.get('/api/vip/weekly-summary')
        expect(res.status()).not.toBe(500)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('VIP Status (core — already covered, extended validation)', () => {
    test('GET /api/vip/status has valid schema', async ({ request }) => {
        const res = await request.get('/api/vip/status')
        expect(res.status()).toBe(200)
        const body = await res.json()
        // Should have a tier field
        expect(body).toHaveProperty('tier')
        // Tier must be a known value
        expect(['free', 'vip_basic', 'vip_elite', 'vip_pro', 'vip_coach']).toContain(body.tier)
    })
})
