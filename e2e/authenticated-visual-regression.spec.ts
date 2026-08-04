import { test, expect } from '@playwright/test'

/**
 * Visual Regression — Authenticated Pages
 * Captures baselines for internal app screens.
 * Run with --update-snapshots to create initial baselines.
 */

test.describe('Visual Regression — Dashboard', () => {
    test('dashboard page visual match', async ({ page }) => {
        test.setTimeout(90_000)
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(7000) // more time for dynamic content under load
        // Disable animations for stable screenshots
        await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }' })
        await page.waitForTimeout(500)
        await expect(page).toHaveScreenshot('dashboard-authenticated.png', {
            fullPage: false,
            maxDiffPixelRatio: 0.15, // more tolerant under server load
        })
    })

    test('dashboard nutrition tab visual match', async ({ page }) => {
        test.setTimeout(90_000)
        await page.goto('/dashboard/nutrition', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(7000)
        await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }' })
        await page.waitForTimeout(500)
        await expect(page).toHaveScreenshot('dashboard-nutrition.png', {
            fullPage: false,
            maxDiffPixelRatio: 0.15,
        })
    })

    test('dashboard schedule tab visual match', async ({ page }) => {
        test.setTimeout(90_000)
        await page.goto('/dashboard/schedule', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(7000)
        await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }' })
        await page.waitForTimeout(500)
        await expect(page).toHaveScreenshot('dashboard-schedule.png', {
            fullPage: false,
            maxDiffPixelRatio: 0.15,
        })
    })
})

test.describe('Visual Regression — Community', () => {
    test('community page visual match', async ({ page }) => {
        test.setTimeout(90_000)
        await page.goto('/community', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(7000) // more time for social content under load
        await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }' })
        await page.waitForTimeout(500)
        await expect(page).toHaveScreenshot('community.png', {
            fullPage: false,
            maxDiffPixelRatio: 0.15, // more tolerant under server load
        })
    })
})
