/**
 * plateMath — resolução de incremento mínimo de carga por equipamento.
 *
 * Motivação: o motor de auto-regulação de carga (autoload) precisa arredondar
 * o peso sugerido para um valor que o usuário CONSEGUE montar na prática. Sem
 * isso o motor sugere "42,3 kg" numa máquina que só anda de 5 em 5 — parece bug.
 *
 * Fonte da verdade do equipamento: `exercise_library.equipment` (string[]), com
 * slugs em pt-BR (ver vocabulário real do catálogo abaixo). Os incrementos são
 * defaults sensatos e conservadores — podem ser sobrescritos por exercício no
 * futuro (coluna dedicada), mas nunca devem SUGERIR um peso impossível de montar.
 *
 * Regra de segurança: quando em dúvida, arredondar PARA BAIXO (nunca empurrar
 * mais peso do que o usuário pediu/aguenta).
 */

export type EquipmentClass =
  | 'barbell' // barra, smith, barra_trap — anilhas por lado
  | 'dumbbell' // halteres — passo por haltere
  | 'machine' // maquina — pino/placas
  | 'cable' // cabo — pino
  | 'bodyweight' // peso corporal (+ carga adicional opcional)
  | 'band' // elástico — resistência, não é kg
  | 'default' // desconhecido / sem equipamento resolvido

export interface IncrementInfo {
  /** Incremento mínimo em kg aplicável ao valor que o usuário digita no campo de peso. */
  increment: number
  /** Classe do equipamento que determinou o incremento. */
  equipmentClass: EquipmentClass
  /**
   * Se o peso é o eixo de progressão. `false` para elástico (resistência) e para
   * exercícios de peso corporal puro — nesses a progressão é por reps, não por kg,
   * e o motor não deve arredondar/prescrever carga.
   */
  loadBearing: boolean
}

/**
 * Incremento (kg) por classe de equipamento. Defaults conservadores para academias
 * brasileiras. Valor = quanto muda no NÚMERO que o usuário digita:
 * - barra: anilhas de 1,25 kg por lado ⇒ passo total de 2,5 kg
 * - halteres: passo típico de 2 kg por haltere (o campo registra o peso de UM haltere)
 * - máquina/cabo: stack de pino costuma andar de 5 em 5 kg
 */
const INCREMENT_BY_CLASS: Record<EquipmentClass, number> = {
  barbell: 2.5,
  dumbbell: 2,
  machine: 5,
  cable: 5,
  bodyweight: 2.5, // usado só quando há carga adicional (cinto/colete); progressão real é por reps
  band: 0, // resistência não é kg
  default: 2.5,
}

/** slug do catálogo → classe de equipamento. Slugs não mapeados caem em `default`. */
const SLUG_TO_CLASS: Record<string, EquipmentClass> = {
  barra: 'barbell',
  smith: 'barbell',
  barra_trap: 'barbell',
  halteres: 'dumbbell',
  maquina: 'machine',
  cabo: 'cable',
  peso_corporal: 'bodyweight',
  barra_fixa: 'bodyweight',
  paralelas: 'bodyweight',
  trx: 'bodyweight',
  ab_wheel: 'bodyweight',
  elastico: 'band',
}

/**
 * Acessórios que NÃO determinam o incremento de carga — são superfícies/apoios.
 * Ex.: um supino com halteres vem como ["halteres","banco"] → o passo é do haltere.
 */
const ACCESSORY_SLUGS = new Set<string>(['banco'])

/**
 * Prioridade ao resolver múltiplos equipamentos: a classe que melhor define o passo
 * de carga ganha. Barra/haltere/máquina/cabo mandam antes de peso corporal/elástico.
 */
const CLASS_PRIORITY: EquipmentClass[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band']

const normalizeSlug = (raw: string): string => raw.trim().toLowerCase().replace(/[\s-]+/g, '_')

/**
 * Resolve o incremento de carga a partir do array `equipment` do exercício.
 * Nunca lança — entrada inválida/vazia cai em `default` (2,5 kg, load-bearing).
 */
export function resolveIncrement(equipment: readonly string[] | null | undefined): IncrementInfo {
  const slugs = Array.isArray(equipment)
    ? equipment.map((e) => (typeof e === 'string' ? normalizeSlug(e) : '')).filter((s) => s.length > 0)
    : []

  const classes = slugs
    .filter((s) => !ACCESSORY_SLUGS.has(s))
    .map((s) => SLUG_TO_CLASS[s])
    .filter((c): c is EquipmentClass => c !== undefined)

  if (classes.length === 0) {
    return { increment: INCREMENT_BY_CLASS.default, equipmentClass: 'default', loadBearing: true }
  }

  const chosen =
    CLASS_PRIORITY.find((c) => classes.includes(c)) ?? 'default'

  return {
    increment: INCREMENT_BY_CLASS[chosen],
    equipmentClass: chosen,
    loadBearing: chosen !== 'band' && chosen !== 'bodyweight',
  }
}

export type RoundDirection = 'nearest' | 'down' | 'up'

/**
 * Arredonda um peso para o múltiplo do incremento montável.
 * Default `down` — viés de segurança do motor (nunca sugere mais do que dá pra montar).
 * Se `increment <= 0` (ex.: elástico) devolve o valor original sem arredondar.
 */
export function roundToIncrement(weight: number, increment: number, direction: RoundDirection = 'down'): number {
  if (!Number.isFinite(weight)) return 0
  if (!Number.isFinite(increment) || increment <= 0) return weight
  const ratio = weight / increment
  const steps = direction === 'up' ? Math.ceil(ratio) : direction === 'nearest' ? Math.round(ratio) : Math.floor(ratio)
  const rounded = steps * increment
  // Evita ruído de ponto flutuante (ex.: 0.1 + 0.2). Incrementos são múltiplos de 0,25.
  return Math.round(rounded * 100) / 100
}

/**
 * Atalho: arredonda um peso sugerido direto a partir do equipamento do exercício.
 * Para equipamento não load-bearing (elástico/peso corporal), devolve o peso como veio.
 */
export function roundSuggestedWeight(
  weight: number,
  equipment: readonly string[] | null | undefined,
  direction: RoundDirection = 'down',
): number {
  const info = resolveIncrement(equipment)
  if (!info.loadBearing) return Number.isFinite(weight) ? weight : 0
  return roundToIncrement(weight, info.increment, direction)
}
