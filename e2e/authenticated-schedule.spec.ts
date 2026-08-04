import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Schedule / Calendar
 */

test.describe('Schedule Page — UI', () => {
    test('/dashboard/schedule loads without 500', async ({ page }) => {
        const res = await page.goto('/dashboard/schedule', { waitUntil: 'domcontentloaded' })
        expect(res?.status()).not.toBe(500)
    })

    test('schedule page renders content (not blank)', async ({ page }) => {
        await page.goto('/dashboard/schedule')
        await page.waitForTimeout(3000)

        expect(page.url()).not.toContain('/login')
        const body = await page.textContent('body')
        expect(body?.length).toBeGreaterThan(50)
    })

    test('schedule page has no fatal JS errors', async ({ page }) => {
        const jsErrors: string[] = []
        page.on('pageerror', err => jsErrors.push(err.message))

        await page.goto('/dashboard/schedule')
        await page.waitForTimeout(3000)

        const fatal = jsErrors.filter(e =>
            !e.includes('ResizeObserver') &&
            !e.includes('non-Error promise') &&
            !e.includes('AbortError')
        )
        expect(fatal).toHaveLength(0)
    })

    test('schedule page has interactive UI', async ({ page }) => {
        await page.goto('/dashboard/schedule')
        await page.waitForTimeout(3000)

        // Should have some buttons or interactive elements
        const interactive = await page.locator('button, a, input').count()
        expect(interactive).toBeGreaterThan(0)
    })
})
