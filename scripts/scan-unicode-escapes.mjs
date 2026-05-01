#!/usr/bin/env node
/**
 * Unicode Escape Scanner — IronTracks
 *
 * Catches `\uXXXX` (and surrogate pairs `\uD8XX\uDCXX`) written as literal
 * text inside JSX content, where they render as raw "á" / "🏃"
 * to the user instead of the intended character.
 *
 * Real-world incident: in 2026-04 the Cardio GPS panel header showed
 * "🏃 Cardio GPS" instead of "🏃 Cardio GPS" because the emoji had
 * been written as a literal escape sequence in JSX. That kind of corruption
 * tends to happen when an editor / formatter / AI tool round-trips the file
 * through JSON-encoded text without decoding it back.
 *
 * What this scan catches
 * ──────────────────────
 *  - JSX text children containing `\uXXXX` literally
 *  - Comments are also flagged (cosmetic but a strong signal of corruption)
 *
 * What it ignores
 * ───────────────
 *  - Regex literals like `/[̀-ͯ]/` — those are valid JS escapes
 *    interpreted by the regex engine.
 *  - String literals — `'á'` is decoded by the JS lexer at runtime,
 *    so the user sees the right character. Cosmetic, not a bug.
 *
 * Exits non-zero when it finds any. Wired into `npm run scan:all` so a
 * future regression breaks the deploy.
 *
 * Usage:
 *   node scripts/scan-unicode-escapes.mjs
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'

const ROOT = fileURLToPath(new URL('../src', import.meta.url))
const REPO = fileURLToPath(new URL('..', import.meta.url))

const SKIP_DIRS = new Set(['node_modules', '.next', 'out', 'coverage', '__tests__', '__mocks__'])

/** Walk *.tsx files only — JSX is where these escapes leak through to UI. */
function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry)) continue
        const full = join(dir, entry)
        const st = statSync(full)
        if (st.isDirectory()) {
            yield* walk(full)
        } else if (entry.endsWith('.tsx')) {
            yield full
        }
    }
}

/**
 * Inside a JSX block (between `>` and `<`), look for `\uXXXX`.
 * String contents (between matched quotes) are skipped — JS lexer handles
 * those correctly. RegExp literals (between `/.../`) are also skipped.
 *
 * This is heuristic, not a real parser, but it catches the corruption
 * pattern reliably without false positives in practice.
 */
function findOffenders(src) {
    const offenders = []
    const lines = src.split('\n')

    lines.forEach((line, i) => {
        // Skip lines that look like a regex literal containing unicode escapes
        // (common case: `.replace(/[̀-ͯ]/g, '')`).
        if (/\/[^/]*\\u[0-9a-fA-F]{4}[^/]*\//.test(line)) return

        // Strip string contents so escapes inside them don't trigger.
        // String literals decode at parse time — they're fine in production.
        const stripped = line
            .replace(/"(?:[^"\\]|\\.)*"/g, '""')
            .replace(/'(?:[^'\\]|\\.)*'/g, "''")
            .replace(/`(?:[^`\\]|\\.)*`/g, '``')

        const match = stripped.match(/\\u[0-9a-fA-F]{4}/)
        if (match) {
            offenders.push({ line: i + 1, text: line.trim().slice(0, 120), hit: match[0] })
        }
    })
    return offenders
}

let totalOffenders = 0
const fileResults = []

for (const file of walk(ROOT)) {
    const src = readFileSync(file, 'utf8')
    if (!src.includes('\\u')) continue
    const offenders = findOffenders(src)
    if (offenders.length) {
        totalOffenders += offenders.length
        fileResults.push({ file: relative(REPO, file), offenders })
    }
}

if (totalOffenders === 0) {
    console.log('✓ Nenhum escape unicode literal em JSX/comentários encontrado.')
    process.exit(0)
}

console.log(`✗ ${totalOffenders} escape(s) unicode literal(is) em ${fileResults.length} arquivo(s):\n`)
for (const { file, offenders } of fileResults) {
    console.log(`  ${file}`)
    for (const o of offenders) {
        console.log(`    L${o.line}  ${o.hit}  →  ${o.text}`)
    }
}
console.log(`
Esses são chars que vão renderizar literalmente pro usuário.
Substitua \\uXXXX pelo char real (ex: \\u2014 → —, \\ud83c\\udfc3 → 🏃).
`)
process.exit(1)
