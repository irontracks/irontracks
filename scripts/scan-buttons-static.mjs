#!/usr/bin/env node
/**
 * Static Button Scanner — IronTracks
 *
 * Analisa todos os arquivos .tsx/.ts em src/ e detecta padrões problemáticos
 * em botões e handlers de click.
 *
 * window.open é classificado contextualmente:
 *   [CRÍTICO]  blob URL + sem feedback ao usuário quando popup bloqueado
 *   [AVISO]    URL externa/mailto sem fallback visível ao usuário
 *   [OK]       tem if(!win) com alert/download/navigate → não reportado
 *
 * Outros padrões:
 *   [AVISO]    onClick vazio ou sem efeito
 *   [AVISO]    fetch() sem .catch()
 *   [INFO]     onClick anônimo inline muito longo
 *
 * Uso:
 *   node scripts/scan-buttons-static.mjs
 *   node scripts/scan-buttons-static.mjs --only-critical
 *   node scripts/scan-buttons-static.mjs --inventory
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'

const ROOT = fileURLToPath(new URL('../src', import.meta.url))
const ONLY_CRITICAL = process.argv.includes('--only-critical')

// ─── Análise contextual de window.open ───────────────────────────────────────

/**
 * Classifica uma ocorrência de window.open() analisando o contexto ao redor.
 *
 * Retorna null se o tratamento já está correto (não deve ser reportado).
 * Retorna { level, label } se deve ser reportado.
 */
