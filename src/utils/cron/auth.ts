import { hasValidInternalSecret } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { env } from '@/utils/env'

/**
 * Constant-time string comparison. A naïve `a === b` short-circuits at the
 * first differing byte, so an attacker can measure latency to recover the
 * secret byte by byte. We compare in O(n) by XOR-summing all positions.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

/**
 * Authorize a Vercel Cron invocation. Vercel Cron sends the Authorization
 * header `Bearer <CRON_SECRET>`. We also allow internal secret callers
 * (useful for manual triggering during development).
 */
export function isCronAuthorized(req: Request): boolean {
  const expected = env.security.cronSecret.trim()
  if (!expected) return false
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader.startsWith('Bearer ') && safeEqual(authHeader.slice(7), expected)) return true
  if (hasValidInternalSecret(req)) return true
  return false
}

/**
 * Mesma autorização, aceitando também o segredo gerado DENTRO do banco
 * (`public.cron_secrets`, RLS sem policy: só service-role alcança).
 *
 * Por que existe: o único valor aceito vivia numa env var da Vercel, então
 * ligar um cron novo dependia de alguém copiar credencial de um painel à mão —
 * e o lembrete de refeição ficou dias sem disparar exatamente por isso (o
 * pg_cron rodava, devolvia "0 rows" e nunca chamava a rota, porque o segredo
 * que ele procurava no Vault nunca foi criado). Com o segredo nascendo no
 * banco, o agendamento se auto-basta e ninguém precisa manusear o texto.
 *
 * Não afrouxa nada: quem tem SQL no projeto já podia escrever direto nas
 * tabelas que estas rotas escrevem. O caminho da env var continua igual e é
 * tentado PRIMEIRO — a consulta só acontece quando ele não resolve.
 *
 * Falha de leitura NEGA (fail-closed), como o resto deste arquivo.
 */
export async function isCronAuthorizedAsync(req: Request): Promise<boolean> {
  if (isCronAuthorized(req)) return true

  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return false
  const bearer = authHeader.slice(7).trim()
  if (!bearer) return false

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('cron_secrets')
      .select('secret')
      .eq('name', 'cron')
      .maybeSingle()
    if (error) return false
    // Sem `if (!expected) return false`: o bearer já é garantidamente não-vazio
    // acima, e `safeEqual` recusa tamanhos diferentes — a linha seria um ramo
    // que nenhuma mutação consegue derrubar, ou seja, guard de mentira.
    return safeEqual(bearer, String(data?.secret ?? '').trim())
  } catch {
    return false
  }
}
