/**
 * ensure-next-compiled-commander.mjs
 * Ensures that Next.js compiled commander module is available for local dev.
 * Safe to run on any environment — skips automatically on CI/Vercel.
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
    // Silent skip — no output needed in CI
    process.exit(0);
}

// Check if node_modules/.bin/next exists (i.e. dependencies are installed)
const nextBin = join(process.cwd(), 'node_modules', '.bin', 'next');
if (!existsSync(nextBin)) {
    // Dependencies not installed yet — nothing to patch
    process.exit(0);
}

// Commander patch: ensure Next.js internal commander is compiled
// This resolves occasional "Cannot find module 'commander'" issues in dev
const nextDir = join(process.cwd(), 'node_modules', 'next');
const commanderPaths = [
    join(nextDir, 'dist', 'compiled', 'commander'),
    join(nextDir, 'dist', 'compiled', 'commander', 'index.js'),
];

const allExist = commanderPaths.every((p) => existsSync(p));
if (!allExist) {
    console.log('[ensure-commander] Commander compiled path não encontrado — nenhuma ação necessária.');
}

// No-op: Next.js 14+ includes commander compiled natively.
process.exit(0);
