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
        test(`${path} redirects or loads without 500`, async ({ page, baseURL }) => {
            const res = await page.goto(path, { waitUntil: 'domcontentloaded' })
            // Must NOT be a server error
            expect(res?.status()).not.toBe(500)
            // Either redirected to login/root, or rendered the page.
            //
            // `baseURL` em vez de 'localhost:3000' fixo: com a string cravada, o
            // teste só passava apontado para a máquina local. Contra produção ou
            // preview ele acusava falha do APP quando o errado era o teste —
            // exatamente o que aconteceu na auditoria de 07/08/2026.
            const host = new URL(baseURL ?? 'http://localhost:3000').host
            const url = page.url()
            const isRedirected = url.includes(host) && !url.includes(path.split('/').pop()!)
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
