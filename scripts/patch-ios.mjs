/**
 * patch-ios.mjs
 * Patches Capacitor iOS native files after `npx cap sync`.
 * This script is safe to run on any environment — it skips automatically
 * when running in CI / Vercel / non-iOS builds.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Skip in CI / Vercel / cloud build environments
const isCI = !!(
    process.env.CI ||
    process.env.VERCEL ||
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.VERCEL_ENV
);

if (isCI) {
    console.log('[patch-ios] Ambiente CI/Vercel detectado — pulando patches iOS.');
    process.exit(0);
}

// Only apply patches if the iOS native directory exists (i.e. cap sync was run)
const iosDir = join(process.cwd(), 'ios');
if (!existsSync(iosDir)) {
    console.log('[patch-ios] Pasta ios/ não encontrada — pulando patches iOS.');
    process.exit(0);
}

console.log('[patch-ios] Aplicando patches iOS...');

// ── Add your iOS-specific patches here ──────────────────────────────────────
// Example: fix Info.plist, update Podfile, patch Swift files, etc.
// import { readFileSync, writeFileSync } from 'node:fs';
// const plistPath = join(iosDir, 'App/App/Info.plist');
// ...
// ─────────────────────────────────────────────────────────────────────────────

console.log('[patch-ios] Patches iOS concluídos.');
