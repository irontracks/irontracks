import { expect, test } from '@playwright/test'

const testerEmail = process.env.GOOGLE_PLAY_TEST_EMAIL || 'irontrackscompany@gmail.com'
const testerPassword = process.env.GOOGLE_PLAY_TEST_PASSWORD
const optInUrl = 'https://play.google.com/apps/testing/com.irontracks.app'

test.describe('Google Play tester access', () => {
  test('tester account can reach IronTracks testing opt-in page', async ({ page }) => {
    test.skip(!testerPassword, 'Set GOOGLE_PLAY_TEST_PASSWORD to run this external Google Play login test.')

    await page.goto(optInUrl, { waitUntil: 'domcontentloaded' })

    const emailField = page.getByLabel(/e-mail|email|phone|telefone/i)
    if (await emailField.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await emailField.fill(testerEmail)
      await page.getByRole('button', { name: /avançar|next/i }).click()
    }

    const blockedLogin = page.getByText(/navegador ou app pode não ser seguro|browser or app may not be secure/i)
    await expect(blockedLogin, 'Google blocked automated login before password entry. Test manually in normal Chrome.').not.toBeVisible({
      timeout: 10_000,
    })

    const passwordField = page.getByLabel(/senha|password/i)
    if (await passwordField.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await passwordField.fill(testerPassword)
      await page.getByRole('button', { name: /avançar|next/i }).click()
    }

    await page.waitForLoadState('domcontentloaded')

    const body = page.locator('body')
    await expect(body).toContainText(/IronTracks|You are a tester|You left the testing program|App not available/i, {
      timeout: 20_000,
    })

    const pageText = await body.innerText()
    expect(pageText).not.toMatch(/App not available|isn't available for this account/i)
    expect(pageText).toMatch(/You are a tester|IronTracks/i)
  })
})
