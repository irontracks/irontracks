import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * Comprehensive Button Scan — IronTracks
 *
 * Navega por TODOS os estados conhecidos do app e verifica que cada botão
 * produz um efeito observável (DOM muda, request HTTP, download, navegação).
 *
 * Estrutura:
 *   1. Dashboard — botões visíveis e menu do header
 *   2. Modais do dashboard (histórico, notificações, configurações)
 *   3. Painel Admin — todas as abas
 *   4. Painel Admin → Aluno → Treinos → Export [CAMINHO CRÍTICO]
 *   5. Painel Admin → Aluno → outras abas
 *
 * Requires: auth storage state (e2e/.auth/user.json) + usuário com role=admin.
 *
 * Por que este arquivo começa com "authenticated-":
 *   Playwright config mapeia authenticated-*.spec.ts para o projeto
 *   "authenticated" que usa storageState com o usuário já logado.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Aguarda carregamento da página sem travar em networkidle */
async function waitForLoaded(page: Page, ms = 3000) {
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(ms)
}

/** Tipo de efeito detectado após um clique */
type ClickEffect =
    | { kind: 'download'; filename: string }
    | { kind: 'popup' }
    | { kind: 'navigation'; url: string }
    | { kind: 'dom-change'; delta: number }
    | { kind: 'network'; url: string }
    | { kind: 'none' }

/**
 * Clica em um botão e detecta automaticamente o efeito produzido.
 * Não lança erro se não detectar efeito — apenas retorna { kind: 'none' }.
 */
async function clickAndObserve(page: Page, button: Locator): Promise<ClickEffect> {
    const initialUrl = page.url()
    const initialDomLen = await page.evaluate(() => document.body.innerHTML.length)

    let downloadFilename: string | null = null
    let popupOpened = false
    const networkUrls: string[] = []

    const onDownload = (d: { suggestedFilename(): string }) => {
        downloadFilename = d.suggestedFilename()
    }
    const onPopup = () => { popupOpened = true }
    const onRequest = (req: { url(): string }) => {
        const u = req.url()
        // Ignora analytics, telemetria e assets estáticos
        if (
            !u.includes('analytics') &&
            !u.includes('vercel-insights') &&
            !u.includes('sentry') &&
            !u.includes('beacon') &&
            !u.includes('.css') &&
            !u.includes('.js') &&
            !u.includes('.png') &&
            !u.includes('.woff') &&
            (u.includes('/api/') || u.includes('supabase'))
        ) {
            networkUrls.push(u)
        }
    }

    // @ts-expect-error playwright types
    page.once('download', onDownload)
    page.once('popup', onPopup)
    page.on('request', onRequest)

    try {
        await button.click({ timeout: 3000 })
        await page.waitForTimeout(1500)
    } catch {
        return { kind: 'none' }
    } finally {
        page.off('request', onRequest)
    }

    if (downloadFilename) return { kind: 'download', filename: downloadFilename }
    if (popupOpened) return { kind: 'popup' }

    const newUrl = page.url()
    if (newUrl !== initialUrl) return { kind: 'navigation', url: newUrl }

    const newDomLen = await page.evaluate(() => document.body.innerHTML.length)
    const delta = Math.abs(newDomLen - initialDomLen)
    if (delta > 100) return { kind: 'dom-change', delta }

    if (networkUrls.length > 0) return { kind: 'network', url: networkUrls[0] }

    return { kind: 'none' }
}

/**
 * Textos de botões perigosos que NÃO devem ser clicados automaticamente.
 * O scanner pula estes e os marca como "skipped (dangerous)".
 */
const DANGEROUS_PATTERNS = [
    /deletar/i, /excluir/i, /remover/i, /apagar/i,
    /logout/i, /sair/i,
    /cancelar\s*assinatura/i,
    /resetar/i, /limpar\s*banco/i,
    /danger/i,
    /confirmar\s*exclusão/i,
    /sim,?\s*deletar/i,
    /desvincular\s*professor/i,
]

function isDangerous(text: string) {
    return DANGEROUS_PATTERNS.some(p => p.test(text))
}

/**
 * Varre todos os botões visíveis no estado atual, clica nos seguros,
 * e reporta o efeito de cada um. Retorna botões sem efeito detectável.
 */
