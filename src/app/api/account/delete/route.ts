import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { extractStoragePathFromPublicUrl } from '@/utils/storage/publicUrlPath'
import { MANUAL_DELETE_STEPS, USER_PREFIX_BUCKETS } from '@/lib/account/userDataCatalog'

export const dynamic = 'force-dynamic'

// SEC-03 (auditoria 2026-08-13): a rota apagava um conjunto de tabelas
// escolhido à mão e deixava órfãs (stories no feed, fotos corporais, exames) e
// TODO o storage. O desenho agora vem do catálogo único (userDataCatalog),
// medido contra as FKs de produção:
//  - a maioria das tabelas CASCATEIA no deleteUser (o banco limpa sozinho);
//  - os passos manuais são as órfãs SEM FK + `error_reports`, cujo RESTRICT
//    TRAVA o deleteUser se a linha existir — por isso ele vem primeiro;
//  - storage nunca cascateia: buckets com prefixo userId são varridos, e o
//    chat-media é resolvido pelas URLs das mensagens ANTES de as linhas
//    morrerem com o cascade.
// Guard: __tests__/deleteAuthVerified.test.ts + userDataCatalog.test.ts

const BodySchema = z
  .object({
    confirm: z.string().min(1),
  })
  .strip()

const isMissingTable = (error: unknown) => {
  const e = error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const status = Number(e.status)
  const code = e.code ? String(e.code) : ''
  const msg = e.message ? String(e.message) : ''
  return status === 404 || code === '42P01' || /does not exist/i.test(msg) || /not found/i.test(msg)
}

const MessageContentSchema = z
  .object({
    type: z.string().optional(),
    media_url: z.string().optional(),
    thumb_url: z.string().optional(),
  })
  .passthrough()

const chunk = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Varre `${userId}/` num bucket (list não é recursivo — desce pasta a pasta,
 * profundidade ≤ 4) e remove em lotes. Melhor-esforço: falha vira contagem no
 * audit, nunca aborta a exclusão — a conta não pode ficar presa por um objeto.
 */
