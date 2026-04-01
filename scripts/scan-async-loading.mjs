#!/usr/bin/env node
/**
 * Async Loading State Scanner — IronTracks
 *
 * Detecta botões que chamam funções assíncronas sem estado de loading/disabled,
 * causando duplos cliques, requisições duplicadas e UX confusa.
 *
 *   [CRÍTICO] onClick async inline sem disabled — duplo clique garante requisição duplicada
 *   [AVISO]   onClick com handler nomeado async sem disabled visível
 *   [INFO]    onClick async com disabled condicional (pode estar correto, revisar)
 *
 * O que é "correto":
 *   <button onClick={handler} disabled={loading || saving}>  ✅
 *   <button onClick={handler} disabled={!!saving}>            ✅
 *   <button disabled={isBusy} onClick={...}>                  ✅
 *
 * O que é problemático:
 *   <button onClick={async () => { await fetch(...) }}>       ❌ sem disabled
 *   <button onClick={handleSave}>  (handleSave é async)       ⚠️ sem disabled visível
 *
 * Uso:
 *   node scripts/scan-async-loading.mjs
 *   node scripts/scan-async-loading.mjs --only-critical
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'

const ROOT      = fileURLToPath(new URL('../src', import.meta.url))
const ONLY_CRIT = process.argv.includes('--only-critical')

// ─── Utilitários ──────────────────────────────────────────────────────────────

function walk(dir, files = []) {
    for (const entry of readdirSync(dir)) {
        if (['node_modules', '.next', '.git', 'dist'].includes(entry)) continue
        if (entry.startsWith('.')) continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full, files)
        else if (full.endsWith('.tsx') || full.endsWith('.ts')) files.push(full)
    }
    return files
}

function getContext(lines, lineNum, size = 4) {
    const start = Math.max(0, lineNum - 1 - size)
    const end   = Math.min(lines.length, lineNum + size)
    return lines.slice(start, end)
        .map((l, i) => `  ${String(start + i + 1).padStart(4)} │ ${l}`)
        .join('\n')
}

/**
 * Extrai o corpo do handler async (até ~600 chars após o match do onClick).
 * Usado para classificar se o handler faz chamadas de rede reais.
 */
function extractHandlerBody(source, matchIndex) {
    return source.slice(matchIndex, matchIndex + 600)
}

/**
 * Classifica a severidade com base no corpo do handler:
 *   CRÍTICO  — contém fetch(), /api/, apiAdmin., supabase., .from(
 *   INFO     — apenas alert(), confirm(), window.open(), abrir modal
 *   AVISO    — qualquer outro await
 */