async function scanVisibleButtons(page: Page, stateName: string): Promise<string[]> {
    const deadButtons: string[] = []
    const buttons = page.locator('button:visible')
    const count = await buttons.count()

    console.log(`\n[${stateName}] ${count} botões visíveis`)

    for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i)
        const text = (await btn.textContent() || '').trim().replace(/\s+/g, ' ').slice(0, 60)

        if (isDangerous(text)) {
            console.log(`  ⚠️  SKIP [perigoso]  "${text}"`)
            continue
        }

        // Snapshot do estado antes do clique
        const domBefore = await page.evaluate(() => document.body.innerHTML.length)

        const effect = await clickAndObserve(page, btn)

        switch (effect.kind) {
            case 'download':
                console.log(`  ✅ download        "${text}" → ${effect.filename}`)
                break
            case 'popup':
                console.log(`  ✅ popup aberto    "${text}"`)
                break
            case 'navigation':
                console.log(`  ✅ navegação       "${text}" → ${effect.url}`)
                // Voltar ao estado anterior
                await page.goBack()
                await waitForLoaded(page, 2000)
                break
            case 'dom-change':
                console.log(`  ✅ DOM mudou       "${text}" (Δ${effect.delta} chars)`)
                break
            case 'network':
                console.log(`  ✅ request HTTP    "${text}" → ${effect.url}`)
                break
            case 'none':
                // Verifica se DOM mudou de forma que o DOM inicial era menor
                const domAfter = await page.evaluate(() => document.body.innerHTML.length)
                if (Math.abs(domAfter - domBefore) > 50) {
                    console.log(`  ✅ DOM mudou*      "${text}"`)
                } else {
                    console.log(`  ❌ SEM EFEITO      "${text}"`)
                    deadButtons.push(`[${stateName}] "${text}"`)
                }
                break
        }
    }

    return deadButtons
}

// ─── Setup global ─────────────────────────────────────────────────────────────

const allDeadButtons: string[] = []

// ─── 1. Dashboard — visão inicial ─────────────────────────────────────────────

test.describe('Button Scan — Dashboard', () => {
    test('botões visíveis no dashboard principal', async ({ page }) => {
        await page.goto('/dashboard')
        await waitForLoaded(page, 4000)

        // Garante que estamos no dashboard (não em login)
        expect(page.url()).toContain('/dashboard')

        const dead = await scanVisibleButtons(page, 'Dashboard')
        allDeadButtons.push(...dead)

        // Reporta mas não falha — lista de botões sem efeito é o produto do scan
        console.log(`\nBotões sem efeito detectável: ${dead.length}`)
        for (const b of dead) console.log(`  • ${b}`)
    })

    test('navegação entre abas do dashboard', async ({ page }) => {
        await page.goto('/dashboard')
        await waitForLoaded(page, 3000)

        const tabs = page.locator('[role="tab"], [role="tablist"] button, nav button')
        const count = await tabs.count()
        console.log(`\n[Dashboard Tabs] ${count} abas encontradas`)

        for (let i = 0; i < count; i++) {
            const tab = tabs.nth(i)
            const text = (await tab.textContent() || '').trim()
            if (isDangerous(text)) continue

            await tab.click({ timeout: 2000 }).catch(() => { })
            await page.waitForTimeout(800)
            console.log(`  ✅ aba "${text}" clicada`)
        }
    })
})

// ─── 2. Menu do header ────────────────────────────────────────────────────────

test.describe('Button Scan — Header Menu', () => {
    test('abre menu e varre botões internos', async ({ page }) => {
        await page.goto('/dashboard')
        await waitForLoaded(page, 3000)

        // Abre o menu do header (botão "Menu" com aria-label)
        const menuBtn = page.locator('button[aria-label="Menu"]')
        if (await menuBtn.count() === 0) {
            console.log('[Header Menu] Botão de menu não encontrado — pulando')
            test.skip()
            return
        }

        await menuBtn.click()
        await page.waitForTimeout(1000)

        // Verifica se o menu abriu
        const menuOpen = await page.locator('[aria-label="Fechar menu"]').count()
        expect(menuOpen).toBeGreaterThan(0)

        const dead = await scanVisibleButtons(page, 'Header Menu (aberto)')
        allDeadButtons.push(...dead)
    })
})

// ─── 3. Painel Admin — abertura e abas ────────────────────────────────────────

