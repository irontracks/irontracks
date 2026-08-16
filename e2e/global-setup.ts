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
        try {
            const r = await fetch(baseURL, {
                redirect: 'manual',
                // Mesmo bypass do `use.extraHTTPHeaders`: sem ele, um preview
                // protegido responde a tela da Vercel e a espera "conclui" num
                // app que não é o nosso.
                headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                    ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
                    : {},
            })
            if (r.status > 0) break
        } catch {
            if (Date.now() > deadline) {
                console.warn(`[E2E] app não respondeu em ${baseURL} — seguindo assim mesmo`)
                break
            }
            await new Promise((r) => setTimeout(r, 2_000))
        }
    }

    const browser = await chromium.launch()
    const context = await browser.newContext({
        extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
            ? {
                'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
                'x-vercel-set-bypass-cookie': 'true',
            }
            : {},
    })
    const page = await context.newPage()

    try {
        // Navigate to login page (app login is at root /)
        await page.goto(`${baseURL}/`, { waitUntil: 'networkidle', timeout: 15_000 })

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
        // Don't throw — let unauthenticated tests still run
    } finally {
        await browser.close()
    }
}
