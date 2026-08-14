/**
 * Guard da auditoria 2026-08-13 (SEC-05): mensagem de EXCEÇÃO não sai em
 * resposta de rota. 112 rotas devolviam `getErrorMessage(e)` cru — nome de
 * tabela, erro de SQL e detalhe de provedor serviam de reconhecimento para
 * atacante. O caminho certo é `respondInternalError` (log + Sentry com
 * requestId; cliente recebe `internal_error` + o mesmo requestId).
 *
 * O guard varre TODAS as rotas (a classe, não a instância): qualquer chamada
 * de resposta (NextResponse.json / new Response / new NextResponse /
 * jsonError) com `getErrorMessage` na janela de argumentos reprova — em
 * QUALQUER status, porque o vazamento do revenuecat/sync era num 400.
 *
 * Allowlist: rotas onde o LEITOR da mensagem é admin/cron (gate conferido a
 * mão em 14/08/2026) ou onde o detalhe só sai em development. Ela só encolhe.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../../..')
const API_DIR = path.join(ROOT, 'src/app/api')

/** Leitor da resposta é admin/cron (requireRoleOrBearer/requireRole/CRON_SECRET) ou detalhe é dev-only. */
const ALLOWLIST = new Set([
  'src/app/api/admin/vip/grant-trial/route.ts', // resultados por item de concessão em lote — admin bearer
  'src/app/api/admin/delete-auth-user/route.ts', // detalhe só quando NODE_ENV=development; prod = 'internal'
  'src/app/api/admin/exercise-videos/auto-pipeline/route.ts', // relatório por item do pipeline — admin bearer
  'src/app/api/admin/billing-diagnostic/route.ts', // diagnóstico de cobrança — CRON_SECRET/admin
  'src/app/api/admin/exercise-videos/backfill/route.ts', // relatório do backfill — admin bearer
  'src/app/api/admin/exercise-videos/suggest/route.ts', // sugestões por item — admin bearer
  'src/app/api/supabase/status/route.ts', // status de config — requireRole(['admin'])
])

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:'"])\/\/[^\n]*/g, '$1')
}

function walkRouteFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkRouteFiles(full))
    else if (entry.isFile() && entry.name === 'route.ts') out.push(full)
  }
  return out
}

const RESPONSE_CALL = /NextResponse\.json\s*\(|new\s+Response\s*\(|new\s+NextResponse\s*\(|jsonError\s*\(/g

describe('exceção não vaza em resposta de rota (SEC-05, auditoria 2026-08-13)', () => {
  it('nenhuma chamada de resposta carrega getErrorMessage na janela de argumentos', () => {
    const offenders: string[] = []
    for (const file of walkRouteFiles(API_DIR)) {
      const rel = path.relative(ROOT, file)
      if (ALLOWLIST.has(rel)) continue
      const source = stripComments(fs.readFileSync(file, 'utf8'))
      for (const call of source.matchAll(RESPONSE_CALL)) {
        const windowText = source.slice(call.index!, call.index! + 300)
        if (/getErrorMessage\s*\(/.test(windowText)) {
          offenders.push(`${rel} (índice ${call.index})`)
          break
        }
      }
    }
    expect(
      offenders,
      `Rota devolvendo mensagem de exceção ao cliente — use respondInternalError: ${offenders.join(', ')}`
    ).toEqual([])
  })

  it('a allowlist só contém arquivos que existem (entrada morta sai daqui)', () => {
    for (const rel of ALLOWLIST) {
      expect(fs.existsSync(path.join(ROOT, rel)), `entrada morta na allowlist: ${rel}`).toBe(true)
    }
  })

  it('as entradas da allowlist continuam gated (admin/cron/dev-only)', () => {
    for (const rel of ALLOWLIST) {
      const source = fs.readFileSync(path.join(ROOT, rel), 'utf8')
      const gated =
        /requireRoleOrBearer\s*\(\s*\w+,\s*\[\s*'admin'\s*\]\s*\)/.test(source) ||
        /requireRole\s*\(\s*\[\s*'admin'\s*\]\s*\)/.test(source) ||
        /CRON_SECRET/.test(source) ||
        /NODE_ENV\s*===\s*'development'/.test(source)
      expect(gated, `${rel} perdeu o gate que justificava a allowlist — remova daqui ou re-gate a rota`).toBe(true)
    }
  })
})
