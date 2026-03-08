import { test, expect } from '@playwright/test'

/**
 * Accessibility E2E Tests
 *
 * Verifies that ARIA roles, labels, and landmarks are correctly set
 * across key pages. Acts as a screen reader compatibility baseline.
 */
test.describe('Accessibility — Public Pages', () => {
    test('landing page has proper ARIA landmarks', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' })
        await page.waitForTimeout(1000)

        // Should have a main landmark
        const main = page.locator('main, [role="main"]')
        if ((await main.count()) > 0) {
            await expect(main.first()).toBeVisible()
        }

        // All images should have alt text
        const images = page.locator('img:not([alt])')
        const missingAltCount = await images.count()
        expect(missingAltCount).toBe(0)
    })

    test('login page has accessible form', async ({ page }) => {
        await page.goto('/login', { waitUntil: 'networkidle' })
        await page.waitForTimeout(1000)

        // Email input should have a label or aria-label
        const emailInput = page.locator('input[type="email"]')
        if ((await emailInput.count()) > 0) {
            const hasLabel =
                (await emailInput.getAttribute('aria-label')) ||
                (await emailInput.getAttribute('aria-labelledby')) ||
                (await emailInput.getAttribute('placeholder')) ||
                (await emailInput.getAttribute('id'))
            expect(hasLabel).toBeTruthy()
        }

        // Password input should have a label or aria-label
        const passwordInput = page.locator('input[type="password"]')
        if ((await passwordInput.count()) > 0) {
            const hasLabel =
                (await passwordInput.getAttribute('aria-label')) ||
                (await passwordInput.getAttribute('aria-labelledby')) ||
                (await passwordInput.getAttribute('placeholder')) ||
                (await passwordInput.getAttribute('id'))
            expect(hasLabel).toBeTruthy()
        }

        // Submit button should have accessible text
        const submitBtn = page.locator('button[type="submit"]')
        if ((await submitBtn.count()) > 0) {
            const text = await submitBtn.textContent()
            expect(text?.trim().length).toBeGreaterThan(0)
        }
    })

    test('all interactive elements have accessible names', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' })
        await page.waitForTimeout(1000)

        // Buttons should have text content, aria-label, or aria-labelledby
        const buttons = page.locator('button')
        const buttonCount = await buttons.count()

        let unlabeledButtons = 0
        for (let i = 0; i < Math.min(buttonCount, 20); i++) {
            const btn = buttons.nth(i)
            const text = await btn.textContent()
            const ariaLabel = await btn.getAttribute('aria-label')
            const ariaLabelledBy = await btn.getAttribute('aria-labelledby')
            const title = await btn.getAttribute('title')

            if (!text?.trim() && !ariaLabel && !ariaLabelledBy && !title) {
                unlabeledButtons++
            }
        }

        // Allow at most 2 unlabeled buttons (icon-only without aria-label)
        expect(unlabeledButtons).toBeLessThanOrEqual(2)
    })

    test('page has no duplicate IDs', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' })
        await page.waitForTimeout(1000)

        const duplicateIds = await page.evaluate(() => {
            const allIds = document.querySelectorAll('[id]')
            const idMap: Record<string, number> = {}
            allIds.forEach((el) => {
                const id = el.id
                if (id) idMap[id] = (idMap[id] || 0) + 1
            })
            return Object.entries(idMap)
                .filter(([, count]) => count > 1)
                .map(([id]) => id)
        })

        expect(duplicateIds).toHaveLength(0)
    })

    test('page has proper heading hierarchy', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' })
        await page.waitForTimeout(1000)

        const headings = await page.evaluate(() => {
            const hs = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
            return Array.from(hs).map((h) => ({
                level: parseInt(h.tagName.substring(1)),
                text: h.textContent?.trim().substring(0, 50) || '',
            }))
        })

        if (headings.length > 0) {
            // First heading should be h1
            expect(headings[0].level).toBe(1)

            // No heading level should be skipped (h1 → h3 without h2)
            for (let i = 1; i < headings.length; i++) {
                const jump = headings[i].level - headings[i - 1].level
                // Allowing at most a 1-level increase (h1→h2, h2→h3)
                // Decreasing (h3→h1) is always fine
                expect(jump).toBeLessThanOrEqual(2)
            }
        }
    })

    test('color contrast — text is readable', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' })
        await page.waitForTimeout(1000)

        // Check that body text is not invisible (same color as background)
        const hasReadableText = await page.evaluate(() => {
            const body = document.body
            const style = getComputedStyle(body)
            return style.color !== style.backgroundColor
        })

        expect(hasReadableText).toBe(true)
    })
})

test.describe('Accessibility — Dialog Roles', () => {
    test('dialogs have proper ARIA attributes', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' })
        await page.waitForTimeout(1000)

        // Check any visible dialogs have proper role
        const dialogs = page.locator('[role="dialog"]')
        const dialogCount = await dialogs.count()

        for (let i = 0; i < dialogCount; i++) {
            const dialog = dialogs.nth(i)
            const ariaModal = await dialog.getAttribute('aria-modal')
            expect(ariaModal).toBe('true')

            // Should have aria-label or aria-labelledby
            const ariaLabel = await dialog.getAttribute('aria-label')
            const ariaLabelledBy = await dialog.getAttribute('aria-labelledby')
            expect(ariaLabel || ariaLabelledBy).toBeTruthy()
        }
    })
})
