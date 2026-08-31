import { chromium, type FullConfig } from '@playwright/test'

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

        // Extra wait for Supabase session to settle in localStorage/cookies
        await page.waitForTimeout(2000)

        // Save storage state
        await context.storageState({ path: 'e2e/.auth/user.json' })
        console.log('[E2E] Authenticated storage state saved to e2e/.auth/user.json')
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
