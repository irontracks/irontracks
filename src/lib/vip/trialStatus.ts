/**
 * Estado ATUAL de uma degustação — o que está valendo, não o que foi dado.
 *
 * O histórico de doações do painel mostrava só "30 dia(s)", que é o que o admin
 * concedeu na época. Não responde a pergunta que ele realmente faz ao abrir a
 * tela: *quanto ainda resta para essa pessoa?*
 *
 * Calcular pelo log (`created_at + days`) seria inventar um fato. Casos reais
 * desta base, medidos em 13/08/2026: um usuário recebeu 30 dias em 22/06 e o
 * entitlement venceu em 22/07 — mas outro tem TRÊS registros ao mesmo tempo
 * (um válido até 2027, um vencido há 96 dias, um inativo). A conta pelo log
 * erraria os três, e erraria com cara de precisão.
 *
 * A verdade é `user_entitlements.valid_until`. `status = 'revoked'` corta antes
 * da data, porque revogação é decisão explícita; `valid_until` nulo é acesso
 * sem prazo (conta de review da Apple, por exemplo).
 */

export type TrialStatus =
  | { tipo: 'ativo'; diasRestantes: number }
  | { tipo: 'sem-prazo' }
  | { tipo: 'expirado'; diasAtras: number }
  | { tipo: 'revogado' }
  | { tipo: 'desconhecido' }

export interface VigenteRaw {
  validUntil?: string | null
  status?: string | null
}

const DIA_MS = 86_400_000

/** Dias inteiros entre duas datas, pelo calendário (não por horas corridas). */
const diffEmDias = (ate: Date, agora: Date): number => {
  const a = Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate())
  const b = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())
  return Math.round((a - b) / DIA_MS)
}

export function trialStatus(vigente: VigenteRaw | null | undefined, agora = new Date()): TrialStatus {
  if (!vigente) return { tipo: 'desconhecido' }
  if (String(vigente.status || '').toLowerCase() === 'revoked') return { tipo: 'revogado' }
  if (!vigente.validUntil) return { tipo: 'sem-prazo' }

  const ate = new Date(vigente.validUntil)
  if (Number.isNaN(ate.getTime())) return { tipo: 'desconhecido' }

  const dias = diffEmDias(ate, agora)
  // Vence hoje ainda é hoje: 0 conta como ativo, não como expirado.
  return dias >= 0 ? { tipo: 'ativo', diasRestantes: dias } : { tipo: 'expirado', diasAtras: -dias }
}

/** Texto curto para a lista. Plural correto — "1 dia", não "1 dia(s)". */
export function trialStatusLabel(s: TrialStatus): string {
  switch (s.tipo) {
    case 'ativo':
      if (s.diasRestantes === 0) return 'Vence hoje'
      return s.diasRestantes === 1 ? 'Falta 1 dia' : `Faltam ${s.diasRestantes} dias`
    case 'expirado':
      return s.diasAtras === 1 ? 'Expirou ontem' : `Expirou há ${s.diasAtras} dias`
    case 'sem-prazo':
      return 'Sem prazo'
    case 'revogado':
      return 'Revogado'
    default:
      return 'Sem VIP ativo'
  }
}
