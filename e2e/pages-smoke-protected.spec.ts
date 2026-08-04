import { test, expect } from '@playwright/test'

/**
 * Smoke tests for all pages — authenticated redirects included.
 * These run WITHOUT auth state (chromium project).
 * Goal: confirm no page returns 500, and protected pages redirect correctly.
 */

test.describe('Public Informational Pages', () => {
    const publicPages = [
        '/para-professores',
        '/comercial',
        '/privacy',
        '/marketplace',
        '/offline',
    ]

    for (const path of publicPages) {
        test(`${path} loads without 500`, async ({ page }) => {
            const res = await page.goto(path, { waitUntil: 'domcontentloaded' })
            expect(res?.status()).not.toBe(500)
            // Should render something
            const body = await page.textContent('body')
            expect(body?.length).toBeGreaterThan(10)
        })
    }
})

test.describe('Wait Approval Page', () => {
    test('/wait-approval loads without 500', async ({ page }) => {
        const res = await page.goto('/wait-approval', { waitUntil: 'domcontentloaded' })
        expect(res?.status()).not.toBe(500)
    })
})

test.describe('Auth Pages', () => {
    test('/auth/error loads without 500', async ({ page }) => {
        const res = await page.goto('/auth/error', { waitUntil: 'domcontentloaded' })
        expect(res?.status()).not.toBe(500)
    })

    test('/auth/recovery loads without 500', async ({ page }) => {
        const res = await page.goto('/auth/recovery', { waitUntil: 'domcontentloaded' })
        expect(res?.status()).not.toBe(500)
    })
})

test.describe('Protected App Pages — redirect, not crash', () => {
    const protectedPages = [
        '/dashboard/nutrition',
        '/dashboard/schedule',
        '/dashboard/vip/analytics',
        '/dashboard/vip/chef-ia',
        '/dashboard/vip/offline',
        '/community',
        '/checkin',
    ]

    for (const path of protectedPages) {
        test(`${path} redirects or loads without 500`, async ({ page }) => {
            const res = await page.goto(path, { waitUntil: 'domcontentloaded' })
            // Must NOT be a server error
            expect(res?.status()).not.toBe(500)
            // Either redirected to login/root, or rendered the page
            const url = page.url()
            const isRedirected = url.includes('localhost:3000') && !url.includes(path.split('/').pop()!)
            const isOnPage = url.includes(path)
            expect(isRedirected || isOnPage).toBe(true)
        })
    }
})

test.describe('Referral Link', () => {
    test('/r/[code] loads without 500 for unknown code', async ({ page }) => {
        const res = await page.goto('/r/test-code-123', { waitUntil: 'domcontentloaded' })
        expect(res?.status()).not.toBe(500)
    })
})