function classifyWindowOpen(source, matchIndex, matchStr) {
    // Extrai os próximos 400 chars (janela de análise após o match)
    const after = source.slice(matchIndex, matchIndex + 400)
    // Extrai os 60 chars antes (para ver se é atribuição: const win = window.open)
    const before = source.slice(Math.max(0, matchIndex - 60), matchIndex)

    // Determina o tipo de URL (primeiro argumento)
    const firstArgMatch = matchStr.match(/window\.open\s*\(\s*(['"`]?)([^,)'"`]+)\1/)
    const firstArg = firstArgMatch ? firstArgMatch[2].trim() : ''
    const isBlob = /blobUrl|blobFallback|createObjectURL|URL\.create|^''$|^""$/.test(firstArg)
    const isMailto = firstArg.includes('mailto:')
    const isExternal = !isBlob && !isMailto

    // O resultado é atribuído a uma variável?
    const resultVar = before.match(/(?:const|let|var)\s+(\w+)\s*=\s*$/) ||
                      before.match(/(\w+)\s*=\s*$/)
    const varName = resultVar ? resultVar[1] : null

    // Tem verificação de null com feedback útil ao usuário?
    // "Útil" = tem alert, toast, download (<a> click), navigate (location.href) ou throw
    const hasUsefulFeedback = (ctx) =>
        /alert\s*\(|toast\s*\(|\.href\s*=|\.click\s*\(\)|download|throw\s|\.replace\s*\(/.test(ctx)

    if (varName) {
        // Janela de análise focada no null-check: if (!varName) { ... }
        const nullCheckRe = new RegExp(
            `if\\s*\\(!\\s*${varName}\\s*\\)\\s*\\{([^}]{0,300})\\}`,
        )
        const nullCheck = after.match(nullCheckRe)

        if (nullCheck) {
            const body = nullCheck[1]
            if (hasUsefulFeedback(body)) {
                // Tem feedback real → OK, não reporta
                return null
            }
            // Null-check existe mas só faz return/revokeObjectURL silenciosamente
            if (isBlob) {
                return {
                    level: 'CRÍTICO',
                    label: 'window.open(blobURL) — popup bloqueado causa falha silenciosa (sem feedback ao usuário)',
                }
            }
            return {
                level: 'AVISO',
                label: 'window.open() — popup bloqueado descartado silenciosamente sem aviso ao usuário',
            }
        }

        // Tem if(varName) { ... } mas sem else → silencioso se bloqueado
        const positiveCheck = new RegExp(`if\\s*\\(\\s*${varName}\\s*\\)`).test(after)
        if (positiveCheck) {
            if (isBlob) {
                return {
                    level: 'AVISO',
                    label: 'window.open(blobURL) — if(win){} sem else: sem feedback quando popup bloqueado',
                }
            }
            // URL externa/vazia com if(win) sem else → INFO
            return {
                level: 'INFO',
                label: 'window.open() — if(win){} sem else (aceitável para URL externa/popup)',
            }
        }

        // Sem null-check nenhum
        if (isBlob) {
            return {
                level: 'CRÍTICO',
                label: 'window.open(blobURL) — resultado nunca verificado, popup bloqueado = falha silenciosa',
            }
        }
        return {
            level: 'AVISO',
            label: 'window.open() — resultado não verificado',
        }
    }

    // Resultado não atribuído: window.open(url, '_blank') sem captura
    if (isMailto || isExternal) {
        // URL externa acionada por gesto direto — risco baixo
        return {
            level: 'AVISO',
            label: `window.open(${isMailto ? 'mailto:' : 'URL externa'}) sem captura de resultado — silencioso se bloqueado`,
        }
    }

    return {
        level: 'CRÍTICO',
        label: 'window.open(blobURL) sem captura de resultado — falha silenciosa garantida',
    }
}

// ─── Outros padrões simples ───────────────────────────────────────────────────

const SIMPLE_PATTERNS = [
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
        level: 'INFO',
        id: 'inline-anonymous',
        label: 'onClick com arrow function inline longa (>60 chars) — considere extrair para handler nomeado',
        regex: /onClick=\{(?!\s*\(\)\s*=>)\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[^}]{60,}\}/g,
        context: 2,
    },
]

// ─── Coletar arquivos ─────────────────────────────────────────────────────────

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

// ─── Extrair botões com onClick ───────────────────────────────────────────────

function extractButtons(source, filePath) {
    const buttons = []
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

// ─── Análise principal ────────────────────────────────────────────────────────

const allFiles = walk(ROOT)
const findings = []
const buttonInventory = []

const WINDOW_OPEN_RE = /window\.open\s*\([^)]+,\s*['"]_blank['"]/g

for (const filePath of allFiles) {
    const source = readFileSync(filePath, 'utf8')
    const relPath = relative(process.cwd(), filePath)

    buttonInventory.push(...extractButtons(source, filePath))

    // ── window.open: análise contextual ──────────────────────────────────────
    const woRe = new RegExp(WINDOW_OPEN_RE.source, WINDOW_OPEN_RE.flags)
    let woMatch
    while ((woMatch = woRe.exec(source)) !== null) {
        const result = classifyWindowOpen(source, woMatch.index, woMatch[0])
        if (!result) continue // tratamento já correto
        if (ONLY_CRITICAL && result.level !== 'CRÍTICO') continue

        const lineNum = source.slice(0, woMatch.index).split('\n').length
        const lines = source.split('\n')
        const ctxStart = Math.max(0, lineNum - 2)
        const ctxEnd = Math.min(lines.length, lineNum + 6)
        const ctxLines = lines.slice(ctxStart, ctxEnd)
            .map((l, i) => `  ${String(ctxStart + i + 1).padStart(4)} │ ${l}`)
            .join('\n')

        findings.push({
            level: result.level,
            id: 'window-open',
            label: result.label,
            file: relPath,
            line: lineNum,
            context: ctxLines,
        })
    }

    // ── Outros padrões simples ────────────────────────────────────────────────
    for (const pattern of SIMPLE_PATTERNS) {
        if (ONLY_CRITICAL) continue

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
                context: ctxLines,
            })
        }
    }
}

// ─── Relatório ────────────────────────────────────────────────────────────────

const COLORS = {
    'CRÍTICO': '\x1b[31m',
    'AVISO':   '\x1b[33m',
    'INFO':    '\x1b[36m',
    'OK':      '\x1b[32m',
    reset: '\x1b[0m',
    bold:  '\x1b[1m',
    dim:   '\x1b[2m',
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
    console.log(`  ${COLORS[level] || ''}${level}${COLORS.reset} : ${count}`)
}
console.log('─'.repeat(70))

if (findings.length === 0) {
    console.log('\n✅ Nenhum padrão problemático encontrado!\n')
} else {
    for (const f of findings) {
        console.log(`\n${COLORS[f.level] || ''}[${f.level}]${COLORS.reset} ${f.label}`)
        console.log(`${COLORS.dim}${f.file}:${f.line}${COLORS.reset}`)
        console.log(f.context)
    }
}

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
