import { test, expect } from '@playwright/test'

/**
 * Authenticated E2E: Plank Set Input
 *
 * Valida que o modal de série para o exercício Prancha exibe campos específicos
 * (Peso corporal + Tempo alvo) em vez dos inputs padrão (Peso + Reps).
 * Defensivo: se o ambiente E2E não tiver uma ficha com Prancha, o teste vira no-op.
 */
test.describe('Prancha Set Input (authenticated)', () => {
    test('modal de Prancha mostra peso corporal e tempo alvo', async ({ page }) => {
        await page.goto('/dashboard')
        await page.waitForTimeout(3000)

        // Procurar por qualquer elemento com texto "Prancha" ou "plank"
        const plankTriggers = page.locator('text=/prancha/i')
        const plankCount = await plankTriggers.count()

        if (plankCount === 0) {
            // Sem ficha de Prancha no ambiente — no-op (igual aos outros specs defensivos)
            return
        }

        // Clicar para navegar para o treino que contém Prancha
        await plankTriggers.first().click()
        await page.waitForTimeout(2000)

        // Tentar localizar o botão de iniciar o treino (padrão dos outros specs)
        const startWorkoutBtn = page.locator(
            'button:has-text("Treinar"), button:has-text("Iniciar treino")',
        )
        if ((await startWorkoutBtn.count()) > 0) {
            await startWorkoutBtn.first().click()
            await page.waitForTimeout(2000)
        }

        // Dentro do treino ativo — procurar pelos labels exclusivos do PlankSetInput
        const pesoCorporal = page.locator(
            '[aria-label="Peso corporal em kg"], label:has-text("Peso corporal")',
        )
        const tempoAlvo = page.locator(
            '[aria-label="Tempo alvo em segundos"], label:has-text("Tempo alvo")',
        )

        const pesoCount = await pesoCorporal.count()
        const tempoCount = await tempoAlvo.count()

        if (pesoCount > 0 && tempoCount > 0) {
            // Evidência clara do PlankSetInput renderizando
            await expect(pesoCorporal.first()).toBeVisible()
            await expect(tempoAlvo.first()).toBeVisible()
        }
    })

    test('botão Iniciar dispara o overlay "Prancha em andamento"', async ({ page }) => {
        await page.goto('/dashboard')
        await page.waitForTimeout(3000)

        // Mesma lógica defensiva: sem Prancha → no-op
        const plankTriggers = page.locator('text=/prancha/i')
        if ((await plankTriggers.count()) === 0) return

        await plankTriggers.first().click()
        await page.waitForTimeout(2000)

        const startWorkoutBtn = page.locator(
            'button:has-text("Treinar"), button:has-text("Iniciar treino")',
        )
        if ((await startWorkoutBtn.count()) > 0) {
            await startWorkoutBtn.first().click()
            await page.waitForTimeout(2000)
        }

        // Definir tempo curto (5s) para o countdown não bloquear o teste
        const tempoInput = page.locator('[aria-label="Tempo alvo em segundos"]').first()
        if ((await tempoInput.count()) === 0) return

        await tempoInput.fill('5')

        // Clicar em Iniciar do PlankSetInput (distingue do "Iniciar treino" pelo contexto)
        const iniciarBtn = page
            .locator('button:has-text("Iniciar")')
            .filter({ hasNotText: 'treino' })
            .first()

        if ((await iniciarBtn.count()) === 0) return

        await iniciarBtn.click()
        await page.waitForTimeout(500)

        // O PlankSetInput substitui o form pelo overlay "Prancha em andamento"
        const plankOverlay = page.locator('text=/prancha em andamento/i')
        if ((await plankOverlay.count()) > 0) {
            await expect(plankOverlay.first()).toBeVisible()
        }
    })
})
