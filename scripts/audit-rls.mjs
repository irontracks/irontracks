#!/usr/bin/env node
/**
 * RLS Audit — IronTracks
 *
 * Inspeciona supabase/migrations/*.sql e classifica cada tabela conforme:
 *   [OK]    tem CREATE TABLE + ENABLE ROW LEVEL SECURITY + ao menos 1 policy
 *   [WARN]  tem policies mas nenhum ENABLE ROW LEVEL SECURITY no diretório de migrations
 *           (provavelmente habilitado no schema inicial ou via dashboard — verificar manualmente)
 *   [FAIL]  tabela criada sem RLS e sem policies
 *
 * Uso:
 *   node scripts/audit-rls.mjs
 *   node scripts/audit-rls.mjs --only-warn   (mostra só WARN/FAIL)
 *   node scripts/audit-rls.mjs --json        (saída JSON p/ pipelines)
 */

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = fileURLToPath(new URL('../supabase/migrations', import.meta.url))
const ONLY_WARN = process.argv.includes('--only-warn')
const AS_JSON = process.argv.includes('--json')

// ─── Coleta ───────────────────────────────────────────────────────────────────

const files = readdirSync(ROOT)
    .filter((f) => f.endsWith('.sql'))
    .sort()

const tables = new Map()

const ensure = (name) => {
    if (!tables.has(name)) {
        tables.set(name, {
            name,
            createdIn: [],
            rlsEnabledIn: [],
            policiesIn: [],
            policyNames: new Set(),
        })
    }
    return tables.get(name)
}

const stripQuotes = (s) => s.replace(/^["`]|["`]$/g, '')

for (const file of files) {
    const sql = readFileSync(join(ROOT, file), 'utf8')

    // CREATE TABLE [IF NOT EXISTS] [schema.]name
    for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?["`]?([a-zA-Z0-9_]+)["`]?/gi)) {
        ensure(stripQuotes(m[1])).createdIn.push(file)
    }

    // ALTER TABLE [schema.]name ENABLE ROW LEVEL SECURITY
    for (const m of sql.matchAll(/ALTER\s+TABLE\s+(?:public\.)?["`]?([a-zA-Z0-9_]+)["`]?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi)) {
        ensure(stripQuotes(m[1])).rlsEnabledIn.push(file)
    }

    // CREATE POLICY <name> ON [schema.]<table>  (name pode ser quoted com espaços)
    for (const m of sql.matchAll(/CREATE\s+POLICY\s+(?:"([^"]+)"|([^\s]+))\s+ON\s+(?:public\.)?["`]?([a-zA-Z0-9_]+)["`]?/gi)) {
        const policy = m[1] ?? m[2]
        const tbl = stripQuotes(m[3])
        const t = ensure(tbl)
        t.policiesIn.push({ file, policy })
        t.policyNames.add(policy)
    }
}

// ─── Classificação ───────────────────────────────────────────────────────────

const sorted = [...tables.values()].sort((a, b) => a.name.localeCompare(b.name))

const classify = (t) => {
    const hasRls = t.rlsEnabledIn.length > 0
    const hasPolicies = t.policiesIn.length > 0
    const wasCreated = t.createdIn.length > 0
    if (hasRls && hasPolicies) return 'OK'
    if (hasPolicies && !hasRls) return 'WARN'
    if (wasCreated && !hasRls && !hasPolicies) return 'FAIL'
    return 'INFO'
}

const results = sorted.map((t) => ({ ...t, status: classify(t), policyNames: [...t.policyNames] }))

const counts = results.reduce(
    (acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc),
    { OK: 0, WARN: 0, FAIL: 0, INFO: 0 },
)

// ─── Saída ───────────────────────────────────────────────────────────────────

if (AS_JSON) {
    process.stdout.write(JSON.stringify({ counts, tables: results }, null, 2) + '\n')
    process.exit(counts.FAIL > 0 ? 1 : 0)
}

const banner = (txt, color) => `\x1b[${color}m${txt}\x1b[0m`
const STATUS_COLOR = { OK: 32, WARN: 33, FAIL: 31, INFO: 36 }

console.log('\n🛡️  RLS Audit — supabase/migrations\n')

for (const r of results) {
    if (ONLY_WARN && r.status === 'OK') continue
    const tag = banner(`[${r.status}]`.padEnd(7), STATUS_COLOR[r.status])
    console.log(`${tag} ${r.name}`)
    if (r.status === 'WARN') {
        console.log(`         policies: ${r.policyNames.length} | sem ENABLE RLS no dir de migrations`)
        console.log('         → verificar no Supabase Dashboard se RLS está ON')
    } else if (r.status === 'FAIL') {
        console.log(`         CREATE TABLE em ${r.createdIn[0]} sem RLS e sem policies`)
    } else if (r.status === 'INFO') {
        console.log(`         ${r.rlsEnabledIn.length ? 'RLS habilitado' : 'sem CREATE detectado'} | sem policies`)
    }
}

console.log('\n─── Sumário ──────────────────────────────')
console.log(`  ${banner('OK',   32)}    ${counts.OK}     tabelas com RLS + policies`)
console.log(`  ${banner('WARN', 33)}  ${counts.WARN}     policies sem ENABLE RLS no dir de migrations`)
console.log(`  ${banner('FAIL', 31)}  ${counts.FAIL}     tabelas criadas sem RLS e sem policies`)
console.log(`  ${banner('INFO', 36)}  ${counts.INFO}     outras (RLS sem policies / referências externas)`)
console.log('')

if (counts.FAIL > 0) process.exit(1)