async function removeUserPrefixObjects(admin: AdminClient, bucket: string, userId: string) {
  const paths: string[] = []
  const walk = async (prefix: string, depth: number) => {
    if (depth > 4 || paths.length >= 2000) return
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
    if (error || !Array.isArray(data)) return
    for (const item of data) {
      const name = String(item?.name || '')
      if (!name) continue
      const full = prefix ? `${prefix}/${name}` : name
      // Convenção do storage-js: pasta vem sem `id`.
      if (item && (item as { id?: string | null }).id) paths.push(full)
      else await walk(full, depth + 1)
    }
  }
  await walk(userId, 0)
  let removed = 0
  let failed = 0
  for (const batch of chunk(paths, 100)) {
    const { error } = await admin.storage.from(bucket).remove(batch)
    if (error) failed += batch.length
    else removed += batch.length
  }
  return { bucket, found: paths.length, removed, failed }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`account:delete:${user.id}:${ip}`, 3, 10 * 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const confirm = String(body?.confirm || '').trim().toUpperCase()
    if (confirm !== 'EXCLUIR') return NextResponse.json({ ok: false, error: 'invalid_confirm' }, { status: 400 })

    const admin = createAdminClient()
    const userId = user.id

    const safeDelete = async (query: PromiseLike<{ error: unknown }>, table: string) => {
      try {
        const { error } = await query
        if (error && !isMissingTable(error)) throw error
      } catch (e: unknown) {
        if (isMissingTable(e)) return
        logError('account:delete:table', e, { userId, table })
        throw e
      }
    }

    // ── 1. Mídia do chat: resolver paths ANTES de as linhas morrerem no
    //       cascade (direct_channels/messages têm FK CASCADE p/ auth.users).
    const chatMediaPaths: string[] = []
    try {
      const { data: channels } = await admin
        .from('direct_channels')
        .select('id')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .limit(2000)
      const channelIds = (Array.isArray(channels) ? channels : []).map((c) => c?.id).filter(Boolean)
      for (const ids of chunk(channelIds, 200)) {
        const { data: msgs } = await admin
          .from('direct_messages')
          .select('content')
          .in('channel_id', ids)
          .limit(20000)
        for (const m of Array.isArray(msgs) ? msgs : []) {
          const parsed = MessageContentSchema.safeParse(
            (() => {
              try {
                return JSON.parse(String((m as { content?: unknown })?.content || ''))
              } catch {
                return null
              }
            })(),
          )
          if (!parsed.success || !parsed.data) continue
          const media = extractStoragePathFromPublicUrl('chat-media', String(parsed.data.media_url || ''), 'account:delete')
          const thumb = extractStoragePathFromPublicUrl('chat-media', String(parsed.data.thumb_url || ''), 'account:delete')
          if (media) chatMediaPaths.push(media)
          if (thumb) chatMediaPaths.push(thumb)
        }
      }
    } catch (e: unknown) {
      logError('account:delete:chat-media-scan', e, { userId })
    }

    // ── 2. Passos manuais do catálogo (órfãs sem FK; error_reports PRIMEIRO —
    //       ON DELETE RESTRICT trava o deleteUser se a linha existir).
    for (const step of MANUAL_DELETE_STEPS) {
      const q = admin.from(step.table).delete()
      const filtered = step.cols.length === 1
        ? q.eq(step.cols[0], userId)
        : q.or(step.cols.map((c) => `${c}.eq.${userId}`).join(','))
      await safeDelete(filtered, step.table)
    }

    // ── 3. Passo especial: access_requests é chaveada por EMAIL.
    if (user.email) {
      await safeDelete(admin.from('access_requests').delete().eq('email', user.email), 'access_requests')
    }

    // ── 4. Storage (nunca cascateia). Melhor-esforço com contagem auditada.
    const storageReport: Array<{ bucket: string; found: number; removed: number; failed: number }> = []
    for (const bucket of USER_PREFIX_BUCKETS) {
      try {
        storageReport.push(await removeUserPrefixObjects(admin, bucket, userId))
      } catch (e: unknown) {
        logError('account:delete:storage', e, { userId, bucket })
        storageReport.push({ bucket, found: -1, removed: 0, failed: -1 })
      }
    }
    if (chatMediaPaths.length) {
      let removed = 0
      let failed = 0
      for (const batch of chunk(Array.from(new Set(chatMediaPaths)), 100)) {
        const { error } = await admin.storage.from('chat-media').remove(batch)
        if (error) failed += batch.length
        else removed += batch.length
      }
      storageReport.push({ bucket: 'chat-media', found: chatMediaPaths.length, removed, failed })
    }

    // ── 5. Auth por último — o cascade do banco limpa o restante das tabelas.
    // SEC-02: o SDK devolve { error } em falha esperada — NÃO lança —, então o
    // catch vazio antigo nunca via nada e a rota respondia "excluída" com a
    // conta ainda ativa. Guard: __tests__/deleteAuthVerified.test.ts
    const audit = async (action: string, metadata: Record<string, unknown>) => {
      try {
        await admin.from('audit_events').insert({
          actor_id: userId,
          actor_email: user.email ?? null,
          actor_role: 'user',
          action,
          entity_type: 'account',
          entity_id: userId,
          metadata,
        })
      } catch (e: unknown) {
        logError('account:delete:audit', e, { userId, action })
      }
    }

    let authError: unknown = null
    try {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) authError = error
    } catch (e: unknown) {
      authError = e
    }

    if (authError) {
      logError('account:delete:auth', authError, { userId })
      await audit('account_delete_auth_failed', {
        message: getErrorMessage(authError),
        status: (authError as { status?: number })?.status ?? null,
        storage: storageReport,
      })
      return NextResponse.json({ ok: false, error: 'auth_delete_failed' }, { status: 500 })
    }

    await audit('account_deleted', { storage: storageReport })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return respondInternalError('api:account:delete', e)
  }
}
