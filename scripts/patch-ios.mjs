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

// ── Fix capacitor-swift-pm version conflicts for Xcode 26+ ──────────────────
// SPM in Xcode 26+ treats `from: "7.0.0"` as 7.x only (semver major boundary),
// which conflicts with CapApp-SPM's `exact: "8.0.2"`. This patch aligns all
// plugin Package.swift files to use `exact` instead of `from`.
import { readFileSync, writeFileSync } from 'node:fs';

const TARGET_VERSION = '8.0.2';
const PACKAGES = [
    'node_modules/@capacitor/app/Package.swift',
    'node_modules/@capacitor/device/Package.swift',
    'node_modules/@capacitor/filesystem/Package.swift',
    'node_modules/@capacitor/push-notifications/Package.swift',
    'node_modules/@capacitor-community/apple-sign-in/Package.swift',
    'node_modules/@capacitor/geolocation/Package.swift',
    'node_modules/@revenuecat/purchases-capacitor/Package.swift',
];

let fixed = 0;
for (const rel of PACKAGES) {
    const abs = join(process.cwd(), rel);
    if (!existsSync(abs)) continue;
    const content = readFileSync(abs, 'utf8');
    const patched = content.replace(
        /capacitor-swift-pm\.git",\s*from:\s*"[\d.]+"/g,
        `capacitor-swift-pm.git", exact: "${TARGET_VERSION}"`
    );
    if (patched !== content) {
        writeFileSync(abs, patched);
        fixed++;
        const name = rel.replace('node_modules/', '').replace('/Package.swift', '');
        console.log(`  ✔ ${name} → exact: "${TARGET_VERSION}"`);
    }
}

if (fixed > 0) {
    console.log(`  ℹ️  Fixed ${fixed} Package.swift file(s).`);
} else {
    console.log('  ℹ️  All Package.swift files already aligned.');
}
// ─────────────────────────────────────────────────────────────────────────────

console.log('[patch-ios] Patches iOS concluídos.');
