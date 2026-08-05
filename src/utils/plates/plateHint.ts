/**
 * plateHint — "quantas anilhas de cada lado" para o peso que o usuário DIGITOU.
 *
 * Pedido do dono (04/08/2026): "eu coloco 260 e abaixo ele fala quantas anilhas
 * cada lado", em toda máquina/exercício de anilha — não só quando o autoload
 * sugere o peso.
 *
 * Já existiam duas peças, e nenhuma servia sozinha:
 *  - `autoload/plateBreakdown.plateHintForExercise` decide bem QUANDO faz sentido
 *    mostrar, mas monta com um kit FIXO (20/10/5/2,5/1,25) e só é chamada com o
 *    peso do motor de autoload;
 *  - `plates/plateInventory.decompose` monta com o inventário REAL do usuário e
 *    faz subset-sum exato (guloso encalha: alvo 30/lado com {25,20,10} pega 25 e
 *    sobra 5, quando 20+10 fecha), mas não sabe se o exercício tem anilha.
 *
 * Este módulo é a junção: a REGRA de elegibilidade daqui, a MATEMÁTICA do
 * `decompose`. Não duplica nenhuma das duas.
 *
 * Por que o inventário importa: o dono tem 5, 10 e 20 kg cadastrados. O kit fixo
 * sugeriria anilhas de 2,5 e 1,25 que ele não possui — uma dica que não dá para
 * executar é pior que dica nenhuma (mesma regra do motor de troca de alimento).
 */

import { plateKindOf } from '@/utils/autoload/plateBreakdown'
import { decompose, type PlateInventory } from '@/utils/plates/plateInventory'

export type PlateHintKind = 'barbell' | 'plate_machine'

export interface PlateHint {
  /** Anilhas de UM lado, da mais pesada para a mais leve. */
  perSide: number[]
  /** `true` quando o inventário fecha o alvo exato. */
  exact: boolean
  /** Total realmente montável (igual ao alvo quando `exact`). */
  total: number
  /** Peso da barra descontado (0 em máquina de anilha). */
  barKg: number
  kind: PlateHintKind
}

/** "2×20 + 1×10" a partir da lista por lado. Vazio quando não há anilha. */
export function formatPerSide(perSide: readonly number[]): string {
  if (!perSide.length) return ''
  const counts = new Map<number, number>()
  for (const p of perSide) counts.set(p, (counts.get(p) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([plate, n]) => `${n}×${String(plate).replace('.', ',')}`)
    .join(' + ')
}

/**
 * A dica para este exercício e este peso, ou `null` quando não se aplica.
 *
 * `null` é a resposta certa — e frequente — em: máquina de pino, cabo, halteres,
 * elástico, peso corporal, Smith (a barra guiada pesa de 7 a 20 kg conforme o
 * aparelho; qualquer suposição erraria) e T-bar/landmine (anilhas na mesma ponta,
 * "por lado" não existe).
 */
export function plateHintFor(
  exerciseName: string | null | undefined,
  weightKg: number | string | null | undefined,
  inventory: PlateInventory | null | undefined,
): PlateHint | null {
  const kind = plateKindOf(exerciseName)
  if (!kind) return null

  const kg = typeof weightKg === 'number'
    ? weightKg
    : Number(String(weightKg ?? '').replace(',', '.').trim())
  if (!Number.isFinite(kg) || kg <= 0) return null

  /*
   * Em máquina de anilha o número digitado é a SOMA das anilhas, sem o carro
   * (convenção já firmada com o dono em `plateBreakdown`). O `decompose` sempre
   * desconta a barra do inventário, então aqui ela é zerada.
   */
  const barKg = kind === 'barbell' ? barOf(inventory) : 0
  const inv: PlateInventory = {
    counts: inventory?.counts ?? {},
    barWeightKg: barKg,
  }

  const d = decompose(kg, inv)
  if (!d.perSide.length) return null

  return { perSide: d.perSide, exact: d.exact, total: d.total, barKg: d.barWeightKg, kind }
}

const barOf = (inv: PlateInventory | null | undefined): number => {
  const n = Number(inv?.barWeightKg)
  return Number.isFinite(n) && n > 0 ? n : 20
}

/** Reexportado para quem precisa da regra sem o cálculo (ex.: mostrar o botão). */
export { plateKindOf }