function classifyHandlerBody(body) {
    const hasNetworkCall = /fetch\s*\(|\/api\/|apiAdmin\.|supabase\.|\.from\s*\(|axios\.|\.post\s*\(|\.get\s*\(|\.put\s*\(|\.delete\s*\(/.test(body)
    if (hasNetworkCall) return 'CRÍTICO'

    const hasOnlyUiAwaits = /await\s+(?:alert|confirm|open\w*Modal|set\w+Open|openEdit|openDeload|openCreate)/.test(body)
    const hasWindowOpen = /window\.open\s*\(/.test(body)
    if (hasOnlyUiAwaits || hasWindowOpen) return 'INFO'

    return 'AVISO'
}

/**
 * Extrai o bloco completo de uma tag <button ...>
 * começando em `startIndex` no `source`. Retorna o texto da abertura da tag.
 */
function extractButtonOpenTag(source, startIndex) {
    let depth = 0
    let i = startIndex
    let inStr = null
    while (i < source.length && i < startIndex + 2000) {
        const ch = source[i]
        if (!inStr && (ch === '"' || ch === "'" || ch === '`')) { inStr = ch }
        else if (inStr && ch === inStr && source[i - 1] !== '\\') { inStr = null }
        else if (!inStr && ch === '{') depth++
        else if (!inStr && ch === '}') depth--
        else if (!inStr && ch === '>' && depth === 0) {
            return source.slice(startIndex, i + 1)
        }
        i++
    }
    return source.slice(startIndex, Math.min(startIndex + 500, i))
}

// ─── Análise ──────────────────────────────────────────────────────────────────

const allFiles = walk(ROOT)
const findings = []

for (const filePath of allFiles) {
    if (/\.(test|spec)\.(tsx?|jsx?)$/.test(filePath)) continue

    const source  = readFileSync(filePath, 'utf8')
    const relPath = relative(process.cwd(), filePath)
    const lines   = source.split('\n')

    // ── Case 1: onClick com async inline ────────────────────────────────────
    // Detecta: onClick={async () => { ... }}  ou  onClick={async (e) => { ... }}
    const asyncOnClickRe = /onClick=\{async\s*(?:\([^)]*\)|[^\s=>{]+)\s*=>/g
    let m
    while ((m = asyncOnClickRe.exec(source)) !== null) {
        const lineNum   = source.slice(0, m.index).split('\n').length
        const tagStart  = source.lastIndexOf('<button', m.index)
        if (tagStart === -1) continue

        const openTag   = extractButtonOpenTag(source, tagStart)

        // Verifica se o botão tem disabled=
        const hasDisabled = /disabled=/.test(openTag)
        if (hasDisabled) continue

        // Ignora botões apenas de fechar/voltar (baixo risco de duplo clique)
        const lowerTag = openTag.toLowerCase()
        if (/fechar|voltar|cancelar|close|cancel/.test(lowerTag)) continue

        // Classifica por conteúdo do handler: só reporta CRÍTICO se há chamada de rede real
        const handlerBody = extractHandlerBody(source, m.index)
        const level = classifyHandlerBody(handlerBody)
        if (ONLY_CRIT && level !== 'CRÍTICO') continue

        const labels = {
            'CRÍTICO': 'onClick={async} sem disabled — duplo clique dispara requisição duplicada',
            'AVISO':   'onClick={async} sem disabled — verificar se precisa de estado de loading',
            'INFO':    'onClick={async} sem disabled — handler abre UI apenas (baixo risco)',
        }
        findings.push({
            level,
            id: 'async-inline-no-disabled',
            label: labels[level],
            file: relPath, line: lineNum,
            context: getContext(lines, lineNum),
        })
    }

    // ── Case 2: onClick com handler nomeado que é async ──────────────────────
    if (!ONLY_CRIT) {
        // Coleta nomes de handlers async definidos no arquivo
        const asyncFnRe = /(?:const|function)\s+(\w+)\s*=?\s*(?:async\s+(?:function\s*)?\(|useCallback\s*\(\s*async\s)/g
        const asyncHandlers = new Set()
        while ((m = asyncFnRe.exec(source)) !== null) {
            if (m[1]) asyncHandlers.add(m[1])
        }
        // Também detecta handlers do tipo: handleXxx que contêm await internamente
        const implicitAsyncRe = /(?:const|let)\s+(handle\w+)\s*=\s*useCallback\s*\(\s*async/g
        while ((m = implicitAsyncRe.exec(source)) !== null) {
            if (m[1]) asyncHandlers.add(m[1])
        }

        if (asyncHandlers.size > 0) {
            // Para cada handler async, busca usos em <button onClick={handler}>
            for (const handlerName of asyncHandlers) {
                const usageRe = new RegExp(`onClick=\\{${handlerName}\\}`, 'g')
                while ((m = usageRe.exec(source)) !== null) {
                    const lineNum  = source.slice(0, m.index).split('\n').length
                    const tagStart = source.lastIndexOf('<button', m.index)
                    if (tagStart === -1) continue

                    const openTag    = extractButtonOpenTag(source, tagStart)
                    const hasDisabled = /disabled=/.test(openTag)
                    if (hasDisabled) continue

                    const lowerTag = openTag.toLowerCase()
                    if (/fechar|voltar|cancelar|close|cancel/.test(lowerTag)) continue

                    findings.push({
                        level: 'AVISO',
                        id: 'async-handler-no-disabled',
                        label: `onClick={${handlerName}} (async) sem disabled — verificar se precisa de estado de loading`,
                        file: relPath, line: lineNum,
                        context: getContext(lines, lineNum),
                    })
                }
            }
        }
    }
}

// ─── Relatório ────────────────────────────────────────────────────────────────

const COLORS = {
    'CRÍTICO': '\x1b[31m', 'AVISO': '\x1b[33m', 'INFO': '\x1b[36m',
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
}

const byLevel = findings.reduce((a, f) => ({ ...a, [f.level]: (a[f.level] || 0) + 1 }), {})

console.log('\n' + '─'.repeat(70))
console.log(`${COLORS.bold}IronTracks — Scan de Loading State (async buttons)${COLORS.reset}`)
console.log('─'.repeat(70))
console.log(`Arquivos analisados : ${allFiles.length}`)
console.log(`Ocorrências         : ${findings.length} total`)
for (const [l, c] of Object.entries(byLevel))
    console.log(`  ${COLORS[l]}${l}${COLORS.reset} : ${c}`)
console.log('─'.repeat(70))

// Agrupa por arquivo para melhor leitura
const byFile = {}
for (const f of findings) {
    if (!byFile[f.file]) byFile[f.file] = []
    byFile[f.file].push(f)
}

if (findings.length === 0) {
    console.log('\n✅ Todos os botões async têm disabled/loading state!\n')
} else {
    for (const [file, items] of Object.entries(byFile)) {
        console.log(`\n${COLORS.dim}${file}${COLORS.reset}`)
        for (const item of items) {
            console.log(`  ${COLORS[item.level]}[${item.level}]${COLORS.reset} linha ${item.line}: ${item.label}`)
            console.log(item.context)
        }
    }
}

console.log('\n' + '─'.repeat(70))
const crit = byLevel['CRÍTICO'] || 0
if (crit > 0) {
    console.log(`\n❌ ${crit} botão(ões) async sem disabled. Adicione disabled={loading} para evitar duplos cliques.\n`)
    process.exit(1)
} else {
    console.log('\n✅ Nenhum botão async crítico sem loading state.\n')
}
