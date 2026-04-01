#!/usr/bin/env node
/**
 * Console Scanner — IronTracks
 *
 * Detecta console.log/debug deixados em código de produção.
 * Logs expostos podem vazar dados do usuário, estrutura interna e tokens.
 *
 *   [AVISO]  console.log()   — debug comum, geralmente não deve ir a produção
 *   [AVISO]  console.debug() — debug explícito
 *   [INFO]   console.warn()  — aceitável em produção, mas revisar
 *   [INFO]   console.error() — aceitável em produção, mas revisar se não vaza dados
 *
 * NÃO reporta:
 *   - Arquivos de teste (*.test.ts, *.spec.ts)
 *   - Scripts utilitários (scripts/)
 *   - O próprio módulo de logger do app (src/lib/logger*)
 *   - Linhas comentadas (// console.log)
 *   - console.log em catch blocks com mensagem genérica (padrão aceito)
 *
 * Uso:
 *   node scripts/scan-console.mjs
 *   node scripts/scan-console.mjs --only-log   (só console.log/debug)
 *   node scripts/scan-console.mjs --summary    (só contagem por arquivo)
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'

const ROOT      = fileURLToPath(new URL('../src', import.meta.url))
const ONLY_LOG  = process.argv.includes('--only-log')
const SUMMARY   = process.argv.includes('--summary')

// ─── Utilitários ──────────────────────────────────────────────────────────────

function walk(dir, files = []) {
    for (const entry of readdirSync(dir)) {
        if (['node_modules', '.next', '.git', 'dist'].includes(entry)) continue
        if (entry.startsWith('.')) continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full, files)
        else if (/\.(tsx?|jsx?|mjs)$/.test(full)) files.push(full)
    }
    return files
}

function getContext(lines, lineNum, size = 2) {
    const start = Math.max(0, lineNum - 1 - size)
    const end   = Math.min(lines.length, lineNum + size)
    return lines.slice(start, end)
        .map((l, i) => `  ${String(start + i + 1).padStart(4)} │ ${l}`)
        .join('\n')
}

// Detecta se o console.log está dentro de um catch block (padrão aceito)
function isInCatchBlock(source, matchIndex) {
    const before = source.slice(Math.max(0, matchIndex - 200), matchIndex)
    return /}\s*catch\s*[({]/.test(before) || /catch\s*\([^)]*\)\s*\{[^}]*$/.test(before)
}

// ─── Padrões ──────────────────────────────────────────────────────────────────

const PATTERNS = [
    {
        level: 'AVISO',
        id: 'console-log',
        label: 'console.log() em código de produção',
        regex: /console\.log\s*\(/g,
        allowInCatch: false,
    },
    {
        level: 'AVISO',
        id: 'console-debug',
        label: 'console.debug() — debug explícito em produção',
        regex: /console\.debug\s*\(/g,
        allowInCatch: false,
    },
    {
        level: 'INFO',
        id: 'console-warn',
        label: 'console.warn() — revisar se não vaza informações sensíveis',
        regex: /console\.warn\s*\(/g,
        allowInCatch: true,
    },
    {
        level: 'INFO',
        id: 'console-error',
        label: 'console.error() — revisar se não vaza stack traces ou dados do usuário',
        regex: /console\.error\s*\(/g,
        allowInCatch: true,
    },
]

// ─── Análise ──────────────────────────────────────────────────────────────────

const allFiles = walk(ROOT)
const findings = []

// Arquivos a ignorar completamente
const IGNORE_PATHS = [
    '/lib/logger',
    '/scripts/',
    '.test.', '.spec.',
    'sw.js',    // service worker tem logs intencionais
]

for (const filePath of allFiles) {
    const relPath = relative(process.cwd(), filePath)

    // Pula arquivos da lista de ignorados
    if (IGNORE_PATHS.some(p => filePath.includes(p))) continue

    const source = readFileSync(filePath, 'utf8')
    const lines  = source.split('\n')

    for (const pattern of PATTERNS) {
        if (ONLY_LOG && !['console-log', 'console-debug'].includes(pattern.id)) continue

        const re = new RegExp(pattern.regex.source, pattern.regex.flags)
        let m
        while ((m = re.exec(source)) !== null) {
            const lineNum = source.slice(0, m.index).split('\n').length
            const lineText = lines[lineNum - 1] || ''

            // Pula linhas comentadas
            if (/^\s*\/\//.test(lineText)) continue
            if (/^\s*\*/.test(lineText)) continue

            // Pula em catch blocks se o padrão permite
            if (pattern.allowInCatch && isInCatchBlock(source, m.index)) continue

            // Verifica se o argumento contém dados potencialmente sensíveis
            const afterMatch = source.slice(m.index, m.index + 200)
            const hasSensitiveData = /token|password|senha|secret|key|email|user|session/i.test(afterMatch)
            const effectiveLevel = hasSensitiveData && pattern.level === 'INFO' ? 'AVISO' : pattern.level

            findings.push({
                level: effectiveLevel,
                id: pattern.id,
                label: hasSensitiveData
                    ? `${pattern.label} — ATENÇÃO: pode vazar dados sensíveis`
                    : pattern.label,
                file: relPath,
                line: lineNum,
                text: lineText.trim().slice(0, 100),
                context: getContext(lines, lineNum),
            })
        }
    }
}

