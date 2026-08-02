import { requireUser, isSafeStoragePath, canUploadToChatMediaPath } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Serve a mídia de uma DM (bucket chat-media) por URL ASSINADA de curta duração, gateada por
 * participação no canal — em vez de expor a mídia por URL pública permanente (era o vetor:
 * bucket público + getPublicUrl salvo no content, sem checagem de participante).
 *
 * Aceita `?u=` (URL pública/assinada antiga OU path cru) — extrai o path relativo do bucket,
 * valida (isSafeStoragePath: channelId UUID + sem traversal), confere que o chamador participa
 * do canal (canUploadToChatMediaPath) e redireciona (307) para a signed URL do service-role.
 */
function extractChatMediaPath(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  const marker = '/chat-media/'
  const idx = s.indexOf(marker)
  // URL (pública/assinada) → tudo após /chat-media/, sem querystring; senão já é path cru.
  const rel = idx >= 0 ? s.slice(idx + marker.length) : s
  return rel.split('?')[0]
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`chat:media:${auth.user.id}:${ip}`, 120, 60_000)
    if (!rl.allowed) return new Response('rate_limited', { status: 429 })

    const url = new URL(req.url)
    const raw = url.searchParams.get('u') || url.searchParams.get('path') || ''
    const path = extractChatMediaPath(raw)
    const safe = isSafeStoragePath(path)
    if (!safe.ok) return new Response('invalid_path', { status: 400 })

    // Só participante do canal acessa a mídia daquela conversa.
    const allowed = await canUploadToChatMediaPath(auth.user.id, safe.channelId)
    if (!allowed) return new Response('forbidden', { status: 403 })

    const admin = createAdminClient()
    const { data: signed, error } = await admin.storage.from('chat-media').createSignedUrl(safe.path, 600)
    if (error || !signed?.signedUrl) return new Response('failed_to_sign', { status: 400 })

    const headers = new Headers()
    headers.set('Location', signed.signedUrl)
    headers.set('Cache-Control', 'private, max-age=300')
    return new Response(null, { status: 307, headers })
  } catch (e: unknown) {
    return new Response(getErrorMessage(e) ?? 'internal_error', { status: 500 })
  }
}
