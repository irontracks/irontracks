/**
 * POST /api/social/presence/ping
 *
 * Marca o usuário como "online agora" no Redis (sorted set
 * `online_users` com timestamp como score). A lista é consumida pela UI
 * in-app que mostra "quem tá ativo agora" / "quem tá no gym".
 *
 * Histórico (importante)
 * ──────────────────────
 * Antes essa rota também disparava uma push do tipo `friend_online`
 * ("Fulano entrou no app") para todos os seguidores. Removido em
 * 2026-05-09 porque:
 *
 *   1. "Abrir o app" é um sinal frouxo — iOS desperta o WebView por
 *      background fetch, push silenciosa ou app sendo morto pela memória
 *      e relançado, sem o usuário tocar em nada. Os amigos recebiam
 *      push de "amigo online" sem o usuário ter realmente entrado.
 *   2. Mesmo quando o sinal é correto, "abriu o app" não é informação
 *      útil em app fitness — interesse social está em "começou o
 *      treino" / "bateu PR" (já cobertos por outros tipos), não em
 *      "abriu pra checar histórico".
 *   3. Spam: 50 amigos × 3-5 aberturas/dia = 150-250 pushes/dia por
 *      destinatário. Inviável.
 *
 * O tipo `friend_online` continua existente no schema (notifications
 * antigas no inbox dos usuários seguem visíveis), mas nenhum endpoint
 * cria mais linhas desse tipo. Os signals reais vêm de:
 *   - workout_start  ("Fulano começou um treino")
 *   - friend_pr      ("Fulano bateu um recorde")
 *   - friend_comeback ("Fulano voltou após X dias")
 */
import { NextResponse } from 'next/server'
import { logWarn } from '@/lib/logger'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { getUpstashConfig } from '@/utils/cache'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const userId = String(auth.user.id || '').trim()
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:presence:ping:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    // Tracking de presença — alimenta a UI "quem tá online agora" sem
    // gerar push. Não falha o request se Redis estiver indisponível.
    const cfg = getUpstashConfig()
    if (cfg) {
      const now = Date.now()
      const fiveMinsAgo = now - 5 * 60 * 1000
      try {
        await Promise.allSettled([
          fetch(`${cfg.url}/zremrangebyscore/online_users/-inf/${fiveMinsAgo}`, {
            headers: { Authorization: `Bearer ${cfg.token}` },
          }),
          fetch(`${cfg.url}/zadd/online_users/${now}/${userId}`, {
            headers: { Authorization: `Bearer ${cfg.token}` },
          }),
        ])
      } catch (e) { logWarn('social:presence:ping', 'silenced', e) }
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}
