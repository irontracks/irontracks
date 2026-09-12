/**
 * POST /api/ai/exercise-chat/prepare-media — a URL assinada para o aluno subir
 * a foto/vídeo que vai junto da pergunta.
 *
 * Mesmo desenho de `api/execution-videos/prepare` e `api/storage/signed-upload`:
 * o SERVIDOR escolhe o caminho e assina; o cliente sobe direto no Storage com o
 * token. O arquivo nunca passa pela rota — vídeo de execução estoura o corpo de
 * request de uma função serverless.
 *
 * ── As decisões que o próximo agente erraria ───────────────────────────────────
 *
 * 1. ⚠️ O BUCKET É O `set-media`, que já existe, já é privado, já tem o teto de
 *    60 MB e JÁ ESTÁ no catálogo LGPD (`lib/account/userDataCatalog.ts`, com o
 *    prefixo userId varrido na exclusão de conta). Bucket novo nasceria fora do
 *    catálogo — ou seja, arquivo de usuário que a exclusão de conta não apaga.
 *    Não crie um.
 *
 * 2. ⚠️ O CAMINHO É ESCOLHIDO AQUI, sempre sob `${userId}/`. A política de
 *    INSERT do bucket exige que a primeira pasta seja o `auth.uid()`, e o POST
 *    do chat recusa `path` que não comece assim — quem deixar o cliente propor
 *    o caminho reabre os dois buracos de uma vez (escrever na pasta alheia e
 *    mandar ao Gemini arquivo de outra conta).
 *
 * 3. ⚠️ A EXTENSÃO SAI DO MIME, por allowlist. O path é assinado e guardado como
 *    veio; sem allowlist dava para assinar `.html`/`.svg` e usar o bucket como
 *    hospedagem (auditoria 2026-06-27, mesma lição do signed-upload).
 *
 * Assinar é barato, mas é VIP: sem o gate, quem não tem a feature encheria o
 * bucket com arquivos que nenhuma pergunta vai consumir. A COTA, essa, é cobrada
 * no turno que de fato chama o Gemini (`api/ai/exercise-chat`) — cobrar aqui
 * queimaria a cota de quem desistiu antes de perguntar.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { getVipPlanLimits } from '@/utils/vip/limits'
import { createAdminClient } from '@/utils/supabase/admin'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'set-media'

/** Teto do bucket `set-media` em produção (62914560 B). Acima disso o upload é recusado lá. */
const MAX_BYTES = 60 * 1024 * 1024

/**
 * MIME → extensão. É a allowlist: o que não está aqui não sobe.
 * HEIC entra porque é o padrão da câmera do iPhone, que é o aparelho do caso de uso.
 */
const EXTENSAO_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

const BodySchema = z
  .object({
    mime: z.string().min(3).max(120),
    size: z.number().int().min(1).max(MAX_BYTES),
  })
  .strict()

type CodigoDeErro = 'rate_limited' | 'vip_required' | 'quota' | 'ai_unavailable' | 'invalid'

const erro = (code: CodigoDeErro, status: number) =>
  NextResponse.json({ ok: false as const, error: code }, { status })

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:exercise-chat:prepare:${userId}:${ip}`, 10, 60_000)
    if (!rl.allowed) return erro('rate_limited', 429)

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return erro('invalid', 400)
    const { mime } = parsedBody.data!

    const ext = EXTENSAO_POR_MIME[mime.trim().toLowerCase()]
    if (!ext) return erro('invalid', 400)

    // Mesma chave de tier do chat: quem pode perguntar pode anexar.
    const plan = await getVipPlanLimits(auth.supabase, userId)
    if (!plan.limits.media_analysis) return erro('vip_required', 403)

    const id = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const path = `${userId}/exercise-chat/${id}.${ext}`

    // Admin só para ASSINAR: a política de INSERT do bucket é por prefixo e o
    // prefixo aqui é construído pelo servidor, então o poder extra não amplia
    // nada — evita só que a assinatura dependa da sessão do cliente.
    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data?.token) {
      logError('api:ai:exercise-chat:prepare-media', error)
      return erro('ai_unavailable', 503)
    }

    return NextResponse.json(
      { ok: true, path, token: data.token },
      { headers: { 'cache-control': 'no-store, max-age=0' } },
    )
  } catch (e: unknown) {
    logError('api:ai:exercise-chat:prepare-media', e)
    return erro('ai_unavailable', 503)
  }
}
