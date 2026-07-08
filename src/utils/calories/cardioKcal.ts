/**
 * cardioKcal.ts — kcal de exercícios de CARDIO dentro de uma sessão.
 *
 * O modelo de força (`estimateCaloriesMet`) estima o gasto pela densidade de
 * volume (kg/min). Cardio não move carga → densidade ≈ 0 → o modelo o trata
 * como atividade leve (MET 3.5), ignorando modalidade, tempo e intensidade —
 * subestimando corrida/escada/HIT.
 *
 * Este módulo estima o cardio pelo MET DA MODALIDADE (Compendium of Physical
 * Activities, Ainsworth 2011), escalado por intensidade (RPE) e modo HIT:
 *
 *   kcal = MET_modalidade × fatorIntensidade × fatorHIT × peso × horas × fatorSexo
 *
 * É usado em conjunto com o modelo de força: o chamador subtrai os minutos de
 * cardio da duração passada ao modelo de força (pra não contar o mesmo tempo
 * duas vezes) e soma o resultado deste módulo.
 */
import { DEFAULT_BODY_WEIGHT_KG, getSexMultiplier } from './metEstimate'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** Modalidades reconhecidas (bate com CARDIO_OPTIONS do editor). */
const CARDIO_OPTIONS = ['Escada', 'Esteira', 'Bicicleta', 'Bike Outdoor', 'Corrida', 'Caminhada', 'Elíptico'] as const

const norm = (s: unknown): string =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

const CARDIO_OPTION_KEYS = new Set(CARDIO_OPTIONS.map((o) => norm(o)))

/**
 * MET base por modalidade (Compendium 2011, esforço moderado). A intensidade
 * (RPE) escala isso — uma esteira a RPE 3 vira caminhada, a RPE 9 vira corrida.
 */
const CARDIO_MET_BASE: Record<string, number> = {
  caminhada: 3.8,   // walking, 5 km/h
  esteira: 6.0,     // treadmill genérico (escala com intensidade)
  corrida: 9.8,     // running, ~9.7 km/h
  bicicleta: 6.8,   // stationary cycling, moderate
  'bike outdoor': 7.5,
  eliptico: 5.0,    // elliptical trainer, moderate
  escada: 8.0,      // stair-treadmill / stepper
}

const DEFAULT_CARDIO_MET = 6.0

/** Teto de sanidade pra kcal de uma sessão (bate com o cap do /gps/cardio/save). */
export const MAX_SESSION_KCAL = 50_000

/** Clampa uma kcal de sessão em [0, MAX_SESSION_KCAL]; retorna 0 se inválida.
 *  Usado no override do "bike outdoor", que vem do cliente (workouts.notes). */
export const clampSessionKcal = (v: unknown): number => {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(MAX_SESSION_KCAL, Math.round(n))
}

/** True se o exercício é cardio (por type, method ou nome de modalidade). */
export const isCardioExercise = (ex: unknown): boolean => {
  const e = isRecord(ex) ? ex : null
  if (!e) return false
  if (norm(e.type) === 'cardio') return true
  if (norm(e.method) === 'cardio') return true
  return CARDIO_OPTION_KEYS.has(norm(e.name))
}

/**
 * Fator de intensidade a partir do RPE (1-10). RPE 5 = neutro (×1.0);
 * RPE inválido também cai em neutro. Clampado em [0.65, 1.35].
 */
const intensityFactor = (rpe: unknown): number => {
  const n = Number(rpe)
  const r = Number.isFinite(n) && n >= 1 && n <= 10 ? n : 5
  return Math.min(1.35, Math.max(0.65, 0.65 + 0.07 * r))
}

/** MET efetivo de um exercício de cardio. */
export const metForCardio = (name: unknown, rpe: unknown, isHIT: boolean): number => {
  const base = CARDIO_MET_BASE[norm(name)] ?? DEFAULT_CARDIO_MET
  const met = base * intensityFactor(rpe) * (isHIT ? 1.15 : 1)
  return met
}

/** Minutos de cardio de um exercício — usa o campo `reps` (o editor grava o
 *  tempo em minutos ali). Válido entre 1 e 240 min; senão 0. */
const cardioMinutesOf = (ex: Record<string, unknown>): number => {
  const m = Number(ex.reps)
  return Number.isFinite(m) && m >= 1 && m <= 240 ? m : 0
}

export interface CardioKcalOpts {
  bodyWeightKg?: number | null
  biologicalSex?: string | null
}

export interface CardioKcalResult {
  /** Soma das kcal de todos os cardios da sessão (arredondada). */
  totalKcal: number
  /** Soma dos minutos de cardio (pra o chamador descontar do modelo de força). */
  cardioMinutes: number
  /** kcal por índice de exercício (pra rateio no relatório, se preciso). */
  perExerciseKcal: Record<number, number>
}

/**
 * Estima as calorias de cardio de uma sessão (objeto de `workouts.notes`).
 * Retorna zeros quando não há exercício de cardio.
 */
export function estimateCardioKcal(session: unknown, opts: CardioKcalOpts = {}): CardioKcalResult {
  const empty: CardioKcalResult = { totalKcal: 0, cardioMinutes: 0, perExerciseKcal: {} }
  const sessionObj = isRecord(session) ? session : null
  if (!sessionObj || !Array.isArray(sessionObj.exercises)) return empty

  const bwRaw = Number(opts.bodyWeightKg)
  const bw = Number.isFinite(bwRaw) && bwRaw >= 20 && bwRaw <= 300 ? bwRaw : DEFAULT_BODY_WEIGHT_KG
  const sexFactor = getSexMultiplier(String(opts.biologicalSex ?? sessionObj.biologicalSex ?? '').toLowerCase())

  let totalKcal = 0
  let cardioMinutes = 0
  const perExerciseKcal: Record<number, number> = {}

  ;(sessionObj.exercises as unknown[]).forEach((ex, idx) => {
    if (!isCardioExercise(ex) || !isRecord(ex)) return
    const minutes = cardioMinutesOf(ex)
    if (minutes <= 0) return

    const cfgRaw = Array.isArray(ex.setDetails) && isRecord(ex.setDetails[0])
      ? (ex.setDetails[0] as Record<string, unknown>)
      : null
    const advCfg = cfgRaw && isRecord(cfgRaw.advanced_config) ? (cfgRaw.advanced_config as Record<string, unknown>) : null
    const isHIT = !!advCfg?.isHIT

    const met = metForCardio(ex.name, ex.rpe, isHIT)
    const kcal = met * bw * (minutes / 60) * sexFactor
    if (Number.isFinite(kcal) && kcal > 0) {
      const rounded = Math.round(kcal)
      totalKcal += rounded
      cardioMinutes += minutes
      perExerciseKcal[idx] = rounded
    }
  })

  return { totalKcal: Math.round(totalKcal), cardioMinutes, perExerciseKcal }
}
