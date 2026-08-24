import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { createAdminClient } from '@/utils/supabase/admin'
import { isCronAuthorized } from '@/utils/cron/auth'
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
/**
 * O PostgREST devolve no MÁXIMO 1000 linhas por request (`max-rows` do
 * Supabase), então `.limit(20_000)` num único select é fantasia — ele volta
 * com 1000. A purga por execução alcança o teto acima paginando.
 */
export const SELECT_PAGE = 1000
/**
 * Quantos ids cabem num `.in()`. **Medido em 24/08/2026 contra a base de
 * produção**: 300 ids (~11 KB de query string) passam, 500 (~18 KB) já falham
 * — o gateway corta a URL e o supabase-js entrega um `TypeError: fetch failed`
 * com `code` e `message` VAZIOS. Foi por isso que o log da Vercel só mostrava
 * `[object Object] { stage: 'delete' }`.
 *
 * A consequência era grave e silenciosa: o delete falhava, a rota devolvia 500
 * e a purga **nunca rodou desde 04/08/2026** — 10.785 linhas vencidas ainda
 * estavam na tabela que já foi metade do banco. 250 é metade do limite medido.
 */
export const DELETE_CHUNK = 250

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
    // Página o select (teto real de 1000 por request) e apaga em blocos que
    // cabem na URL. `purged` conta o que de fato saiu: falha no meio devolve
    // 500 preservando o já apagado — a próxima execução continua de onde parou.
    let purged = 0
    while (purged < MAX_DELETE_PER_RUN) {
      const pageSize = Math.min(SELECT_PAGE, MAX_DELETE_PER_RUN - purged)
      const { data: oldRows, error: selErr } = await admin
        .from('user_activity_events')
        .select('id')
        .lt('created_at', cutoffIso)
        .limit(pageSize)
      if (selErr) {
        logError('cron:telemetry-retention', selErr, { stage: 'select', purged })
        return NextResponse.json({ ok: false, error: 'select_failed', purged }, { status: 500 })
      }

      const ids = (oldRows || []).map((r) => String((r as Record<string, unknown>).id || '')).filter(Boolean)
      if (!ids.length) break

      for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
        const chunk = ids.slice(i, i + DELETE_CHUNK)
        const { error: delErr } = await admin.from('user_activity_events').delete().in('id', chunk)
        if (delErr) {
          // O erro do gateway vem com `code`/`message` vazios; sem o texto
          // explícito o Sentry recebia só "[object Object]".
          logError('cron:telemetry-retention', delErr, {
            stage: 'delete',
            chunkSize: chunk.length,
            purged,
            message: delErr.message || '(vazia)',
            code: delErr.code || '(sem code)',
          })
          return NextResponse.json({ ok: false, error: 'delete_failed', purged }, { status: 500 })
        }
        purged += chunk.length
      }

      // Página incompleta = acabou o que havia para apagar.
      if (ids.length < pageSize) break
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
    return respondInternalError('api:cron:telemetry-retention', e)
  }
}
