import { chromium, type BrowserContext, type FullConfig, type Page } from '@playwright/test'

const AUTH_STATE_PATH = 'e2e/.auth/user.json'

/**
 * Global setup for authenticated E2E tests.
 *
 * Logs in via Supabase and persists the browser storage state so that
 * tests in the "authenticated" project can skip the login step.
 *
 * Required env vars:
 *   E2E_USER_EMAIL    – Supabase user email
 *   E2E_USER_PASSWORD – Supabase user password
 */
export default async function globalSetup(_config: FullConfig) {
    const email = process.env.E2E_USER_EMAIL
    const password = process.env.E2E_USER_PASSWORD

    if (!email || !password) {
        console.warn(
            '[E2E] Skipping authenticated setup — E2E_USER_EMAIL / E2E_USER_PASSWORD not set.',
        )
        return
    }

    const baseURL =
        process.env.PLAYWRIGHT_BASE_URL ??
        `http://localhost:${process.env.PLAYWRIGHT_PORT ?? '3000'}`

    // Espera o app responder antes de tentar o login. O globalSetup corre em
    // paralelo com a subida do webServer: sem esta espera, o login falha por
    // "connection refused", o storage state não é criado e TODOS os testes
    // autenticados morrem com "Error reading storage state" — um erro que não
    // diz nada sobre a causa real (medido em 15/08/2026).
    const deadline = Date.now() + 120_000
    for (;;) {
        // ⚠️ O deadline precisa ser checado ANTES da tentativa, não só no
        // catch: `fetch` sem timeout NUNCA rejeita se o servidor aceita a
        // conexão e não responde — e aí o loop fica preso para sempre. Foi o
        // que aconteceu em 18/08/2026: o job ficou 46 minutos sem imprimir uma
        // linha sequer do Playwright (nem "Running N tests"), até ser
        // cancelado à mão. Sem output, parece o app travando; era a espera.
        if (Date.now() > deadline) {
            console.warn(`[E2E] app não respondeu em ${baseURL} — seguindo assim mesmo`)
            break
        }
        try {
            const r = await fetch(baseURL, {
                redirect: 'manual',
                // Cada tentativa tem teto próprio; o loop cuida da paciência total.
                signal: AbortSignal.timeout(10_000),
                // Mesmo bypass do `use.extraHTTPHeaders`: sem ele, um preview
                // protegido responde a tela da Vercel e a espera "conclui" num
                // app que não é o nosso.
                headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                    ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
                    : {},
            })
            if (r.status > 0) break
        } catch {
            await new Promise((r) => setTimeout(r, 2_000))
        }
    }

    // O teto do launch já é 30 s por default (playwright-core 1.62) — explícito
    // aqui só para ninguém reabrir a suspeita: NÃO foi por aqui que o job de
    // 31/08/2026 pendurou.
    const browser = await chromium.launch({ timeout: 30_000 })
    const context = await browser.newContext({
        extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
            ? {
                'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
                'x-vercel-set-bypass-cookie': 'true',
            }
            : {},
    })
    // ⚠️ AQUI estavam as chamadas sem teto. O default do Playwright para AÇÃO
    // (`actionTimeout`) é **0 — sem limite**, e dentro de um teste quem segura
    // isso é o `timeout` do teste. O globalSetup não tem teste nenhum: um
    // `page.click` num botão que nunca fica acionável (coberto, desabilitado,
    // animando) espera para sempre, sem imprimir nada. Um default de contexto
    // cobre a CLASSE — inclusive a próxima ação que alguém acrescentar aqui.
    context.setDefaultTimeout(15_000)

    const page = await context.newPage()

    try {
        // Navigate to login page (app login is at root /)
        // O app mantém conexões vivas (Supabase Realtime/analytics), portanto
        // `networkidle` nunca é uma condição estável. O formulário abaixo é a
        // evidência explícita de que a página terminou de carregar para o login.
        await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded', timeout: 15_000 })

        // Wait for login form to appear
        await page.waitForSelector('input[type="email"]', { timeout: 10_000 })

        // Fill credentials
        await page.fill('input[type="email"]', email)
        await page.fill('input[type="password"]', password)

        // Submit the form
        await page.click('button[type="submit"]')

        // Wait for redirect to dashboard (successful login)
        await page.waitForURL(
            (url) => url.pathname.includes('/dashboard') || url.pathname === '/',
            { timeout: 15_000 },
        )

        // ⚠️ O predicado acima casa com `/`, que é a URL de ANTES do login —
        // e `waitForURL` testa a URL corrente primeiro. Ou seja: ele volta na
        // hora e NÃO prova que o redirecionamento terminou. Quem espera de
        // verdade é isto, e é o que separa o storage state estável do que é
        // lido no meio de uma navegação.
        await esperarUrlParada(page, 2_000, 20_000)

        await salvarEstadoAutenticado(context, page)
        console.log(`[E2E] Authenticated storage state saved to ${AUTH_STATE_PATH}`)
    } catch (err) {
        console.error('[E2E] Auth setup failed:', err)
        // Com credenciais presentes, continuar sem o storage state só produz
        // uma cascata enganosa de ENOENT em todos os specs autenticados.
        throw err
    } finally {
        // `browser.close()` não aceita timeout (conferido nos tipos do
        // playwright-core 1.62: só `reason`). Se o chromium não morrer, este
        // await fica pendente para sempre — depois de o trabalho já estar
        // feito. Melhor-esforço: espera, avisa e segue.
        await comTeto(
            browser.close(),
            15_000,
            '[E2E] browser.close() não retornou em 15s — seguindo assim mesmo',
        )
    }
}

