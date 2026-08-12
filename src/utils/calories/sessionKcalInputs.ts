/**
 * sessionKcalInputs.ts — o LEITOR ÚNICO dos ingredientes da estimativa de kcal.
 *
 * POR QUE existe: o modelo MET (`estimateCaloriesMet`) sempre foi um só, mas cada
 * tela montava os ARGUMENTOS por conta própria — e a conta divergia sem ninguém
 * mexer na fórmula. Medido em 12/08/2026 na mesma sessão do dono:
 *
 *   relatório  → 744 kcal (peso do check-in + RPE do pós-treino)
 *   nutrição   → 698 kcal (peso do perfil, SEM RPE)
 *   744 / 698  = 1,066 — exatamente o multiplicador de RPE do modelo.
 *
 * E o `reportMetrics`, que passava `{}`, ficava sem RPE e (nas 491 de 596 sessões
 * sem peso no check-in) caía no default de 78 kg: o rateio POR EXERCÍCIO usava
 * um peso, o total do card usava outro, e as parcelas não somavam o total.
 *
 * A regra: quem quer kcal de uma sessão chama `sessionKcalInputs(...)` e entrega
 * o resultado a `estimateSessionKcal*`. O tipo é BRANDED de propósito — objeto
 * literal não compila, então não há como um chamador novo reinventar a ordem.
 * Guard de fiação em `__tests__/sessionKcalInputs.test.ts`.
 *
 * Ordem de precedência, uma vez só, para todo mundo:
 *   peso  → check-in (lido da tabela) > check-in embutido na sessão > perfil > null
 *   sexo  → perfil > sessão
 *   RPE   → pós-treino (tabela) > pós-treino embutido na sessão
 *
 * O check-in vem ANTES do perfil porque é a medição daquele dia; o perfil é o
 * último peso declarado, que pode ser de meses atrás. `null` significa "não sei"
 * e deixa o modelo aplicar o próprio default (`DEFAULT_BODY_WEIGHT_KG`).
 */

/**
 * Marca de origem. Existe em RUNTIME (não é só brand de tipo) porque o gerador
 * do PDF recebe suas opções como `unknown` e precisa reconhecer os ingredientes
 * prontos que a tela do relatório já resolveu.
 */
export const KCAL_INPUTS_MARK: unique symbol = Symbol.for('irontracks.sessionKcalInputs')

/** Ingredientes já resolvidos. Só `sessionKcalInputs()` produz este tipo. */
export interface SessionKcalInputs {
  readonly [KCAL_INPUTS_MARK]: true
  readonly bodyWeightKg: number | null
  readonly biologicalSex: 'male' | 'female' | null
  readonly rpe: number | null
}

export const isSessionKcalInputs = (v: unknown): v is SessionKcalInputs =>
  !!v && typeof v === 'object' && (v as Record<PropertyKey, unknown>)[KCAL_INPUTS_MARK] === true

/** Perfil declarado do usuário — casa com `ProfileFacts` do `userSnapshot`. */
export interface KcalProfileLike {
  bodyWeightKg?: unknown
  biologicalSex?: unknown
}

/** Check-ins lidos de `workout_checkins` (quando a tela já os buscou). */
export interface KcalCheckinsLike {
  preCheckin?: unknown
  postCheckin?: unknown
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

const answersOf = (v: unknown): Record<string, unknown> | null => {
  if (!isRecord(v)) return null
  return isRecord(v.answers) ? v.answers : null
}

/** Peso plausível de um adulto; fora disso é dado sujo e vale menos que nada. */
const asBodyWeight = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 20 && n <= 300 ? n : null
}

const asRpe = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null
}

const asSex = (v: unknown): 'male' | 'female' | null => {
  const s = String(v ?? '').toLowerCase().trim()
  return s === 'male' || s === 'female' ? s : null
}

const firstOf = <T,>(candidates: unknown[], parse: (v: unknown) => T | null): T | null => {
  for (const c of candidates) {
    const parsed = parse(c)
    if (parsed !== null) return parsed
  }
  return null
}

/** Candidatos de peso dentro de um registro de check-in (tabela ou embutido). */
const weightCandidates = (checkin: unknown): unknown[] => {
  const rec = isRecord(checkin) ? checkin : null
  const ans = answersOf(checkin)
  return [ans?.body_weight_kg, rec?.weight, rec?.body_weight_kg]
}

/** Candidatos de RPE dentro de um registro de pós-treino. */
const rpeCandidates = (checkin: unknown): unknown[] => {
  const rec = isRecord(checkin) ? checkin : null
  const ans = answersOf(checkin)
  return [ans?.rpe, rec?.rpe]
}

/**
 * Resolve peso, sexo e RPE de uma sessão UMA vez.
 *
 * @param session  JSON da sessão (o `workouts.notes` já parseado). Traz os
 *                 check-ins embutidos — é por isso que a nutrição consegue o RPE
 *                 sem ir ao banco.
 * @param profile  Perfil declarado (`snapshot.profile`). Opcional: sem ele o
 *                 peso ainda sai do check-in da sessão, quando houver.
 * @param checkins Check-ins lidos de `workout_checkins`, quando a tela já os tem
 *                 em mãos (o relatório). Têm precedência sobre os embutidos.
 */
export function sessionKcalInputs(
  session: unknown,
  profile?: KcalProfileLike | null,
  checkins?: KcalCheckinsLike | null,
): SessionKcalInputs {
  const sessionObj = isRecord(session) ? session : {}
  const sessionPre = sessionObj.preCheckin
  const sessionPost = sessionObj.postCheckin

  const bodyWeightKg = firstOf(
    [
      ...weightCandidates(checkins?.preCheckin),
      ...weightCandidates(sessionPre),
      profile?.bodyWeightKg,
    ],
    asBodyWeight,
  )

  const biologicalSex = firstOf([profile?.biologicalSex, sessionObj.biologicalSex], asSex)

  const rpe = firstOf([...rpeCandidates(checkins?.postCheckin), ...rpeCandidates(sessionPost)], asRpe)

  return { [KCAL_INPUTS_MARK]: true, bodyWeightKg, biologicalSex, rpe }
}
