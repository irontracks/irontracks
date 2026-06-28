import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { hasValidInternalSecret, requireRole } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { logWarn } from '@/lib/logger'

const BodySchema = z
  .object({
    confirm: z.string().optional(),
    dryRun: z.boolean().optional(),
    channelId: z.string().optional(),
  })
  .strip()
  .default({})

export async function POST(req: Request) {
  try {
    if (!hasValidInternalSecret(req)) {
      const auth = await requireRole(['admin'])
      if (!auth.ok) return auth.response
    }

    // Guard-rails: esta é uma operação DESTRUTIVA e GLOBAL (apaga toda a mídia
    // de chat + mensagens com media_url, irreversível). Exige confirmação
    // explícita; `dryRun` apenas conta; `channelId` permite escopar a um canal
    // (auditoria 2026-06-27, L10).
    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data ?? {}
    const dryRun = body?.dryRun === true
    const channelId = String(body?.channelId || '').trim()
    if (!dryRun && body?.confirm !== 'PURGE') {
      return NextResponse.json(
        { ok: false, error: 'confirmation_required', message: "Envie { confirm: 'PURGE' } para executar, ou { dryRun: true } para apenas contar." },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const bucket = 'chat-media'

    // 1. Coleta os paths (escopado por channelId quando informado).
    const allPaths: string[] = []
    if (channelId) {
      const { data: subItems } = await admin.storage.from(bucket).list(channelId, { limit: 1000 })
      if (subItems?.length) allPaths.push(...subItems.map((s) => `${channelId}/${s.name}`))
    } else {
      const { data: rootItems } = await admin.storage.from(bucket).list('', { limit: 1000 })
      if (rootItems && rootItems.length > 0) {
        for (const item of rootItems) {
          const { data: subItems } = await admin.storage.from(bucket).list(item.name, { limit: 1000 })
          if (subItems && subItems.length > 0) {
            allPaths.push(...subItems.map((s) => `${item.name}/${s.name}`))
          } else if ((item as unknown as { id?: string | null })?.id) {
            allPaths.push(item.name)
          }
        }
      }
    }

    // 2. dryRun → só conta (storage + mensagens com media_url), sem apagar nada.
    if (dryRun) {
      const { count: globalCount } = await admin.from('messages').select('id', { count: 'exact', head: true }).like('content', '%"media_url"%')
      const { count: directCount } = await admin.from('direct_messages').select('id', { count: 'exact', head: true }).like('content', '%"media_url"%')
      return NextResponse.json({
        ok: true,
        dryRun: true,
        scope: channelId || 'ALL',
        wouldDeleteFiles: allPaths.length,
        wouldRemoveMessages: (globalCount || 0) + (directCount || 0),
      })
    }

    logWarn('storage:purge-chat-media', `PURGE executado — scope=${channelId || 'ALL'}, files=${allPaths.length}`)

    // 3. Apaga os arquivos coletados.
    if (allPaths.length > 0) {
      for (let i = 0; i < allPaths.length; i += 100) {
        await admin.storage.from(bucket).remove(allPaths.slice(i, i + 100))
      }
    }

    // 4. Mensagens com media_url. Só global quando NÃO há escopo de canal
    // (não há como mapear o canal de forma confiável no content JSON).
    let messagesRemoved = 0
    if (!channelId) {
      const { data: globalDeleted } = await admin.from('messages').delete().like('content', '%"media_url"%').select('id')
      const { data: directDeleted } = await admin.from('direct_messages').delete().like('content', '%"media_url"%').select('id')
      messagesRemoved = (globalDeleted?.length || 0) + (directDeleted?.length || 0)
    }

    return NextResponse.json({ ok: true, scope: channelId || 'ALL', deleted: allPaths.length, messagesRemoved })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
