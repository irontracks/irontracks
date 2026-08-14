import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { USER_DATA_CATALOG, type ExportOwn, type ExportVia } from '@/lib/account/userDataCatalog'

export const dynamic = 'force-dynamic'

// SEC-03 (auditoria 2026-08-13): a rota exportava 8 conjuntos escolhidos à mão
// e o resto do produto (nutrição, exames, fotos, mensagens, social, VIP…)
// ficava fora — resposta incompleta ao titular. Agora o plano de exportação é
// DERIVADO do catálogo único (userDataCatalog): tabela nova sem decisão lá
// reprova no guard, e o que é pulado sai listado em `skipped`, com o motivo.
//
// A leitura usa o client do PRÓPRIO usuário: a RLS é quem garante que nada de
// terceiro vaza. Tabela que a RLS não deixa o titular ler devolve [] — é o
// comportamento correto (o export entrega o que o titular pode ver).

const isMissingTable = (error: unknown) => {
  const e = error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const status = Number(e.status)
  const code = e.code ? String(e.code) : ''
  const msg = e.message ? String(e.message) : ''
  return status === 404 || code === '42P01' || /does not exist/i.test(msg) || /not found/i.test(msg)
}

const chunk = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`account:export:${auth.user.id}:${ip}`, 3, 10 * 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const supabase = auth.supabase
    const userId = auth.user.id

    const safeSelect = async (
      build: () => PromiseLike<{ data: unknown; error: unknown }>,
    ): Promise<Record<string, unknown>[]> => {
      try {
        const { data, error } = await build()
        if (error) {
          if (isMissingTable(error)) return []
          throw error
        }
        return Array.isArray(data) ? (data as Record<string, unknown>[]) : []
      } catch (e: unknown) {
        if (isMissingTable(e)) return []
        throw e
      }
    }

    const data: Record<string, Record<string, unknown>[]> = {}
    const skipped: Record<string, string> = {}

    // 1ª fase: tabelas com filtro direto pelo userId ('own'), em lotes de 8.
    const ownEntries = Object.entries(USER_DATA_CATALOG).filter(
      (pair): pair is [string, (typeof USER_DATA_CATALOG)[string] & { export: ExportOwn }] =>
        pair[1].export.kind === 'own',
    )
    for (const batch of chunk(ownEntries, 8)) {
      await Promise.all(
        batch.map(async ([table, entry]) => {
          const plan = entry.export
          const limit = plan.limit ?? 5000
          data[table] = await safeSelect(() => {
            const q = supabase.from(table).select('*')
            const filtered = plan.cols.length === 1
              ? q.eq(plan.cols[0], userId)
              : q.or(plan.cols.map((c) => `${c}.eq.${userId}`).join(','))
            return filtered.limit(limit)
          })
        }),
      )
    }

    // 2ª fase: tabelas filhas ('via'), resolvidas quando a mãe já foi lida.
    // Itera até estabilizar — cobre cadeias (sets ← exercises ← workouts).
    const viaPending = Object.entries(USER_DATA_CATALOG).filter(
      (pair): pair is [string, (typeof USER_DATA_CATALOG)[string] & { export: ExportVia }] =>
        pair[1].export.kind === 'via',
    )
    let progressed = true
    while (progressed && viaPending.length) {
      progressed = false
      for (let i = viaPending.length - 1; i >= 0; i--) {
        const [table, entry] = viaPending[i]
        const plan = entry.export
        const parentRows = data[plan.parent]
        if (!parentRows) continue
        viaPending.splice(i, 1)
        progressed = true
        const parentIds = parentRows.map((r) => r.id).filter(Boolean)
        const limit = plan.limit ?? 20000
        const rows: Record<string, unknown>[] = []
        // .in() vai na URL — lotes de 200 ids para não estourar o tamanho.
        for (const ids of chunk(parentIds, 200)) {
          if (rows.length >= limit) break
          const part = await safeSelect(() =>
            supabase.from(table).select('*').in(plan.parentCol, ids).limit(limit - rows.length),
          )
          rows.push(...part)
        }
        data[table] = rows
      }
    }
    for (const [table] of viaPending) {
      skipped[table] = 'mãe indisponível no export — verifique o catálogo'
    }

    for (const [table, entry] of Object.entries(USER_DATA_CATALOG)) {
      if (entry.export.kind === 'skip') skipped[table] = entry.export.reason
    }

    return NextResponse.json({
      ok: true,
      exportedAt: new Date().toISOString(),
      format: 'irontracks-account-export-v2',
      account: {
        id: userId,
        email: auth.user.email ?? null,
        createdAt: auth.user.created_at ?? null,
      },
      data,
      skipped,
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