/**
 * Espera a URL ficar `paradaMs` sem mudar. Melhor-esforço: estourando `tetoMs`
 * avisa e segue — travar aqui seria trocar um pendurado por outro.
 */
async function esperarUrlParada(page: Page, paradaMs: number, tetoMs: number): Promise<void> {
    const limite = Date.now() + tetoMs
    let ultima = page.url()
    let desde = Date.now()
    while (Date.now() < limite) {
        await page.waitForTimeout(250)
        const agora = page.url()
        if (agora !== ultima) {
            ultima = agora
            desde = Date.now()
        } else if (Date.now() - desde >= paradaMs) {
            return
        }
    }
    console.warn(`[E2E] a URL não parou em ${tetoMs}ms (última: ${ultima}) — seguindo assim mesmo`)
}

/**
 * `context.storageState()` lê o localStorage DENTRO da página, e não aceita
 * timeout (os tipos do playwright-core 1.62 só têm `path`/`indexedDB`/
 * `credentials`). Se a página navegar no meio, a leitura é abortada
 * ("Execution context was destroyed") e refeita — com o app ainda
 * redirecionando, isso pode não terminar nunca.
 *
 * Não é hipótese: foi AQUI que o job pendurou em 31/08/2026. Com o
 * `globalTimeout` de 8 min ligado, o Playwright abortou e o próprio setup
 * imprimiu `browserContext.storageState: Execution context was destroyed`,
 * apontando esta linha. Sem o teto, era o silêncio de 6 h.
 *
 * Teto por tentativa + reespera da URL entre elas: navegação no meio da leitura
 * é transitória, e o que falta é dar tempo de a página parar.
 */
async function salvarEstadoAutenticado(context: BrowserContext, page: Page): Promise<void> {
    const TENTATIVAS = 3
    let ultimoErro: unknown
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
        const leitura = context.storageState({ path: AUTH_STATE_PATH })
        // Abandonada por teto, ela ainda pode rejeitar depois — sem este
        // handler isso vira unhandled rejection e derruba o processo.
        leitura.catch(() => {})
        const ok = await comTeto(
            leitura.then(() => true),
            30_000,
            `[E2E] storageState não retornou em 30s (tentativa ${tentativa}/${TENTATIVAS})`,
        ).catch((err: unknown) => {
            ultimoErro = err
            return false
        })
        if (ok) return
        if (ok === undefined) ultimoErro = new Error('storageState excedeu 30s')
        console.warn(`[E2E] storageState falhou (${tentativa}/${TENTATIVAS}), esperando a página parar`)
        await esperarUrlParada(page, 2_000, 10_000)
    }
    throw ultimoErro ?? new Error('[E2E] não foi possível salvar o storage state')
}

/** Espera `promessa` por no máximo `ms`; estourando, avisa e devolve o controle. */
async function comTeto<T>(promessa: Promise<T>, ms: number, aviso: string): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const teto = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
            console.warn(aviso)
            resolve(undefined)
        }, ms)
    })
    try {
        return await Promise.race([promessa, teto])
    } finally {
        if (timer) clearTimeout(timer)
    }
}
