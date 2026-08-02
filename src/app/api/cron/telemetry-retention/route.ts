import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { isCronAuthorized } from '@/utils/cron/auth'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Retenção da telemetria bruta (ago/2026).
 *
 * `user_activity_events` era METADE do banco (59 MB de 119 MB) e crescia sem
 * teto. O detalhe linha-a-linha só interessa recente; a tendência mensal
 * interessa para sempre — e mora em `user_activity_monthly`.
 *
 * ORDEM É O INVARIANTE DESTA ROTA: agrega PRIMEIRO, apaga DEPOIS. Se o rollup
 * falhar, a purga não roda — dado bruto apagado sem agregado é perda
 * permanente de histórico. Guard: telemetryRetention.test.ts.
 */
export const RETENTION_DAYS = 90
/** Teto por execução: purga incremental, sem lock longo na tabela quente. */
const MAX_DELETE_PER_RUN = 20_000

export async function GET(req: Request) {
  try {
    if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const admin = createAdminClient()
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000)
    const cutoffIso = cutoff.toISOString()

    // ── 1. Agregar ANTES de apagar ────────────────────────────────────────
    // Janela larga de propósito: recalcula desde bem antes do corte até hoje,
    // então nenhum mês fica com contagem parcial por causa de uma execução
    // que rodou no meio do mês. `on conflict do update` torna idempotente.
    const from = new Date(cutoff.getTime() - 400 * 86_400_000).toISOString().slice(0, 10)
    const to = new Date().toISOString().slice(0, 10)
    const { error: rollupErr } = await admin.rpc('rollup_user_activity_monthly', {
      p_from: from,
      p_to: to,
    })
    if (rollupErr) {
      // Falhou o rollup → NÃO apaga nada. Perder o bruto sem ter o agregado
      // seria perda permanente de histórico.
      logError('cron:telemetry-retention', rollupErr, { stage: 'rollup' })
      return NextResponse.json({ ok: false, error: 'rollup_failed', purged: 0 }, { status: 500 })
    }

    // ── 2. Purga incremental do detalhe já agregado ───────────────────────
    const { data: oldRows, error: selErr } = await admin
      .from('user_activity_events')
      .select('id')
      .lt('created_at', cutoffIso)
      .limit(MAX_DELETE_PER_RUN)
    if (selErr) {
      logError('cron:telemetry-retention', selErr, { stage: 'select' })
      return NextResponse.json({ ok: false, error: 'select_failed', purged: 0 }, { status: 500 })
    }

    const ids = (oldRows || []).map((r) => String((r as Record<string, unknown>).id || '')).filter(Boolean)
    let purged = 0
    if (ids.length) {
      const { error: delErr } = await admin.from('user_activity_events').delete().in('id', ids)
      if (delErr) {
        logError('cron:telemetry-retention', delErr, { stage: 'delete' })
        return NextResponse.json({ ok: false, error: 'delete_failed', purged: 0 }, { status: 500 })
      }
      purged = ids.length
    }

    // Trilha persistente: "quanto foi apagado e quando" precisa de resposta
    // meses depois — log e Sentry expiram, o banco não.
    try {
      await admin.from('audit_events').insert({
        actor_role: 'service',
        action: 'cron_telemetry_retention',
        entity_type: 'cron',
        metadata: { purged, retention_days: RETENTION_DAYS, cutoff: cutoffIso },
      })
    } catch { /* auditoria não pode custar a purga */ }

    return NextResponse.json({ ok: true, purged, retentionDays: RETENTION_DAYS, cutoff: cutoffIso })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
