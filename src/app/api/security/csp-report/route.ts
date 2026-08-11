/**
 * POST /api/security/csp-report — destino do `report-uri` da CSP.
 *
 * Existe para responder UMA pergunta: dá para ligar `CSP_ENFORCE=true` sem
 * derrubar o app? Enquanto a política roda em `Report-Only` (ver
 * `src/middleware.ts`), o navegador manda para cá tudo que ELE BLOQUEARIA. Cada
 * violação aqui é uma tela quebrada no futuro.
 *
 * Aberta por definição: o navegador posta sem cookie e sem sessão, é assim que
 * o mecanismo funciona. Por isso ela não confia em nada do corpo — só extrai
 * três campos, corta o tamanho e agrupa.
 */
import { NextResponse } from 'next/server'
import { logWarnRemote } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/** Corpo pode vir gordo (a `sample` carrega trecho do script). Não lemos além disso. */
const MAX_BODY_BYTES = 16_000

/**
 * Teto por instância. Um único usuário com uma extensão exótica gera violação a
 * cada navegação; sem freio isso vira fatura do Sentry e ruído que esconde o
 * sinal real. O objetivo é descobrir QUAIS diretivas quebram, não contar
 * ocorrências — para isso bastam as primeiras.
 */
const MAX_REPORTS_PER_INSTANCE = 50
let reported = 0

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

    reported += 1
    // Mensagem montada para AGRUPAR no Sentry: diretiva + host. Incluir o URL
    // inteiro criaria um grupo por página e o painel viraria lista infinita.
    logWarnRemote('security.csp.violation', `${directive || 'desconhecida'} ← ${blocked || 'inline'}`, {
      directive,
      blocked,
      documentHost,
    })

    return new NextResponse(null, { status: 204 })
  } catch {
    // Nunca falhar de volta para o navegador: o relatório é diagnóstico, e um
    // 500 aqui não ajuda ninguém.
    return new NextResponse(null, { status: 204 })
  }
}
