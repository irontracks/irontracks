import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { isCronAuthorized } from '@/utils/cron/auth'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Retenção da trilha de alterações de série (`sets_audit`) — ago/2026.
 *
 * O gatilho de auditoria grava toda alteração em `sets`, mas NADA lê a tabela:
 * medido em 07/08/2026, 5.002 linhas / 3 MB com `idx_scan = 1` desde que
 * existe. É trilha FORENSE — serve para responder "quem mexeu no treino de
 * quem" quando aparece uma suspeita, não para alimentar tela nenhuma.
 *
 * Por isso ela pode ser podada, mas com prazo MAIOR que o da telemetria: uma
 * denúncia de alteração indevida chega semanas depois do fato, e 90 dias
 * (o corte da telemetria) é curto demais para isso. 180 dias cobre a janela
 * real de investigação sem deixar a tabela crescer para sempre.
 *
 * Deliberadamente separada de `telemetry-retention`: lá o invariante é "agrega
 * ANTES de apagar", porque existe um rollup a preservar. Aqui não há agregado
 * — misturar as duas na mesma rota só criaria chance de alguém quebrar aquele
 * invariante ao mexer nesta poda.
 */
export const AUDIT_RETENTION_DAYS = 180
/** Teto por execução: purga incremental, sem lock longo. */
const MAX_DELETE_PER_RUN = 20_000

export async function GET(req: Request) {
  try {
    if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const admin = createAdminClient()
    const cutoffIso = new Date(Date.now() - AUDIT_RETENTION_DAYS * 86_400_000).toISOString()

    const { data: oldRows, error: selErr } = await admin
      .from('sets_audit')
      .select('id')
      .lt('at', cutoffIso)
      .limit(MAX_DELETE_PER_RUN)
    if (selErr) {
      logError('cron:audit-trail-retention', selErr, { stage: 'select' })
      return NextResponse.json({ ok: false, error: 'select_failed', purged: 0 }, { status: 500 })
    }

    const ids = (oldRows || [])
      .map((r) => (r as Record<string, unknown>).id)
      .filter((id) => id !== null && id !== undefined)
    let purged = 0
    if (ids.length) {
      const { error: delErr } = await admin.from('sets_audit').delete().in('id', ids)
      if (delErr) {
        logError('cron:audit-trail-retention', delErr, { stage: 'delete' })
        return NextResponse.json({ ok: false, error: 'delete_failed', purged: 0 }, { status: 500 })
      }
      purged = ids.length
    }

    // Trilha da própria poda: "quanto sumiu e quando" precisa de resposta meses
    // depois — log e Sentry expiram, o banco não. Apagar trilha sem registrar
    // que apagou é o pior dos mundos numa investigação.
    try {
      await admin.from('audit_events').insert({
        actor_role: 'service',
        action: 'cron_audit_trail_retention',
        entity_type: 'cron',
        metadata: { purged, retention_days: AUDIT_RETENTION_DAYS, cutoff: cutoffIso },
      })
    } catch { /* auditoria não pode custar a purga */ }

    return NextResponse.json({ ok: true, purged, retentionDays: AUDIT_RETENTION_DAYS, cutoff: cutoffIso })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
