/**
 * Pareamento de avaliações: BIA standalone ↔ Avaliação por dobras
 *
 * Caso de uso real
 * ────────────────
 * 1) Aluno faz BIA numa farmácia/clínica em data X.
 * 2) Faz dobras com o personal em data Y.
 *
 * Os dois eventos refletem a mesma "fase" do aluno mesmo separados por
 * alguns dias. O app cruza eles e mostra a média entre %BF do skinfold
 * (Siri) e %BF do BIA — via combinedBodyFat — para o usuário ter o
 * número "blended" sem precisar fazer dobras + BIA na mesma sessão.
 *
 * Janela de proximidade
 * ─────────────────────
 * 14 dias é um equilíbrio entre:
 *   • cobrir cenários reais ("fui na farmácia ontem, treino com o
 *     personal sábado") sem ser tão frouxo que o pareamento perde
 *     significado fisiológico.
 *   • Acima de 14 dias o aluno pode ter mudado de massa corporal o
 *     suficiente pra invalidar a comparação.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assessment } from '@/types/assessment'

export const PAIRING_WINDOW_DAYS = 14

/** Diferença em dias entre duas datas (positivo = `a` é após `b`). */
export function daysBetween(a: string | Date, b: string | Date): number {
  const ta = typeof a === 'string' ? new Date(a).getTime() : a.getTime()
  const tb = typeof b === 'string' ? new Date(b).getTime() : b.getTime()
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY
  return Math.abs(ta - tb) / (1000 * 60 * 60 * 24)
}

/**
 * Procura, para uma avaliação `source`, a contraparte do tipo oposto que
 * está mais próxima em data dentro da janela e ainda não tem par.
 * Retorna o id encontrado ou null.
 *
 * Implementação propositadamente simples — uma query SQL com filtro de
 * janela e order-by por proximidade, depois pega a primeira linha. Para
 * volumes pequenos por aluno (~dezenas de avaliações no histórico) é
 * suficiente; o índice composto criado na migration cobre os predicados.
 */
export async function findPairCandidate(
  supabase: SupabaseClient,
  source: {
    id: string
    student_id: string
    assessment_type: 'full' | 'bia'
    assessment_date: string
  },
): Promise<string | null> {
  const targetType: 'full' | 'bia' = source.assessment_type === 'bia' ? 'full' : 'bia'

  const sourceDateMs = new Date(source.assessment_date).getTime()
  if (!Number.isFinite(sourceDateMs)) return null
  const windowMs = PAIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const lo = new Date(sourceDateMs - windowMs).toISOString()
  const hi = new Date(sourceDateMs + windowMs).toISOString()

  const { data, error } = await supabase
    .from('assessments')
    .select('id, assessment_date, paired_assessment_id')
    .eq('student_id', source.student_id)
    .eq('assessment_type', targetType)
    .is('paired_assessment_id', null)
    .gte('assessment_date', lo)
    .lte('assessment_date', hi)
    .neq('id', source.id)

  if (error || !Array.isArray(data) || data.length === 0) return null

  // Escolher o mais próximo em data — `order-by abs(date - source)` não
  // existe em PostgREST, então ordeno em JS. Volume é baixo (max ~30 rows
  // numa janela de 28 dias para 1 aluno).
  let bestId: string | null = null
  let bestDelta = Number.POSITIVE_INFINITY
  for (const row of data) {
    const delta = daysBetween(String(row.assessment_date), source.assessment_date)
    if (delta < bestDelta) {
      bestDelta = delta
      bestId = String(row.id)
    }
  }
  return bestId
}

/**
 * Linka mutuamente duas avaliações (sourceId ↔ targetId). Idempotente:
 * se um lado já está apontando para o outro, segue. Se algum lado já
 * tem par DIFERENTE, aborta (não sobrescreve relação existente — o
 * usuário pode estar em algum re-pareamento manual no futuro).
 */
