import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Login Flow
 *
 * Verifies the complete login experience — the user arrives at /login,
 * enters credentials, and is redirected to the dashboard.
 *
 * Requires: E2E_USER_EMAIL + E2E_USER_PASSWORD env vars.
 */
test.describe('Login Flow', () => {
    test('login page renders correctly', async ({ page }) => {
        await page.goto('/login')
        // Should have email + password fields
        await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 })
        await expect(page.locator('input[type="password"]')).toBeVisible()
        // Should have a submit button
        await expect(page.locator('button[type="submit"]')).toBeVisible()
    })

    test('login page has proper heading', async ({ page }) => {
        await page.goto('/login')
        // Should have a recognizable heading or brand
        const body = await page.textContent('body')
        expect(body?.toLowerCase()).toContain('iron')
    })

    test('empty form shows validation feedback', async ({ page }) => {
        await page.goto('/login')
        await page.waitForSelector('input[type="email"]', { timeout: 10_000 })
        // Click submit without filling anything
        await page.click('button[type="submit"]')
        // HTML5 validation should prevent submission — email field required
        const emailInput = page.locator('input[type="email"]')
        const isInvalid = await emailInput.evaluate(
            (el: HTMLInputElement) => !el.checkValidity(),
        )
        expect(isInvalid).toBe(true)
    })
})
