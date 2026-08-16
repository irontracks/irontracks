import { defineConfig, devices } from '@playwright/test'
import * as fs from 'node:fs'

const hasAuthCredentials = !!(process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD)
/**
 * Porta do app sob teste. Configurável porque a 3000 pode estar ocupada por
 * OUTRO projeto na máquina de quem roda — e aí o Playwright, com
 * `reuseExistingServer`, testa o app errado em silêncio (aconteceu em
 * 15/08/2026: a suíte falhou contra a tela de login de outro produto).
 * Com PLAYWRIGHT_PORT definido, o servidor é sempre iniciado do zero.
 */
const PORT = process.env.PLAYWRIGHT_PORT ?? '3000'
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`
const authStatePath = 'e2e/.auth/user.json'
const hasAuthState = fs.existsSync(authStatePath) && fs.statSync(authStatePath).size > 50

/**
 * Playwright E2E configuration for IronTracks.
 * Run: `npm run e2e` (requires the dev server running separately, or use webServer below).
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: 1, // 1 retry handles transient ECONNRESET with workers=2
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? 'github' : 'html',
    timeout: 30_000,

    // Run global-setup only when credentials are provided
    ...(hasAuthCredentials ? { globalSetup: './e2e/global-setup.ts' } : {}),

    use: {
        baseURL: BASE_URL,
        // Bypass da proteção da Vercel: os previews deste projeto têm Vercel
        // Authentication ligada (`ssoProtection: all_except_custom_domains`), e
        // sem este header o Playwright bate numa tela de login da Vercel em vez
        // do app. O token é o "Protection Bypass for Automation" — específico
        // para automação, escopo só de deployments; não é chave de banco.
        // Ausente = header vazio, e o E2E contra preview simplesmente não roda.
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
            ? {
                extraHTTPHeaders: {
                    'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
                    'x-vercel-set-bypass-cookie': 'true',
                },
            }
            : {}),
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },

    projects: [
        // --- Unauthenticated projects (run always) ---
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
            testIgnore: ['**/authenticated-*.spec.ts'],
        },
        {
            name: 'mobile-safari',
            use: { ...devices['iPhone 14'] },
            testIgnore: ['**/authenticated-*.spec.ts'],
        },

        // --- Authenticated project (runs only when auth state exists) ---
        ...(hasAuthCredentials || hasAuthState
            ? [
                {
                    name: 'authenticated',
                    use: {
                        ...devices['Desktop Chrome'],
                        storageState: authStatePath,
                    },
                    testMatch: ['**/authenticated-*.spec.ts'],
                    // Retries handle ECONNRESET / load-related flakiness with workers=2
                    retries: 1,
                },
            ]
            : []),
    ],

    // Sobe o servidor sozinho. Local: dev (rápido de iterar). No CI: só quando
    // PLAYWRIGHT_CI_SERVER=1 (o job de E2E do ci.yml), servindo o build que o
    // passo "Verify Build" já produziu — sem isso o CI tentaria falar com um
    // localhost que ninguém iniciou.
    webServer: process.env.CI
        ? (process.env.PLAYWRIGHT_CI_SERVER === '1'
            ? {
                command: `npm run start -- --port ${PORT}`,
                url: BASE_URL,
                reuseExistingServer: false,
                timeout: 120_000,
            }
            : undefined)
        : {
            command: `npm run dev -- --port ${PORT}`,
            url: BASE_URL,
            // Só reaproveita servidor existente na porta PADRÃO. Com uma porta
            // explícita, sobe a própria — é o ponto de ter escolhido a porta.
            reuseExistingServer: !process.env.PLAYWRIGHT_PORT,
            timeout: 120_000,
        },

    // Screenshot comparison config for visual regression
    expect: {
        toHaveScreenshot: {
            maxDiffPixelRatio: 0.01,
            threshold: 0.2,
            animations: 'disabled',
        },
    },
})