export async function linkAssessments(
  supabase: SupabaseClient,
  sourceId: string,
  targetId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!sourceId || !targetId || sourceId === targetId) {
    return { ok: false, error: 'invalid_ids' }
  }

  const { data: pair, error: fetchErr } = await supabase
    .from('assessments')
    .select('id, paired_assessment_id')
    .in('id', [sourceId, targetId])

  if (fetchErr || !Array.isArray(pair) || pair.length !== 2) {
    return { ok: false, error: fetchErr?.message || 'fetch_failed' }
  }

  for (const row of pair) {
    const existing = row.paired_assessment_id ? String(row.paired_assessment_id) : null
    const otherId = String(row.id) === sourceId ? targetId : sourceId
    if (existing && existing !== otherId) {
      return { ok: false, error: 'already_paired_to_other' }
    }
  }

  const { error: e1 } = await supabase
    .from('assessments')
    .update({ paired_assessment_id: targetId })
    .eq('id', sourceId)
  if (e1) return { ok: false, error: e1.message }

  const { error: e2 } = await supabase
    .from('assessments')
    .update({ paired_assessment_id: sourceId })
    .eq('id', targetId)
  if (e2) return { ok: false, error: e2.message }

  return { ok: true }
}

/**
 * Atalho usado pelo fluxo de createAssessment: tenta achar par e linkar.
 * Não falha o fluxo principal se algo der errado — o pareamento é
 * complementar; o registro principal já foi salvo.
 */
export async function tryAutoPair(
  supabase: SupabaseClient,
  source: {
    id: string
    student_id: string
    assessment_type: 'full' | 'bia'
    assessment_date: string
  },
): Promise<string | null> {
  try {
    const candidateId = await findPairCandidate(supabase, source)
    if (!candidateId) return null
    const result = await linkAssessments(supabase, source.id, candidateId)
    return result.ok ? candidateId : null
  } catch {
    return null
  }
}

/**
 * "Blended" %BF a partir de dois registros (full + bia) ou a partir de um
 * único registro com ambos preenchidos. Wrapper sobre combinedBodyFat
 * que esconde o cruzamento entre múltiplas linhas.
 *
 * Retorna a tripla (skinfold / bia / combined) sem aplicar nenhuma
 * fórmula que já não esteja em buildBodyFatBreakdown — apenas resolve de
 * onde vem cada valor.
 */
export type AssessmentSource = Pick<
  Assessment,
  | 'assessment_type'
  | 'body_fat_percentage_skinfold'
  | 'bia_body_fat_percentage'
>

export interface ResolvedBodyFat {
  /** %BF do método de dobras — vindo do registro principal ou do par. */
  skinfold: number | null
  /** %BF da bioimpedância — vindo do registro principal ou do par. */
  bia: number | null
  /** Indica se um par foi consultado para resolver os valores. */
  fromPair: boolean
}

export function resolveBodyFatFromPair(
  primary: AssessmentSource,
  pair: AssessmentSource | null | undefined,
): ResolvedBodyFat {
  const isValid = (v: number | null | undefined): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 100

  // Mesmo registro pode ter os dois (caso "tudo no mesmo formulário").
  const primarySkin = isValid(primary.body_fat_percentage_skinfold)
    ? (primary.body_fat_percentage_skinfold as number)
    : null
  const primaryBia = isValid(primary.bia_body_fat_percentage)
    ? (primary.bia_body_fat_percentage as number)
    : null

  // Se o par existir, traz os valores que faltam.
  const pairSkin = pair && isValid(pair.body_fat_percentage_skinfold)
    ? (pair.body_fat_percentage_skinfold as number)
    : null
  const pairBia = pair && isValid(pair.bia_body_fat_percentage)
    ? (pair.bia_body_fat_percentage as number)
    : null

  const skinfold = primarySkin ?? pairSkin ?? null
  const bia = primaryBia ?? pairBia ?? null
  const fromPair = (skinfold === pairSkin && pairSkin != null) || (bia === pairBia && pairBia != null)

  return { skinfold, bia, fromPair }
}
