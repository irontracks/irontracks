import { test, expect } from '@playwright/test'

/**
 * Page rendering smoke tests — verify critical pages load without 500 errors.
 * These run without authentication; pages may show login gates or redirects.
 */

test.describe('Public Pages Load', () => {
    test('/ loads without error', async ({ page }) => {
        const response = await page.goto('/')
        expect(response?.status()).toBeLessThan(500)
        await expect(page.locator('body')).not.toBeEmpty()
    })

    test('/login loads without error', async ({ page }) => {
        const response = await page.goto('/login')
        expect(response?.status()).toBeLessThan(500)
    })

    test('/marketplace loads without error', async ({ page }) => {
        const response = await page.goto('/marketplace')
        expect(response?.status()).toBeLessThan(500)
        await expect(page.locator('body')).not.toBeEmpty()
    })
})

test.describe('Protected Pages — No 500', () => {
    test('/dashboard returns non-500', async ({ page }) => {
        const response = await page.goto('/dashboard')
        expect(response?.status()).toBeLessThan(500)
    })

    test('/assessments returns non-500', async ({ page }) => {
        const response = await page.goto('/assessments')
        expect(response?.status()).toBeLessThan(500)
    })
})

test.describe('Error Pages', () => {
    test('/nonexistent returns 404 page, not 500', async ({ page }) => {
        const response = await page.goto('/this-page-does-not-exist-12345')
        // Should be 404, never 500
        expect(response?.status()).not.toBe(500)
    })
})
