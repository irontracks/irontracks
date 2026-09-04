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
// "É cardio?" agora é fonte única (antes havia uma cópia com set fechado aqui).
import { isCardioExercise } from '@/utils/exercise/isCardio'
import { metDeEsteira, kcalDoBloco } from '@/lib/cardio/treadmillMet'
import { minutosDeCardioFeitos } from '@/lib/cardio/minutosDeCardio'
export { isCardioExercise }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

const norm = (s: unknown): string =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

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
  fitdance: 7.3,    // aerobic dance class (Compendium: dance aerobic, general)
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

/**
 * A execução do cardio, bloco a bloco.
 *
 * Cardio em BLOCOS (04/09/2026): "30 min na esteira" pode ser 5 min a 4 km/h +
 * 10 min a 5 + 15 min a 6. Cada bloco é uma série concluída, com a PRÓPRIA
 * velocidade e inclinação — e por isso a caloria não pode sair de um MET único
 * aplicado ao tempo somado: subir a velocidade tem que aparecer no gasto.
 *
 * Blocos sem velocidade (todo o histórico anterior a esta data) voltam com
 * `speed: null` e o chamador cai na tabela por modalidade, como sempre foi.
 */
const blocosFeitos = (
  logs: Record<string, unknown>,
  exIdx: number,
): { minutes: number; speed: number | null; incline: number | null }[] => {
  const blocos: { minutes: number; speed: number | null; incline: number | null }[] = []
  for (const [key, raw] of Object.entries(logs)) {
    if (Number(String(key).split('-')[0]) !== exIdx) continue
    if (!isRecord(raw)) continue
    if (raw.done !== true) continue
    const sec = Number(raw.durationSeconds)
    if (!Number.isFinite(sec) || sec <= 0) continue
    const sp = Number(raw.speed)
    const inc = Number(raw.incline)
    blocos.push({
      minutes: sec / 60,
      speed: Number.isFinite(sp) && sp > 0 ? sp : null,
      incline: Number.isFinite(inc) && inc > 0 ? inc : null,
    })
  }
  return blocos
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

  const logs = isRecord(sessionObj.logs) ? sessionObj.logs : {}

  ;(sessionObj.exercises as unknown[]).forEach((ex, idx) => {
    if (!isCardioExercise(ex) || !isRecord(ex)) return
    // Minutos FEITOS, não planejados — ver `cardioMinutesDone`.
    const minutes = minutosDeCardioFeitos(logs, idx, ex)
    if (minutes <= 0) return

    const cfgRaw = Array.isArray(ex.setDetails) && isRecord(ex.setDetails[0])
      ? (ex.setDetails[0] as Record<string, unknown>)
      : null
    const advCfg = cfgRaw && isRecord(cfgRaw.advanced_config) ? (cfgRaw.advanced_config as Record<string, unknown>) : null
    const isHIT = !!advCfg?.isHIT

    const metModalidade = metForCardio(ex.name, ex.rpe, isHIT)

    // Blocos COM velocidade usam as equações do ACSM (velocidade + inclinação);
    // os demais caem no MET da modalidade, que é o comportamento de sempre.
    // Misturar os dois é proposital: um cardio pode ter blocos preenchidos e
    // outros não, e cair inteiro na tabela por causa de um bloco em branco
    // jogaria fora o dado bom dos outros.
    const blocos = blocosFeitos(logs, idx)
    let kcal = 0
    const comVelocidade = blocos.filter(b => b.speed != null)
    if (comVelocidade.length > 0) {
      for (const b of blocos) {
        const metBloco = b.speed != null ? metDeEsteira(b.speed, b.incline) : null
        kcal += metBloco != null
          ? kcalDoBloco(metBloco, bw, b.minutes) * sexFactor
          : metModalidade * bw * (b.minutes / 60) * sexFactor
      }
    } else {
      kcal = metModalidade * bw * (minutes / 60) * sexFactor
    }

    if (Number.isFinite(kcal) && kcal > 0) {
      const rounded = Math.round(kcal)
      totalKcal += rounded
      cardioMinutes += minutes
      perExerciseKcal[idx] = rounded
    }
  })

  return { totalKcal: Math.round(totalKcal), cardioMinutes, perExerciseKcal }
}
