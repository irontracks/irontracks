/**
 * plateBreakdown — traduz o peso sugerido pelo autoload em "quantas anilhas por lado".
 *
 * Motivação (pedido do dono, jul/2026): no leg press 45° o motor sugere 325 kg e o
 * aluno tem que fazer a conta de cabeça na hora de montar. A dica resolve isso:
 * "8×20 + 1×2,5 por lado".
 *
 * Regras de escopo — a dica só aparece quando dá pra acertar SEM adivinhar:
 * - Barra livre: desconta 20 kg (barra olímpica) e divide o resto em dois lados.
 * - Máquina de anilha (leg press, hack, pendular): o número digitado é a SOMA das
 *   anilhas, sem o carro (convenção confirmada com o dono) → divide direto por 2.
 * - Smith: NÃO mostra. A barra guiada pesa de 7 a 20 kg dependendo do aparelho —
 *   qualquer suposição erraria a conta e uma dica errada é pior que dica nenhuma.
 * - Máquina de pino, cabo, halteres, elástico, peso corporal: não se aplica.
 * - T-bar/remada cavalinho: as anilhas entram todas na MESMA ponta, não por lado.
 *
 * Kit de anilhas default: 20/10/5/2,5/1,25 kg (academia do dono; sem as de 15).
 */

import { inferEquipmentFromName } from './equipmentFromName'

/** Anilhas disponíveis, da mais pesada para a mais leve (kg). */
export const DEFAULT_PLATES: readonly number[] = [20, 10, 5, 2.5, 1.25]

/** Barra olímpica padrão. */
export const OLYMPIC_BAR_KG = 20

export interface PlateLoadout {
  /** Anilhas de UM lado, da mais pesada para a mais leve. */
  perSide: Array<{ plate: number; count: number }>
  /** Peso por lado que o kit não consegue montar (kg). 0 quando fecha exato. */
  leftoverKg: number
  /** Peso da barra descontado do total (0 em máquina de anilha). */
  barKg: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Decompõe o peso total em anilhas por lado (guloso — kit padrão é canônico, então
 * guloso é ótimo). Devolve `null` quando não há o que montar (peso ≤ barra, valor
 * inválido) — o consumidor simplesmente não mostra a dica.
 */
export function planPlatesPerSide(
  totalKg: number,
  opts?: { barKg?: number; plates?: readonly number[] },
): PlateLoadout | null {
  if (!Number.isFinite(totalKg)) return null
  const barKg = Number.isFinite(opts?.barKg) ? Number(opts?.barKg) : OLYMPIC_BAR_KG
  const plates = (opts?.plates ?? DEFAULT_PLATES).filter((p) => Number.isFinite(p) && p > 0).slice().sort((a, b) => b - a)
  if (plates.length === 0) return null

  const load = round2(totalKg - barKg)
  if (load <= 0) return null

  let remaining = round2(load / 2)
  if (remaining < plates[plates.length - 1]!) return null // nem a anilha mais leve entra

  const perSide: Array<{ plate: number; count: number }> = []
  for (const plate of plates) {
    const count = Math.floor(round2(remaining) / plate)
    if (count > 0) {
      perSide.push({ plate, count })
      remaining = round2(remaining - count * plate)
    }
  }
  if (perSide.length === 0) return null

  return { perSide, leftoverKg: round2(remaining), barKg }
}

const fmtKg = (n: number) => String(n).replace('.', ',')

/**
 * "8×20 + 1×2,5 por lado". Prefixo "≈" quando sobra peso que o kit não monta.
 */
export function formatPlateLoadout(loadout: PlateLoadout | null): string {
  if (!loadout || loadout.perSide.length === 0) return ''
  const body = loadout.perSide.map((p) => `${p.count}×${fmtKg(p.plate)}`).join(' + ')
  const prefix = loadout.leftoverKg > 0 ? '≈ ' : ''
  return `${prefix}${body} por lado`
}

/**
 * Máquinas de anilha (plate-loaded) reconhecidas pelo nome. Lista deliberadamente
 * ESTREITA: incluir uma máquina de pino aqui faria o app mandar montar anilhas num
 * aparelho que não tem onde encaixá-las.
 */
const PLATE_LOADED_MACHINE = /leg ?press|\bhack\b|pendular|v-? ?squat|agachamento articulad/

/** Anilhas numa ponta só — a conta "por lado" não se aplica. */
const SINGLE_END_LOADED = /cavalinho|t-? ?bar|landmine/

const norm = (s: string): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Dica pronta para a UI a partir do nome do exercício + peso sugerido.
 * `null` quando o exercício não é de anilha (ou não dá pra afirmar com segurança).
 */
export function plateHintForExercise(
  exerciseName: string | null | undefined,
  weightKg: number | null | undefined,
  opts?: { plates?: readonly number[] },
): string | null {
  const kg = typeof weightKg === 'number' ? weightKg : Number(String(weightKg ?? '').replace(',', '.'))
  if (!Number.isFinite(kg) || kg <= 0) return null

  const name = norm(exerciseName ?? '')
  if (!name.trim()) return null
  if (SINGLE_END_LOADED.test(name)) return null

  const slugs = inferEquipmentFromName(exerciseName ?? '')
  if (slugs.includes('smith')) return null

  let barKg: number | null = null
  if (slugs.includes('barra')) barKg = OLYMPIC_BAR_KG
  else if (PLATE_LOADED_MACHINE.test(name)) barKg = 0 // peso digitado = só as anilhas

  if (barKg === null) return null

  return formatPlateLoadout(planPlatesPerSide(kg, { barKg, plates: opts?.plates })) || null
}