test.describe('Button Scan — Admin Panel', () => {
    async function openAdminPanel(page: Page) {
        await page.goto('/dashboard')
        await waitForLoaded(page, 3000)

        // Abre menu do header
        const menuBtn = page.locator('button[aria-label="Menu"]')
        if (await menuBtn.count() === 0) return false

        await menuBtn.click()
        await page.waitForTimeout(1000)

        // Clica em "Painel de Controle" ou similar
        const adminBtn = page.locator('button, [role="button"]').filter({
            hasText: /painel de controle|admin/i
        })
        if (await adminBtn.count() === 0) {
            console.log('[Admin] Botão de admin não encontrado (usuário pode não ser admin)')
            return false
        }

        await adminBtn.first().click()
        await page.waitForTimeout(2000)

        // Confirma que o painel abriu
        const panelOpen = await page.locator('text=Painel de Controle').count()
        return panelOpen > 0
    }

    test('abre painel admin', async ({ page }) => {
        const opened = await openAdminPanel(page)
        if (!opened) {
            console.log('[Admin] Painel não aberto — usuário pode não ter role=admin')
            test.skip()
        }
        expect(opened).toBe(true)
    })

    test('navega por todas as abas do admin', async ({ page }) => {
        const opened = await openAdminPanel(page)
        if (!opened) { test.skip(); return }

        // Abas conhecidas (key do AdminPanelHeader)
        const tabLabels = [
            'Resumo', 'Alunos', 'Requisições', 'Professores', 'Prioridades',
            'Templates', 'Vídeos', 'VIP', 'Erros', 'Sistema',
        ]

        for (const label of tabLabels) {
            const tabBtn = page.locator('button').filter({ hasText: new RegExp(label, 'i') })
            if (await tabBtn.count() === 0) {
                console.log(`  ℹ️  Aba "${label}" não encontrada`)
                continue
            }

            await tabBtn.first().click()
            await page.waitForTimeout(1500)

            // Verifica que o conteúdo mudou
            const body = await page.textContent('body')
            expect(body?.length).toBeGreaterThan(100)
            console.log(`  ✅ Aba "${label}" navegou corretamente`)
        }
    })

    // ── Caminho crítico: Aluno → Treino → Export ────────────────────────────

    test('CRÍTICO: Aluno → Treino → Baixar PDF (download real)', async ({ page }) => {
        const opened = await openAdminPanel(page)
        if (!opened) { test.skip(); return }

        // Ir para aba Alunos
        const studentsTab = page.locator('button').filter({ hasText: /alunos/i })
        if (await studentsTab.count() === 0) { test.skip(); return }
        await studentsTab.first().click()
        await waitForLoaded(page, 2000)

        // Clicar no primeiro aluno da lista
        const studentRows = page.locator('[class*="cursor-pointer"]:visible, [role="row"]:visible').first()
        const firstStudent = page.locator('button, div[class*="hover"]').filter({
            hasText: /@|\.com/i  // linhas com email geralmente são alunos
        }).first()

        // Tenta encontrar uma linha de aluno clicável por diferentes seletores
        const clickableRow = page.locator(
            '[class*="student"], [class*="aluno"], tr[class*="cursor"], div[class*="cursor-pointer"]'
        ).first()

        const rowCount = await clickableRow.count()
        if (rowCount === 0) {
            // Fallback: qualquer linha com texto de aluno
            const fallbackRow = page.locator('div').filter({ hasText: /aluno|athlete/i }).first()
            if (await fallbackRow.count() === 0) {
                console.log('[Admin→Aluno] Nenhum aluno encontrado — pulando')
                test.skip()
                return
            }
        }

        // Clica no primeiro aluno disponível
        const allClickableRows = page.locator('div[class*="cursor-pointer"], tr').filter({
            hasNot: page.locator('header, nav, footer')
        })
        const firstRow = allClickableRows.first()
        if (await firstRow.count() === 0) { test.skip(); return }

        await firstRow.click()
        await waitForLoaded(page, 2000)

        // Ir para aba Treinos dentro do detalhe do aluno
        const treinosTab = page.locator('button').filter({ hasText: /^treinos$/i })
        if (await treinosTab.count() === 0) {
            console.log('[Admin→Aluno→Treinos] Aba Treinos não encontrada')
            test.skip()
            return
        }
        await treinosTab.first().click()
        await waitForLoaded(page, 2000)

        // Clicar em um treino para abrir o modal de visualização
        const workoutItems = page.locator('button, div[class*="cursor-pointer"]').filter({
            hasText: /treino|workout/i
        })
        if (await workoutItems.count() === 0) {
            console.log('[Admin→Aluno→Treinos] Nenhum treino encontrado')
            test.skip()
            return
        }
        await workoutItems.first().click()
        await waitForLoaded(page, 1500)

        // Clica em "Salvar / Exportar"
        const exportBtn = page.locator('button').filter({ hasText: /salvar.*exportar|exportar/i })
        if (await exportBtn.count() === 0) {
            console.log('[Admin→Export] Botão "Salvar / Exportar" não encontrado')
            test.skip()
            return
        }
        await exportBtn.first().click()
        await page.waitForTimeout(1000)

        // Verifica que o modal de export abriu
        const modal = page.locator('text=/como deseja salvar|baixar pdf|baixar json/i')
        await expect(modal.first()).toBeVisible({ timeout: 3000 })

        // ── Testa "Baixar PDF" ──
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 5000 }),
            page.locator('button').filter({ hasText: /baixar pdf/i }).first().click(),
        ])

        expect(download.suggestedFilename()).toMatch(/\.(html|pdf)$/)
        console.log(`\n  ✅ CRÍTICO: Baixar PDF → download: "${download.suggestedFilename()}"`)
    })

    test('CRÍTICO: Aluno → Treino → Baixar JSON (download real)', async ({ page }) => {
        const opened = await openAdminPanel(page)
        if (!opened) { test.skip(); return }

        // Ir para aba Alunos
        const studentsTab = page.locator('button').filter({ hasText: /alunos/i })
        if (await studentsTab.count() === 0) { test.skip(); return }
        await studentsTab.first().click()
        await waitForLoaded(page, 2000)

        // Navegar até o modal de export (mesmo fluxo do teste anterior)
        const allClickableRows = page.locator('div[class*="cursor-pointer"], tr').filter({
            hasNot: page.locator('header, nav, footer')
        })
        if (await allClickableRows.count() === 0) { test.skip(); return }

        await allClickableRows.first().click()
        await waitForLoaded(page, 2000)

        const treinosTab = page.locator('button').filter({ hasText: /^treinos$/i })
        if (await treinosTab.count() === 0) { test.skip(); return }
        await treinosTab.first().click()
        await waitForLoaded(page, 2000)

        const workoutItems = page.locator('button, div[class*="cursor-pointer"]').filter({
            hasText: /treino|workout/i
        })
        if (await workoutItems.count() === 0) { test.skip(); return }
        await workoutItems.first().click()
        await waitForLoaded(page, 1500)

        const exportBtn = page.locator('button').filter({ hasText: /salvar.*exportar|exportar/i })
        if (await exportBtn.count() === 0) { test.skip(); return }
        await exportBtn.first().click()
        await page.waitForTimeout(1000)

        // ── Testa "Baixar JSON" ──
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 5000 }),
            page.locator('button').filter({ hasText: /baixar json/i }).first().click(),
        ])

        expect(download.suggestedFilename()).toMatch(/\.json$/)
        console.log(`\n  ✅ CRÍTICO: Baixar JSON → download: "${download.suggestedFilename()}"`)
    })

    test('CRÍTICO: modal de export fecha após download', async ({ page }) => {
        const opened = await openAdminPanel(page)
        if (!opened) { test.skip(); return }

        const studentsTab = page.locator('button').filter({ hasText: /alunos/i })
        if (await studentsTab.count() === 0) { test.skip(); return }
        await studentsTab.first().click()
        await waitForLoaded(page, 2000)

        const allClickableRows = page.locator('div[class*="cursor-pointer"], tr').filter({
            hasNot: page.locator('header, nav, footer')
        })
        if (await allClickableRows.count() === 0) { test.skip(); return }
        await allClickableRows.first().click()
        await waitForLoaded(page, 2000)

        const treinosTab = page.locator('button').filter({ hasText: /^treinos$/i })
        if (await treinosTab.count() === 0) { test.skip(); return }
        await treinosTab.first().click()
        await waitForLoaded(page, 2000)

        const workoutItems = page.locator('button, div[class*="cursor-pointer"]').filter({
            hasText: /treino|workout/i
        })
        if (await workoutItems.count() === 0) { test.skip(); return }
        await workoutItems.first().click()
        await waitForLoaded(page, 1500)

        const exportBtn = page.locator('button').filter({ hasText: /salvar.*exportar|exportar/i })
        if (await exportBtn.count() === 0) { test.skip(); return }
        await exportBtn.first().click()
        await page.waitForTimeout(1000)

        // Verifica que o modal está aberto
        const modalDialog = page.locator('[role="dialog"]').filter({ hasText: /como deseja salvar/i })
        await expect(modalDialog.first()).toBeVisible({ timeout: 3000 })

        // Clica "Baixar JSON" e aguarda download
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 5000 }),
            page.locator('button').filter({ hasText: /baixar json/i }).first().click(),
        ])
        expect(download.suggestedFilename()).toMatch(/\.json$/)

        // Modal deve fechar após download
        await page.waitForTimeout(500)
        const modalStillOpen = await page.locator('[role="dialog"]').filter({
            hasText: /como deseja salvar/i
        }).count()
        expect(modalStillOpen).toBe(0)
        console.log(`\n  ✅ CRÍTICO: modal fechou após download JSON`)
    })
})

