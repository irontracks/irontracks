import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { createClient } from '@/utils/supabase/server'
import { cacheSet, cacheDelete } from '@/utils/cache'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    otherUserId: z.string().min(1),
    active: z.boolean(),
  })
  .strip()

// TTL curto: a presença expira sozinha se o cliente parar de bater o heartbeat
// (ex.: app morreu sem disparar o "clear"). O cliente renova a cada ~20s.
const PRESENCE_TTL_SECONDS = 30

/**
 * Marca/limpa "estou vendo esta conversa" para o usuário autenticado.
 * Usado por /api/notifications/direct-message para NÃO enviar push/banner
 * quando o destinatário já está com a conversa aberta em foreground.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const otherUserId = String(parsed.data!.otherUserId || '').trim()
    if (!otherUserId) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    // Chave sempre escopada ao próprio usuário — ninguém marca presença por outro.
    const key = `dm:viewing:${user.id}:${otherUserId}`
    if (parsed.data!.active) await cacheSet(key, '1', PRESENCE_TTL_SECONDS)
    else await cacheDelete(key)

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: (e as { message?: string })?.message ?? String(e) },
      { status: 500 },
    )
  }
}
