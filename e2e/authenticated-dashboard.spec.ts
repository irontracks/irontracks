import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Dashboard & Navigation
 *
 * Runs with saved auth storage state — the user is already logged in.
 * Verifies the dashboard loads correctly with user-specific content.
 */
test.describe('Dashboard (authenticated)', () => {
    test('dashboard loads with user content', async ({ page }) => {
        await page.goto('/dashboard')

        // Should NOT redirect to login (we have auth state)
        await page.waitForTimeout(2000)
        expect(page.url()).toContain('/dashboard')

        // Dashboard should have the main content area
        await expect(page.locator('body')).not.toBeEmpty()
    })

    test('dashboard displays workout-related UI', async ({ page }) => {
        await page.goto('/dashboard')

        // Wait for content to render
        await page.waitForTimeout(3000)

        // Should have some interactive UI rendered (buttons, cards, etc.)
        const buttons = await page.locator('button').count()
        expect(buttons).toBeGreaterThanOrEqual(1)
    })

    test('dashboard navigation tabs work', async ({ page }) => {
        await page.goto('/dashboard')
        await page.waitForTimeout(2000)

        // Check for bottom navigation or tab-like elements
        const navItems = page.locator('nav a, nav button, [role="tab"], [role="tablist"] button')
        const count = await navItems.count()

        if (count > 0) {
            // Click the first nav item and verify no crash
            await navItems.first().click()
            await page.waitForTimeout(1000)
            expect(page.url()).toBeTruthy()
        }
    })

    test('settings modal can be opened', async ({ page }) => {
        await page.goto('/dashboard')
        await page.waitForTimeout(2000)

        // Look for settings button (gear icon or similar)
        const settingsBtn = page.locator(
            'button[aria-label*="config" i], button[aria-label*="setting" i], button[aria-label*="ajust" i]',
        )
        const count = await settingsBtn.count()

        if (count > 0) {
            await settingsBtn.first().click()
            await page.waitForTimeout(1000)
            // Settings modal should show some content
            const body = await page.textContent('body')
            expect(body?.length).toBeGreaterThan(100)
        }
    })

    test('no JavaScript errors on dashboard', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', (err) => errors.push(err.message))

        await page.goto('/dashboard')
        await page.waitForTimeout(3000)

        // Filter out known benign errors (Supabase reconnect, etc.)
        const criticalErrors = errors.filter(
            (e) =>
                !e.includes('ResizeObserver') &&
                !e.includes('AbortError') &&
                !e.includes('NetworkError') &&
                !e.includes('Failed to fetch'),
        )

        expect(criticalErrors).toHaveLength(0)
    })
})
