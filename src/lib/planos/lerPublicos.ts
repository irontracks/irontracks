import { createClient } from '@supabase/supabase-js'
import { env } from '@/utils/env'
import { logError } from '@/lib/logger'
import { montarPlanos, montarTiersProfessor, type PlanosPublicos, type TierProfessor } from './publicos'

/**
 * Lê os planos que a landing mostra. Roda no SERVIDOR, na renderização da
 * página, com a chave ANÔNIMA — de propósito:
 *
 * - `app_plans` tem policy de SELECT para `anon` só das linhas ativas, e
 *   `teacher_tiers` idem (`is_active`). Preço público não precisa de service
 *   role, e uma landing com a chave de serviço por perto é risco sem ganho.
 * - Os ids dos seis planos VIP vão por NOME. Nada de `select *` nem de filtro
 *   por prefixo: a tabela também guarda `vip_*_month`/`vip_*_year`, inativos,
 *   com o mesmo valor.
 *
 * Falhar aqui NUNCA derruba a landing: sem plano, a página simplesmente não
 * desenha a seção (`null`) — preço incompleto ou inventado é pior que nenhum.
 * O erro vai por `logError` (chega ao Sentry), e quando já houve uma leitura
 * boa a página segue mostrando o valor guardado.
 *
 * Cache de 10 min por instância: a landing é a porta de entrada e não deve
 * abrir duas consultas ao banco por visita. Preço muda raramente.
 */

const IDS_VIP = [
  'vip_start',
  'vip_pro',
  'vip_elite',
  'vip_start_annual',
  'vip_pro_annual',
  'vip_elite_annual',
] as const

export const PLANOS_TTL_MS = 10 * 60 * 1000
/** Depois de uma falha com valor guardado, tenta de novo em 1 min (não a cada visita). */
const REPETIR_APOS_FALHA_MS = 60 * 1000

let guardado: { em: number; valor: PlanosPublicos } | null = null

const COLUNAS_TIER = 'tier_key,name,description,max_students,price_cents,currency,sort_order,is_active'

/** Chave ANÔNIMA, sem sessão — a mesma para as duas leituras. */
function clienteAnonimo() {
  return createClient(env.supabase.url, env.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function lerPlanosPublicos(agora: number = Date.now()): Promise<PlanosPublicos | null> {
  if (guardado && agora - guardado.em < PLANOS_TTL_MS) return guardado.valor

  try {
    const db = clienteAnonimo()
    const [planos, tiers] = await Promise.all([
      db
        .from('app_plans')
        .select('id,name,interval,price_cents,currency,status,limits')
        .in('id', [...IDS_VIP])
        .eq('status', 'active'),
      db
        .from('teacher_tiers')
        .select(COLUNAS_TIER)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ])
    // O supabase-js NÃO lança em erro de leitura: devolve `{ error }`.
    if (planos.error) throw planos.error
    if (tiers.error) throw tiers.error

    const montado = montarPlanos(planos.data ?? [], tiers.data ?? [])
    if (!montado) throw new Error('planos públicos incompletos: falta algum plano VIP mensal ativo')

    guardado = { em: agora, valor: montado }
    return montado
  } catch (e) {
    logError('landing.planos-publicos', e)
    if (guardado) {
      guardado = { em: agora - PLANOS_TTL_MS + REPETIR_APOS_FALHA_MS, valor: guardado.valor }
      return guardado.valor
    }
    return null
  }
}

let tiersGuardados: { em: number; valor: TierProfessor[] } | null = null

/**
 * Só os níveis de professor — para a página `/para-professores`, que não mostra
 * VIP e não pode sumir porque a tabela do VIP falhou. Mesma política da leitura
 * acima: chave anônima, `{ error }` olhado, `null` quando falha (a página some
 * com a seção de preços em vez de mostrar valor velho ou inventado), valor
 * guardado servido em falha passageira, cache de 10 min.
 */
export async function lerTiersProfessorPublicos(agora: number = Date.now()): Promise<TierProfessor[] | null> {
  if (tiersGuardados && agora - tiersGuardados.em < PLANOS_TTL_MS) return tiersGuardados.valor

  try {
    const { data, error } = await clienteAnonimo()
      .from('teacher_tiers')
      .select(COLUNAS_TIER)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) throw error

    const tiers = montarTiersProfessor(data ?? [])
    if (tiers.length === 0) throw new Error('teacher_tiers sem nenhum nível ativo')

    tiersGuardados = { em: agora, valor: tiers }
    return tiers
  } catch (e) {
    logError('para-professores.tiers-publicos', e)
    if (tiersGuardados) {
      tiersGuardados = { em: agora - PLANOS_TTL_MS + REPETIR_APOS_FALHA_MS, valor: tiersGuardados.valor }
      return tiersGuardados.valor
    }
    return null
  }
}