// ─── Relatório ────────────────────────────────────────────────────────────────

const COLORS = {
    'AVISO': '\x1b[33m', 'INFO': '\x1b[36m',
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
}

const byLevel = findings.reduce((a, f) => ({ ...a, [f.level]: (a[f.level] || 0) + 1 }), {})
const byId    = findings.reduce((a, f) => ({ ...a, [f.id]: (a[f.id] || 0) + 1 }), {})

console.log('\n' + '─'.repeat(70))
console.log(`${COLORS.bold}IronTracks — Scan de Console Logs${COLORS.reset}`)
console.log('─'.repeat(70))
console.log(`Arquivos analisados : ${allFiles.length}`)
console.log(`Ocorrências         : ${findings.length} total`)
for (const [l, c] of Object.entries(byLevel))
    console.log(`  ${COLORS[l]}${l}${COLORS.reset} : ${c}`)
for (const [id, c] of Object.entries(byId))
    console.log(`    ${id}: ${c}`)
console.log('─'.repeat(70))

if (findings.length === 0) {
    console.log('\n✅ Nenhum console.log em código de produção!\n')
} else if (SUMMARY) {
    // Modo resumo: só mostra contagem por arquivo
    const byFile = {}
    for (const f of findings) {
        if (!byFile[f.file]) byFile[f.file] = 0
        byFile[f.file]++
    }
    const sorted = Object.entries(byFile).sort((a, b) => b[1] - a[1])
    console.log('\nTop arquivos com mais console calls:')
    for (const [file, count] of sorted.slice(0, 20)) {
        console.log(`  ${String(count).padStart(3)}  ${COLORS.dim}${file}${COLORS.reset}`)
    }
    if (sorted.length > 20) console.log(`  ... e mais ${sorted.length - 20} arquivos`)
} else {
    // Agrupa por arquivo
    const byFile = {}
    for (const f of findings) {
        if (!byFile[f.file]) byFile[f.file] = []
        byFile[f.file].push(f)
    }
    for (const [file, items] of Object.entries(byFile)) {
        console.log(`\n${COLORS.dim}${file}${COLORS.reset}  (${items.length} ocorrência(s))`)
        for (const item of items.slice(0, 5)) {
            console.log(`  ${COLORS[item.level]}[${item.level}]${COLORS.reset} linha ${item.line}: ${item.text}`)
        }
        if (items.length > 5)
            console.log(`  ${COLORS.dim}... e mais ${items.length - 5} ocorrências neste arquivo${COLORS.reset}`)
    }
}

console.log('\n' + '─'.repeat(70))
const aviso = byLevel['AVISO'] || 0
const info  = byLevel['INFO']  || 0
if (aviso > 0 || info > 0) {
    console.log(`\n⚠️  ${aviso} AVISO(s) e ${info} INFO(s) encontrados.`)
    console.log('   Use npm run scan:console -- --summary para ver os arquivos mais afetados.\n')
} else {
    console.log('\n✅ Nenhum console.log problemático encontrado.\n')
}
// Console logs não causam falha de build — saída sempre 0
