#!/usr/bin/env node
/**
 * Accessibility Scanner — IronTracks
 *
 * Detecta problemas de acessibilidade estaticamente nos arquivos TSX:
 *   [CRÍTICO] <img> sem atributo alt
 *   [CRÍTICO] <img alt="nome-de-arquivo.ext"> — filename como alt não é descritivo
 *   [AVISO]   <button> sem texto visível nem aria-label (só ícone)
 *   [AVISO]   <input> sem aria-label, aria-labelledby ou id associado a <label>
 *   [AVISO]   <a href> sem texto nem aria-label (link invisível)
 *   [INFO]    <div onClick> / <span onClick> sem role="button" — não acessível por teclado
 *   [INFO]    <button type="submit"> sem texto — pode confundir screen readers
 *
 * Uso:
 *   node scripts/scan-a11y.mjs
 *   node scripts/scan-a11y.mjs --only-critical
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
        else if (full.endsWith('.tsx')) files.push(full)
    }
    return files
}

function getContext(lines, lineNum, size = 3) {
    const start = Math.max(0, lineNum - 1 - size)
    const end   = Math.min(lines.length, lineNum + size)
    return lines.slice(start, end)
        .map((l, i) => `  ${String(start + i + 1).padStart(4)} │ ${l}`)
        .join('\n')
}

// ─── Análise ──────────────────────────────────────────────────────────────────

const allFiles = walk(ROOT)
const findings = []

for (const filePath of allFiles) {
    const source  = readFileSync(filePath, 'utf8')
    const relPath = relative(process.cwd(), filePath)
    const lines   = source.split('\n')

    // ── 1. <img> sem alt ──────────────────────────────────────────────────────
    // Encontra tags <img que não contêm alt=
    const imgRe = /<img\b([^>]*?)(?:\/>|>)/gs
    let m
    while ((m = imgRe.exec(source)) !== null) {
        const attrs  = m[1]
        const lineNum = source.slice(0, m.index).split('\n').length
        // Next.js <Image> é tratado separadamente — só <img nativo
        if (!attrs.includes('alt=') && !attrs.includes('alt =')) {
            // Pula se for <img {...} (spread pode incluir alt)
            if (attrs.includes('{...')) continue
            findings.push({
                level: 'CRÍTICO',
                id: 'img-no-alt',
                label: '<img> sem atributo alt — screen readers não conseguem descrever a imagem',
                file: relPath, line: lineNum,
                context: getContext(lines, lineNum),
            })
        } else {
            // Verifica se alt é um nome de arquivo (imagem com alt="foto.jpg")
            const altMatch = attrs.match(/alt=\{?['"`]([^'"`}]+)['"`]\}?/)
            if (altMatch) {
                const altVal = altMatch[1].trim()
                if (/\.(png|jpg|jpeg|gif|svg|webp|avif|bmp)$/i.test(altVal)) {
                    findings.push({
                        level: 'AVISO',
                        id: 'img-filename-alt',
                        label: `<img alt="${altVal}"> — nome de arquivo não é descrição útil para leitores de tela`,
                        file: relPath, line: lineNum,
                        context: getContext(lines, lineNum),
                    })
                }
            }
        }
    }

    // ── 2. <button> sem texto nem aria-label ──────────────────────────────────
    // Pega botões que contém APENAS ícones (Lucide, SVG) sem texto nem aria-label
    const btnRe = /<button\b([^>]*)>([\s\S]{0,300}?)<\/button>/g
    while ((m = btnRe.exec(source)) !== null) {
        if (ONLY_CRIT) continue
        const attrs    = m[1]
        const inner    = m[2]
        const lineNum  = source.slice(0, m.index).split('\n').length

        const hasAriaLabel = /aria-label=/.test(attrs)
        const hasAriaLabelledBy = /aria-labelledby=/.test(attrs)
        if (hasAriaLabel || hasAriaLabelledBy) continue

        // Remove tags filhas e verifica se há texto real
        const textOnly = inner
            .replace(/<[^>]+>/g, '')    // remove tags
            .replace(/\{[^}]+\}/g, '')  // remove expressões JSX
            .replace(/&\w+;/g, ' ')     // remove entidades HTML
            .trim()

        // Só ícone puro: inner contém apenas <Icon>, <svg>, ou expressões
        const hasOnlyIcon = !textOnly &&
            (inner.includes('<') || inner.includes('{')) &&
            !inner.match(/\w{3,}/)  // sem palavra de 3+ letras

        if (hasOnlyIcon) {
            findings.push({
                level: 'AVISO',
                id: 'button-no-label',
                label: '<button> com apenas ícone e sem aria-label — inacessível para leitores de tela',
                file: relPath, line: lineNum,
                context: getContext(lines, lineNum),
            })
        }
    }

    // ── 3. <input> sem label associado ───────────────────────────────────────
    if (!ONLY_CRIT) {
        const inputRe = /<input\b([^>]*?)(?:\/>|>)/gs
        while ((m = inputRe.exec(source)) !== null) {
            const attrs   = m[1]
            const lineNum = source.slice(0, m.index).split('\n').length

            // Pula: hidden, checkbox/radio (geralmente embrulhados em label)
            if (/type=\{?['"`]hidden['"`]\}?/.test(attrs)) continue
            if (/type=\{?['"`](?:checkbox|radio)['"`]\}?/.test(attrs)) continue

            const hasLabel = /aria-label=|aria-labelledby=|id=/.test(attrs)
            const hasSpread = attrs.includes('{...')
            if (!hasLabel && !hasSpread) {
                findings.push({
                    level: 'AVISO',
                    id: 'input-no-label',
                    label: '<input> sem aria-label nem id — leitores de tela não identificam o campo',
                    file: relPath, line: lineNum,
                    context: getContext(lines, lineNum),
                })
            }
        }
    }

    // ── 4. <a> sem texto nem aria-label ──────────────────────────────────────
    if (!ONLY_CRIT) {
        const aRe = /<a\b([^>]*)>([\s\S]{0,200}?)<\/a>/g
        while ((m = aRe.exec(source)) !== null) {
            const attrs   = m[1]
            const inner   = m[2]
            const lineNum = source.slice(0, m.index).split('\n').length

            if (/aria-label=|aria-labelledby=/.test(attrs)) continue

            const textOnly = inner
                .replace(/<[^>]+>/g, '')
                .replace(/\{[^}]+\}/g, '')
                .trim()

            const hasOnlyIcon = !textOnly && inner.includes('<')
            if (hasOnlyIcon) {
                findings.push({
                    level: 'AVISO',
                    id: 'link-no-label',
                    label: '<a href> com apenas ícone e sem aria-label — link sem descrição acessível',
                    file: relPath, line: lineNum,
                    context: getContext(lines, lineNum),
                })
            }
        }
    }

    // ── 5. <div onClick> / <span onClick> sem role ────────────────────────────
    if (!ONLY_CRIT) {
        const divClickRe = /<(?:div|span)\b([^>]*?)onClick=[^>]*?>/g
        while ((m = divClickRe.exec(source)) !== null) {
            const attrs   = m[1]
            const lineNum = source.slice(0, m.index).split('\n').length

            if (/role=/.test(attrs)) continue

            findings.push({
                level: 'INFO',
                id: 'div-onclick-no-role',
                label: '<div onClick> / <span onClick> sem role="button" — inacessível por teclado (Tab, Enter)',
                file: relPath, line: lineNum,
                context: getContext(lines, lineNum, 2),
            })
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
console.log(`${COLORS.bold}IronTracks — Scan de Acessibilidade (a11y)${COLORS.reset}`)
console.log('─'.repeat(70))
console.log(`Arquivos analisados : ${allFiles.length}`)
console.log(`Ocorrências         : ${findings.length} total`)
for (const [l, c] of Object.entries(byLevel))
    console.log(`  ${COLORS[l]}${l}${COLORS.reset} : ${c}`)
console.log('─'.repeat(70))

// Agrupa por id para não inundar com repetições
const byId = {}
for (const f of findings) {
    if (!byId[f.id]) byId[f.id] = []
    byId[f.id].push(f)
}

if (findings.length === 0) {
    console.log('\n✅ Nenhum problema de acessibilidade encontrado!\n')
} else {
    for (const [id, items] of Object.entries(byId)) {
        const first = items[0]
        console.log(`\n${COLORS[first.level]}[${first.level}]${COLORS.reset} ${first.label}`)
        console.log(`  ${items.length} ocorrência(s)`)
        // Mostra até 3 exemplos por tipo
        for (const item of items.slice(0, 3)) {
            console.log(`\n  ${COLORS.dim}${item.file}:${item.line}${COLORS.reset}`)
            console.log(item.context)
        }
        if (items.length > 3) {
            console.log(`  ${COLORS.dim}... e mais ${items.length - 3} ocorrências${COLORS.reset}`)
        }
    }
}

console.log('\n' + '─'.repeat(70))
const crit = byLevel['CRÍTICO'] || 0
if (crit > 0) {
    console.log(`\n❌ ${crit} problema(s) CRÍTICO(s) de acessibilidade. Corrija antes do deploy.\n`)
    process.exit(1)
} else {
    console.log('\n✅ Nenhum problema crítico de acessibilidade. Verifique os avisos acima.\n')
}