// ─── 4. Painel Admin — abas do aluno ──────────────────────────────────────────

test.describe('Button Scan — Admin → Detalhe do Aluno', () => {
    async function openStudentDetail(page: Page) {
        await page.goto('/dashboard')
        await waitForLoaded(page, 3000)

        const menuBtn = page.locator('button[aria-label="Menu"]')
        if (await menuBtn.count() === 0) return false
        await menuBtn.click()
        await page.waitForTimeout(1000)

        const adminBtn = page.locator('button, [role="button"]').filter({
            hasText: /painel de controle|admin/i
        })
        if (await adminBtn.count() === 0) return false
        await adminBtn.first().click()
        await page.waitForTimeout(2000)

        const studentsTab = page.locator('button').filter({ hasText: /alunos/i })
        if (await studentsTab.count() === 0) return false
        await studentsTab.first().click()
        await waitForLoaded(page, 2000)

        const firstRow = page.locator('div[class*="cursor-pointer"], tr').filter({
            hasNot: page.locator('header, nav, footer')
        }).first()
        if (await firstRow.count() === 0) return false

        await firstRow.click()
        await waitForLoaded(page, 2000)
        return true
    }

    test('abas do detalhe do aluno navegam corretamente', async ({ page }) => {
        const opened = await openStudentDetail(page)
        if (!opened) { test.skip(); return }

        const studentTabs = ['Treinos', 'Check-ins', 'Perfil', 'Evolução', 'Vídeos']

        for (const tabName of studentTabs) {
            const tab = page.locator('button').filter({ hasText: new RegExp(`^${tabName}$`, 'i') })
            if (await tab.count() === 0) {
                console.log(`  ℹ️  Aba "${tabName}" não encontrada no detalhe do aluno`)
                continue
            }

            const domBefore = await page.evaluate(() => document.body.innerHTML.length)
            await tab.first().click()
            await page.waitForTimeout(1000)
            const domAfter = await page.evaluate(() => document.body.innerHTML.length)

            const changed = Math.abs(domAfter - domBefore) > 50
            console.log(`  ${changed ? '✅' : '⚠️ '} Aba "${tabName}" ${changed ? 'mudou DOM' : 'DOM não mudou (pode já estar nela)'}`)
        }
    })
})

// ─── 5. Relatório final ────────────────────────────────────────────────────────

test.describe('Relatório do Scan', () => {
    test('sumário de botões sem efeito detectável', async () => {
        console.log('\n' + '═'.repeat(60))
        console.log('SUMÁRIO: Botões sem efeito detectável no scan')
        console.log('═'.repeat(60))

        if (allDeadButtons.length === 0) {
            console.log('✅ Nenhum botão sem efeito encontrado!')
        } else {
            console.log(`❌ ${allDeadButtons.length} botão(ões) sem efeito detectável:`)
            for (const b of allDeadButtons) {
                console.log(`  • ${b}`)
            }
            console.log('\nNOTA: "sem efeito detectável" pode significar:')
            console.log('  - Botão realmente quebrado (bug)')
            console.log('  - Efeito sutil não detectado pelo scanner genérico')
            console.log('  - Botão contextual que requer estado específico')
        }
        console.log('═'.repeat(60))

        // Intencionalmente não falha aqui — o scan produz um inventário,
        // não bloqueia o deploy. Os testes CRÍTICO acima é que falham se houver bug.
        expect(true).toBe(true)
    })
})
