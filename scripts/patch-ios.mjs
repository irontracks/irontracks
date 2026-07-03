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
// SPM resolves the SPM package graph from CapApp-SPM/Package.swift (the app's
// root manifest). `cap sync` regenerates it pinning capacitor-swift-pm to the
// installed Capacitor version via `exact: "<X>"` (e.g. 8.4.1). Any plugin whose
// Package.swift asks for a DIFFERENT version breaks resolution:
//   • Stale plugins (e.g. @capacitor-community/apple-sign-in@7.x) still declare
//     `from: "7.0.0"`, which SPM treats as 7.x only — incompatible with 8.x.
//   • A hardcoded target here (the old `8.0.2`) fights the version `cap sync`
//     wrote into CapApp-SPM and reintroduces the conflict on every sync.
//
// Fix: derive the target from the installed Capacitor (single source of truth,
// same value cap sync uses) and align EVERYTHING — CapApp-SPM + every plugin —
// to that exact version. capacitor-swift-pm is versioned in lockstep with
// @capacitor/ios, so this always tracks the real installed toolchain.
import { readFileSync, writeFileSync } from 'node:fs';

// Matches `capacitor-swift-pm.git", from|exact: "X.Y.Z"` and captures the leading
// text so we can rewrite only the version spec while preserving surrounding chars.
const SWIFT_PM_SPEC = /(capacitor-swift-pm\.git",\s*)(?:from|exact):\s*"[\d.]+"/g;

const CAP_APP_SPM = 'ios/App/CapApp-SPM/Package.swift';
const FALLBACK_VERSION = '8.4.1';

function readJsonVersion(rel) {
    const abs = join(process.cwd(), rel);
    if (!existsSync(abs)) return null;
    try {
        const v = JSON.parse(readFileSync(abs, 'utf8')).version;
        return typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v : null;
    } catch {
        return null;
    }
}

function readSwiftPmVersion(rel) {
    const abs = join(process.cwd(), rel);
    if (!existsSync(abs)) return null;
    const m = readFileSync(abs, 'utf8').match(
        /capacitor-swift-pm\.git",\s*(?:from|exact):\s*"([\d.]+)"/
    );
    return m ? m[1] : null;
}

// Priority: installed @capacitor/ios (canonical) → whatever cap sync wrote into
// CapApp-SPM → hardcoded fallback. This self-heals even if CapApp-SPM was
// manually reverted to a stale pin.
const capacitorIosVersion = readJsonVersion('node_modules/@capacitor/ios/package.json');
const capAppSpmVersion = readSwiftPmVersion(CAP_APP_SPM);
const TARGET_VERSION = capacitorIosVersion || capAppSpmVersion || FALLBACK_VERSION;
const targetSource = capacitorIosVersion
    ? '@capacitor/ios'
    : capAppSpmVersion
        ? 'CapApp-SPM'
        : 'fallback';
console.log(`  ℹ️  capacitor-swift-pm target: ${TARGET_VERSION} (fonte: ${targetSource})`);

const PACKAGES = [
    CAP_APP_SPM,
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
    const patched = content.replace(SWIFT_PM_SPEC, `$1exact: "${TARGET_VERSION}"`);
    if (patched !== content) {
        writeFileSync(abs, patched);
        fixed++;
        const name = rel
            .replace('node_modules/', '')
            .replace('ios/App/', '')
            .replace('/Package.swift', '');
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
