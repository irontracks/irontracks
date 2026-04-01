#!/usr/bin/env node
/**
 * Static Button Scanner — IronTracks
 *
 * Analisa todos os arquivos .tsx em src/ e detecta padrões problemáticos
 * em botões e handlers de click:
 *
 *   [CRÍTICO]  window.open(_blank) sem fallback  → silenciosamente falha quando popup bloqueado
 *   [AVISO]    onClick vazio ou sem efeito        → botão sem ação
 *   [AVISO]    fetch() sem .catch()               → rejeição silenciosa
 *   [INFO]     onClick anônimo inline             → difícil de testar
 *
 * Uso:
 *   node scripts/scan-buttons-static.mjs
 *   node scripts/scan-buttons-static.mjs --only-critical
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'

const ROOT = fileURLToPath(new URL('../src', import.meta.url))
const ONLY_CRITICAL = process.argv.includes('--only-critical')

// ─── Padrões a detectar ──────────────────────────────────────────────────────

const PATTERNS = [
    {
        level: 'CRÍTICO',
        id: 'window-open-blank',
        label: 'window.open(_blank) sem fallback — popup blocker silencia o erro',
        regex: /window\.open\s*\([^,)]+,\s*['"]_blank['"]\s*\)/g,
        context: 5,
    },
    {
        level: 'AVISO',
        id: 'empty-onclick',
        label: 'onClick vazio ou sem efeito',
        regex: /onClick=\{(?:\s*\(\)\s*=>\s*\{?\s*\}?\s*|\s*\(\)\s*=>\s*undefined\s*|\s*\(\)\s*=>\s*null\s*)\}/g,
        context: 2,
    },
    {
        level: 'AVISO',
        id: 'fetch-no-catch',
        label: 'fetch() sem .catch() — rejeição pode ser silenciosa',
        regex: /fetch\s*\([^)]+\)\s*\.then\s*\([^)]+\)(?!\s*\.catch)/g,
        context: 3,
    },
    {
        level: 'AVISO',
        id: 'win-null-silent',
        label: 'window.open retorno null descartado silenciosamente',
        regex: /const\s+\w+\s*=\s*window\.open\([^)]+\)[\s\S]{0,60}if\s*\(!\w+\)\s*\{?[^}]{0,80}return/g,
        context: 5,
    },
    {
        level: 'INFO',
        id: 'inline-anonymous',
        label: 'onClick com arrow function inline longa (>60 chars) — considere extrair para handler nomeado',
        regex: /onClick=\{(?!\s*\(\)\s*=>)\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[^}]{60,}\}/g,
        context: 2,
    },
]

// ─── Coletar arquivos .tsx ───────────────────────────────────────────────────

function walk(dir, files = []) {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            walk(full, files)
        } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
            files.push(full)
        }
    }
    return files
}

// ─── Extrair botões com onClick ──────────────────────────────────────────────

function extractButtons(source, filePath) {
    const buttons = []
    // Encontra <button ... onClick={...}>texto</button>
    const btnRe = /<button([^>]*)>([\s\S]{0,200}?)<\/button>/g
    let m
    while ((m = btnRe.exec(source)) !== null) {
        const attrs = m[1]
        const inner = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
        const onClickMatch = attrs.match(/onClick=\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/)
        if (!onClickMatch) continue

        const lineNum = source.slice(0, m.index).split('\n').length
        buttons.push({
            file: relative(process.cwd(), filePath),
            line: lineNum,
            text: inner || '(sem texto)',
            handler: onClickMatch[1].trim().slice(0, 80),
        })
    }
    return buttons
}

// ─── Análise principal ───────────────────────────────────────────────────────

const allFiles = walk(ROOT)
const findings = []
const buttonInventory = []

for (const filePath of allFiles) {
    const source = readFileSync(filePath, 'utf8')
    const relPath = relative(process.cwd(), filePath)

    // Inventário de botões
    const buttons = extractButtons(source, filePath)
    buttonInventory.push(...buttons)

    // Detecção de padrões
    for (const pattern of PATTERNS) {
        if (ONLY_CRITICAL && pattern.level !== 'CRÍTICO') continue

        const re = new RegExp(pattern.regex.source, pattern.regex.flags)
        let match
        while ((match = re.exec(source)) !== null) {
            const lineNum = source.slice(0, match.index).split('\n').length
            const lines = source.split('\n')
            const ctxStart = Math.max(0, lineNum - 1 - pattern.context)
            const ctxEnd = Math.min(lines.length, lineNum + pattern.context)
            const ctxLines = lines.slice(ctxStart, ctxEnd)
                .map((l, i) => `  ${String(ctxStart + i + 1).padStart(4)} │ ${l}`)
                .join('\n')

            findings.push({
                level: pattern.level,
                id: pattern.id,
                label: pattern.label,
                file: relPath,
                line: lineNum,
                match: match[0].slice(0, 100),
                context: ctxLines,
            })
        }
    }
}

// ─── Relatório ───────────────────────────────────────────────────────────────

const COLORS = {
    'CRÍTICO': '\x1b[31m',  // vermelho
    'AVISO': '\x1b[33m',    // amarelo
    'INFO': '\x1b[36m',     // ciano
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
}

const countByLevel = findings.reduce((acc, f) => {
    acc[f.level] = (acc[f.level] || 0) + 1
    return acc
}, {})

console.log('\n' + '─'.repeat(70))
console.log(`${COLORS.bold}IronTracks — Scan Estático de Botões${COLORS.reset}`)
console.log('─'.repeat(70))
console.log(`Arquivos analisados : ${allFiles.length}`)
console.log(`Botões encontrados  : ${buttonInventory.length}`)
console.log(`Ocorrências         : ${findings.length} total`)
for (const [level, count] of Object.entries(countByLevel)) {
    console.log(`  ${COLORS[level]}${level}${COLORS.reset} : ${count}`)
}
console.log('─'.repeat(70))

if (findings.length === 0) {
    console.log('\n✅ Nenhum padrão problemático encontrado!\n')
} else {
    for (const f of findings) {
        console.log(`\n${COLORS[f.level]}[${f.level}]${COLORS.reset} ${f.label}`)
        console.log(`${COLORS.dim}${f.file}:${f.line}${COLORS.reset}`)
        console.log(f.context)
    }
}

// ─── Inventário completo (opcional) ──────────────────────────────────────────

if (process.argv.includes('--inventory')) {
    console.log('\n' + '─'.repeat(70))
    console.log(`${COLORS.bold}Inventário de Botões (${buttonInventory.length} total)${COLORS.reset}`)
    console.log('─'.repeat(70))
    for (const b of buttonInventory) {
        console.log(`${COLORS.dim}${b.file}:${b.line}${COLORS.reset}  "${b.text}"  onClick={${b.handler}}`)
    }
}

console.log('\n' + '─'.repeat(70))
const criticalCount = countByLevel['CRÍTICO'] || 0
if (criticalCount > 0) {
    console.log(`\n❌ ${criticalCount} problema(s) CRÍTICO(s) encontrado(s). Corrija antes do deploy.\n`)
    process.exit(1)
} else {
    console.log('\n✅ Nenhum problema crítico. Verifique os avisos acima.\n')
}
