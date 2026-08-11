/**
 * POST /api/security/csp-report — destino do `report-uri` da CSP.
 *
 * Existe para responder UMA pergunta: dá para ligar `CSP_ENFORCE=true` sem
 * derrubar o app? Enquanto a política roda em `Report-Only` (ver
 * `src/middleware.ts`), o navegador manda para cá tudo que ELE BLOQUEARIA. Cada
 * violação aqui é uma tela quebrada no futuro.
 *
 * ## Por que grava no BANCO, e não só no Sentry
 * O Sentry resolve para quem tem o painel aberto. Não resolve para quem
 * investiga a partir do repo: **o token do Sentry não existe aqui**, então a
 * pista fica ilegível justamente de onde se decide. Já custou caro uma vez (o
 * sumiço da Live Activity em 04/08/2026 — mesma história, mesma solução em
 * `api/diag/live-activity`). `audit_events` é consultável por SQL e não expira:
 *
 * ```sql
 * select metadata->>'directive' as diretiva, metadata->>'blocked' as origem,
 *        count(*), max(created_at)
 * from audit_events where action = 'csp_violation'
 * group by 1, 2 order by 3 desc;
 * ```
 *
 * ## Rota pública que ESCREVE — três freios
 * O navegador posta sem cookie e sem sessão; é assim que o mecanismo funciona,
 * e por isso ela não pode exigir autenticação. Como escrever no banco sem auth
 * é convite a abuso, valem juntos: rate limit por IP, dedupe por par
 * (diretiva, origem) e teto de linhas por instância. O objetivo é descobrir
 * QUAIS diretivas quebram — para isso bastam as primeiras de cada tipo, não o
 * histórico completo.
 */
import { NextResponse } from 'next/server'
import { logWarnRemote, logError } from '@/lib/logger'
// NEEDS ADMIN: `audit_events` é read-only pro cliente; a escrita é do servidor.
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

export const dynamic = 'force-dynamic'

/** Corpo pode vir gordo (a `sample` carrega trecho do script). Não lemos além disso. */
const MAX_BODY_BYTES = 16_000

/**
 * Teto de reports ao Sentry por instância. Um único usuário com uma extensão
 * exótica gera violação a cada navegação; sem freio isso vira fatura e ruído
 * que esconde o sinal real.
 */
const MAX_REPORTS_PER_INSTANCE = 50
let reported = 0

/** Teto de linhas gravadas no banco por instância — muito mais apertado que o do Sentry. */
const MAX_AUDIT_ROWS_PER_INSTANCE = 10
let auditRows = 0

/**
 * Pares (diretiva, origem) já gravados por esta instância. A pergunta é "quais
 * diretivas quebram", não "quantas vezes" — a segunda ocorrência do mesmo par
 * não acrescenta nada e só engorda a tabela.
 */
const seen = new Set<string>()

/** Só o host importa para decidir a política; o resto do URL é ruído e pode conter dado do usuário. */
const hostOf = (raw: unknown): string => {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  // Valores especiais do próprio CSP ('inline', 'eval', 'data') não são URL.
  if (!s.includes('://')) return s.slice(0, 60)
  try {
    return new URL(s).host || ''
  } catch {
    return s.slice(0, 60)
  }
}

export async function POST(req: Request) {
  try {
    if (reported >= MAX_REPORTS_PER_INSTANCE) return new NextResponse(null, { status: 204 })

    // Rota pública que escreve: o IP é o único identificador disponível.
    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`csp-report:${ip}`, 30, 60_000)
    if (!rl.allowed) return new NextResponse(null, { status: 204 })

    const raw = (await req.text()).slice(0, MAX_BODY_BYTES)
    if (!raw) return new NextResponse(null, { status: 204 })

    let body: unknown = null
    try {
      body = JSON.parse(raw)
    } catch {
      return new NextResponse(null, { status: 204 })
    }

    // Dois formatos convivem: `{"csp-report": {...}}` (report-uri, que é o que
    // o WebKit manda) e o array do Reporting API. Aceita os dois.
    const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const nested = record['csp-report']
    const report = (nested && typeof nested === 'object' ? nested : record) as Record<string, unknown>

    const directive = String(report['effective-directive'] ?? report['violated-directive'] ?? '')
      .split(' ')[0]
      .slice(0, 40)
    const blocked = hostOf(report['blocked-uri'])
    const documentHost = hostOf(report['document-uri'])

    if (!directive && !blocked) return new NextResponse(null, { status: 204 })

    const key = `${directive}|${blocked}`
    const isNew = !seen.has(key)
    if (isNew) seen.add(key)

    reported += 1
    // Mensagem montada para AGRUPAR no Sentry: diretiva + host. Incluir o URL
    // inteiro criaria um grupo por página e o painel viraria lista infinita.
    logWarnRemote('security.csp.violation', `${directive || 'desconhecida'} ← ${blocked || 'inline'}`, {
      directive,
      blocked,
      documentHost,
    })

    if (isNew && auditRows < MAX_AUDIT_ROWS_PER_INSTANCE) {
      auditRows += 1
      try {
        const admin = createAdminClient()
        const { error } = await admin.from('audit_events').insert({
          action: 'csp_violation',
          entity_type: 'security',
          metadata: { directive, blocked, documentHost },
        })
        if (error) logError('security:csp-report:insert', error)
      } catch (e: unknown) {
        // Diagnóstico nunca derruba nada — e menos ainda uma rota que o
        // navegador chama sozinho, em segundo plano.
        logError('security:csp-report:insert', e)
      }
    }

    return new NextResponse(null, { status: 204 })
  } catch {
    // Nunca falhar de volta para o navegador: o relatório é diagnóstico, e um
    // 500 aqui não ajuda ninguém.
    return new NextResponse(null, { status: 204 })
  }
}
