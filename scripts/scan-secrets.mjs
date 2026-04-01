#!/usr/bin/env node
/**
 * Secrets Scanner — IronTracks
 *
 * Detecta segredos hardcoded no código fonte:
 *   [CRÍTICO] JWT tokens hardcoded
 *   [CRÍTICO] Chaves Stripe (sk_live_, sk_test_)
 *   [CRÍTICO] Supabase service role key hardcoded
 *   [CRÍTICO] Variáveis de ambiente secretas usadas em arquivos 'use client'
 *   [AVISO]   Senhas literais atribuídas a variáveis
 *   [AVISO]   process.env sem NEXT_PUBLIC_ em componente cliente
 *
 * Uso:
 *   node scripts/scan-secrets.mjs
 *   node scripts/scan-secrets.mjs --only-critical
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'

const ROOT      = fileURLToPath(new URL('../src', import.meta.url))
const ONLY_CRIT = process.argv.includes('--only-critical')

// ─── Padrões ──────────────────────────────────────────────────────────────────

const PATTERNS = [
    {
        level: 'CRÍTICO',
        id: 'jwt-hardcoded',
        label: 'JWT token hardcoded — nunca comite tokens de acesso no código',
        // JWT: três segmentos base64url separados por ponto, começa com eyJ
        regex: /['"`]eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}['"`]/g,
        context: 3,
    },
    {
        level: 'CRÍTICO',
        id: 'stripe-key',
        label: 'Chave Stripe hardcoded (sk_live_ / sk_test_)',
        regex: /sk_(?:live|test)_[A-Za-z0-9]{20,}/g,
        context: 3,
    },
    {
        level: 'CRÍTICO',
        id: 'supabase-service-role',
        label: 'Supabase service_role key hardcoded — acesso admin irrestrito',
        regex: /service[_-]?role['":\s,]+eyJ[A-Za-z0-9_.-]{20,}/gi,
        context: 4,
    },
    {
        level: 'CRÍTICO',
        id: 'generic-secret-assignment',
        label: 'Possível API key/secret hardcoded — string aleatória longa em variável suspeita',
        // Requer: nome suspeito (api_key, token, secret...) + string puramente alfanumérica
        // sem pontos, hífens ou padrões de storage key (irontracks.algo.v1)
        // Exclui: localStorage keys ('irontracks.x.v1'), slugs, URLs
        regex: /(?:const|let|var)\s+\w*(?:apikey|api_key|authtoken|auth_token|secretkey|secret_key|accesskey|access_key)\w*\s*=\s*['"`][A-Za-z0-9+/=]{32,}['"`]/gi,
        context: 3,
    },
    {
        level: 'AVISO',
        id: 'password-literal',
        label: 'Senha literal atribuída a variável (pode ser credencial de teste)',
        // Exclui casos comuns: className, placeholder, label
        regex: /(?:password|senha|passwd)\s*[:=]\s*['"][^'"]{6,}['"]/gi,
        context: 3,
        // Filtra false positives: linhas com className, placeholder, type, label, aria
        filterLine: /className|placeholder|type=|label|aria-|\/\//,
    },
    {
        level: 'AVISO',
        id: 'env-in-client',
        label: 'process.env sem NEXT_PUBLIC_ em arquivo "use client" — valor será undefined no browser',
        // Só dispara quando o arquivo tem 'use client' E usa env não-pública
        regex: /process\.env\.(?!NEXT_PUBLIC_)[A-Z_]{3,}/g,
        context: 3,
        requiresFileFlag: 'use-client',
    },
]

// ─── Utilitários ──────────────────────────────────────────────────────────────

function walk(dir, files = []) {
    for (const entry of readdirSync(dir)) {
        if (['node_modules', '.next', '.git', 'dist', '__tests__'].includes(entry)) continue
        if (entry.startsWith('.')) continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            walk(full, files)
        } else if (/\.(tsx?|jsx?|mjs)$/.test(full)) {
            files.push(full)
        }
    }
    return files
}

function getContext(lines, lineNum, ctxSize) {
    const start = Math.max(0, lineNum - 1 - ctxSize)
    const end   = Math.min(lines.length, lineNum + ctxSize)
    return lines.slice(start, end)
        .map((l, i) => `  ${String(start + i + 1).padStart(4)} │ ${l}`)
        .join('\n')
}

// ─── Análise ──────────────────────────────────────────────────────────────────

const allFiles = walk(ROOT)
const findings = []

for (const filePath of allFiles) {
    // Exclui arquivos de teste e scripts
    if (/\.(test|spec)\.(tsx?|jsx?)$/.test(filePath)) continue
    if (filePath.includes('/scripts/')) continue

    const source = readFileSync(filePath, 'utf8')
    const relPath = relative(process.cwd(), filePath)
    const lines   = source.split('\n')
    const isClient = source.includes("'use client'") || source.includes('"use client"')

    for (const pattern of PATTERNS) {
        if (ONLY_CRIT && pattern.level !== 'CRÍTICO') continue
        if (pattern.requiresFileFlag === 'use-client' && !isClient) continue

        const re = new RegExp(pattern.regex.source, pattern.regex.flags)
        let match
        while ((match = re.exec(source)) !== null) {
            const lineNum = source.slice(0, match.index).split('\n').length
            const lineText = lines[lineNum - 1] || ''

            // Pula linhas comentadas
            if (/^\s*\/\//.test(lineText) || /^\s*\*/.test(lineText)) continue

            // Aplica filtro de false-positive se definido
            if (pattern.filterLine && pattern.filterLine.test(lineText)) continue

            findings.push({
                level:   pattern.level,
                id:      pattern.id,
                label:   pattern.label,
                file:    relPath,
                line:    lineNum,
                match:   match[0].slice(0, 80),
                context: getContext(lines, lineNum, pattern.context),
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
console.log(`${COLORS.bold}IronTracks — Scan de Segredos${COLORS.reset}`)
console.log('─'.repeat(70))
console.log(`Arquivos analisados : ${allFiles.length}`)
console.log(`Ocorrências         : ${findings.length} total`)
for (const [l, c] of Object.entries(byLevel))
    console.log(`  ${COLORS[l]}${l}${COLORS.reset} : ${c}`)
console.log('─'.repeat(70))

if (findings.length === 0) {
    console.log('\n✅ Nenhum segredo encontrado no código!\n')
} else {
    for (const f of findings) {
        console.log(`\n${COLORS[f.level]}[${f.level}]${COLORS.reset} ${f.label}`)
        console.log(`${COLORS.dim}${f.file}:${f.line}${COLORS.reset}`)
        console.log(f.context)
    }
}

console.log('\n' + '─'.repeat(70))
const crit = byLevel['CRÍTICO'] || 0
if (crit > 0) {
    console.log(`\n❌ ${crit} segredo(s) CRÍTICO(s) encontrado(s). Remova antes do commit.\n`)
    process.exit(1)
} else {
    console.log('\n✅ Nenhum segredo crítico. Verifique os avisos acima.\n')
}
