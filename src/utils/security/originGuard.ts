/**
 * Guarda de origem para rotas de API mutantes — SEC-08 (auditoria 2026-08-13).
 *
 * O que ela cobre: requisição MUTANTE (POST/PUT/PATCH/DELETE) autenticada por
 * COOKIE vinda de outra origem. `SameSite=Lax` já corta o CSRF clássico; isto
 * é defesa em profundidade para o que sobra (subdomínio comprometido, cliente
 * que reenvia cookie em contexto cross-site).
 *
 * O que ela NUNCA pode travar (e por isso PASSA):
 * - GET/HEAD/OPTIONS — leitura não é alvo de CSRF;
 * - requisição SEM cookie de sessão — webhooks (RevenueCat/MP/Asaas), crons
 *   (QStash/Vercel), rotas públicas (csp-report) e clientes só-bearer;
 * - requisição COM header Authorization — bearer nativo: navegador cross-site
 *   não consegue anexar header custom sem preflight de CORS, então a presença
 *   do header já prova que não é um form/fetch cross-site simples.
 *
 * Mesma doutrina do CSP: NASCE EM MODO RELATÓRIO. `mismatch` vira log de
 * error (retido na Vercel) e a requisição segue; bloquear é decisão explícita
 * (bloqueante por padrão desde 01/09/2026; `ORIGIN_GUARD_ENFORCE=false` desliga).
 * `missing-origin` existe separado de `cross-origin` exatamente para a
 * janela medir se algum cliente legítimo omite o header antes de o enforce
 * tratar ausência como hostil.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export interface OriginGuardInput {
  method: string
  /** Header `Origin` cru (ou null quando ausente). */
  origin: string | null
  /** Host público da requisição (`request.nextUrl.host`), com porta se houver. */
  requestHost: string
  /** Existe cookie de sessão do Supabase (`sb-*`)? */
  hasSessionCookie: boolean
  /** Existe header Authorization (bearer nativo)? */
  hasAuthorizationHeader: boolean
}

export type OriginGuardVerdict =
  | { action: 'pass' }
  | { action: 'mismatch'; kind: 'cross-origin' | 'missing-origin'; originHost: string | null }

export function evaluateOriginGuard(input: OriginGuardInput): OriginGuardVerdict {
  if (!MUTATING.has(String(input.method || '').toUpperCase())) return { action: 'pass' }
  if (!input.hasSessionCookie) return { action: 'pass' }
  if (input.hasAuthorizationHeader) return { action: 'pass' }

  const raw = String(input.origin || '').trim()
  if (!raw || raw === 'null') {
    // Origin ausente (ou o literal "null" de contexto opaco): navegador
    // moderno SEMPRE manda Origin em POST — mas a janela de relatório é quem
    // prova isso nesta base de clientes, não a suposição.
    return { action: 'mismatch', kind: 'missing-origin', originHost: null }
  }

  try {
    const originHost = new URL(raw).host
    if (originHost === input.requestHost) return { action: 'pass' }
    return { action: 'mismatch', kind: 'cross-origin', originHost }
  } catch {
    return { action: 'mismatch', kind: 'cross-origin', originHost: raw.slice(0, 100) }
  }
}

/**
 * Bloqueante por PADRÃO; `ORIGIN_GUARD_ENFORCE=false` é o freio de emergência.
 *
 * Mesma inversão de polaridade que o CSP fez em 27/08/2026, pelo mesmo motivo:
 * enquanto proteger dependia de alguém lembrar de setar `=true`, a janela de
 * relatório passou (zero mismatches em 30 dias, medidos em `audit_events` em
 * 01/09/2026) e ninguém virou a chave. Com o default no lado seguro, o
 * esquecimento protege em vez de expor. Só a string exata `false` desliga.
 */
export const originGuardEnforcedFrom = (valor: string | undefined) =>
  String(valor ?? '').toLowerCase().trim() !== 'false'

export const originGuardEnforced = () => originGuardEnforcedFrom(process.env.ORIGIN_GUARD_ENFORCE)
