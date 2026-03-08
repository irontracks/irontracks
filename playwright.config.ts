import { defineConfig, devices } from '@playwright/test'
import * as fs from 'node:fs'

const hasAuthCredentials = !!(process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD)
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
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? 'github' : 'html',
    timeout: 30_000,

    // Run global-setup only when credentials are provided
    ...(hasAuthCredentials ? { globalSetup: './e2e/global-setup.ts' } : {}),

    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
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
                },
            ]
            : []),
    ],

    // Automatically start dev server when running E2E locally
    webServer: process.env.CI
        ? undefined
        : {
            command: 'npm run dev',
            url: 'http://localhost:3000',
            reuseExistingServer: true,
            timeout: 60_000,
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
