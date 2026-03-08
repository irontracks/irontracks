import { test, expect } from '@playwright/test'

/**
 * Visual Regression Tests
 *
 * Captures screenshots of key pages and compares them against stored baselines.
 * On first run, screenshots are saved as the baseline (golden files).
 * Subsequent runs compare against the baseline and fail if differences exceed threshold.
 *
 * Update baselines: `npx playwright test --update-snapshots`
 */
test.describe('Visual Regression — Public Pages', () => {
    test('landing page visual match', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' })
        // Wait for animations to complete
        await page.waitForTimeout(1500)
        await expect(page).toHaveScreenshot('landing-page.png', {
            fullPage: false,
            maxDiffPixelRatio: 0.02,
        })
    })

    test('login page visual match', async ({ page }) => {
        await page.goto('/login', { waitUntil: 'networkidle' })
        await page.waitForTimeout(1500)
        await expect(page).toHaveScreenshot('login-page.png', {
            fullPage: false,
            maxDiffPixelRatio: 0.02,
        })
    })

    test('marketplace page visual match', async ({ page }) => {
        await page.goto('/marketplace', { waitUntil: 'networkidle' })
        await page.waitForTimeout(1500)
        await expect(page).toHaveScreenshot('marketplace-page.png', {
            fullPage: false,
            maxDiffPixelRatio: 0.02,
        })
    })
})

test.describe('Visual Regression — Responsive', () => {
    test('landing page mobile viewport', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto('/', { waitUntil: 'networkidle' })
        await page.waitForTimeout(1500)
        await expect(page).toHaveScreenshot('landing-page-mobile.png', {
            fullPage: false,
            maxDiffPixelRatio: 0.02,
        })
    })

    test('login page mobile viewport', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto('/login', { waitUntil: 'networkidle' })
        await page.waitForTimeout(1500)
        await expect(page).toHaveScreenshot('login-page-mobile.png', {
            fullPage: false,
            maxDiffPixelRatio: 0.02,
        })
    })
})
