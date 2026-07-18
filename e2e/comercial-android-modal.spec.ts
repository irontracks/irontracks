import { expect, test } from '@playwright/test'

test.describe('Fluxo de download Android da página comercial', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('mantém o modal rolável e os links de instalação acessíveis', async ({ page }) => {
    await page.goto('/comercial')
    await page.getByRole('button', { name: /Google Play/i }).first().click()

    const dialog = page.getByRole('dialog', { name: 'Baixar para Android' })
    const panel = page.getByTestId('android-download-panel')
    const closeButton = dialog.getByRole('button', { name: 'Fechar' })

    await expect(dialog).toBeVisible()
    await expect(closeButton).toBeInViewport()
    await expect(dialog).toContainText('Use a mesma Conta Google nos 3 botões')
    await expect(dialog).toContainText('O item não foi encontrado')
    await expect(dialog).toContainText('algumas horas')

    const metrics = await panel.evaluate(element => {
      const rect = element.getBoundingClientRect()
      return {
        top: rect.top,
        bottom: rect.bottom,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
      }
    })

    expect(metrics.top).toBeGreaterThanOrEqual(0)
    expect(metrics.bottom).toBeLessThanOrEqual(640)
    expect(metrics.overflowY).toBe('auto')
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight)
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden')

    const storeLink = dialog.getByRole('link', { name: /Abrir na Play Store/i })
    await storeLink.scrollIntoViewIfNeeded()
    await expect(storeLink).toBeInViewport()
    await expect(closeButton).toBeInViewport()
    await expect(storeLink).toHaveAttribute(
      'href',
      'https://play.google.com/store/apps/details?id=com.irontracks.app',
    )

    await closeButton.click()
    await expect(dialog).toBeHidden()
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('')
  })

  test('publica as instruções de exclusão de conta exigidas pela Play Store', async ({ page }) => {
    await page.goto('/excluir-conta')

    await expect(page.getByRole('heading', { name: 'Exclusão de conta e dados' })).toBeVisible()
    await expect(page.getByText('Excluir minha conta')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Solicitar exclusão por e-mail' })).toHaveAttribute(
      'href',
      /^mailto:irontrackscompany@gmail\.com/,
    )
  })
})
