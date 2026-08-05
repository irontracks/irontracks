/**
 * plateInventory — decomposição de carga em anilhas a partir do inventário REAL do usuário.
 *
 * Motivação: `plateMath.ts` resolve o *incremento* teórico por equipamento (barra → 2,5 kg),
 * mas assume estoque infinito. Quem treina em casa não tem: com 6 anilhas de 20 kg e 2 de
 * 10 kg o menor salto real é de 20 em 20, e uma sugestão de "82,5 kg" é impossível de montar.
 * Este módulo responde duas perguntas que o incremento sozinho não responde:
 *   1. "Quero 80 kg — quais anilhas ponho de cada lado?"
 *   2. "Quais cargas eu CONSIGO montar com o que tenho?"
 *
 * Regras de domínio que moldam o algoritmo:
 * - **Anilha se usa aos PARES** (uma de cada lado da barra). 6 unidades de 20 kg = 3 pares;
 *   a 7ª unidade seria carga morta. O usuário conta unidades (é o que ele vê no chão), o
 *   cálculo usa pares — a conversão é responsabilidade daqui, nunca do usuário.
 * - **Guloso NÃO serve.** Alvo de 30 kg/lado com pares {25, 20, 10}: o guloso pega 25, sobra
 *   5 e encalha — mas 20+10 resolve exato. Por isso a decomposição é subset-sum exato (DP
 *   com multiplicidade limitada), não "pega sempre a maior".
 * - **Nunca inventar peso impossível.** Quando o alvo não fecha exato, devolvemos os vizinhos
 *   montáveis (abaixo/acima) para a UI oferecer escolha — mesmo viés de segurança do
 *   `plateMath` (na dúvida, para baixo).
 *
 * Aritmética em QUARTOS DE KG (inteiros) — anilhas comerciais são múltiplos de 0,25 kg e
 * somar float acumula ruído (0,1+0,2). Toda a DP roda em inteiros; só a fronteira converte.
 */

/** Valores de anilha (kg) comuns no mercado brasileiro, na ordem em que a UI os lista. */
export const DEFAULT_PLATE_VALUES = [1.25, 2, 2.5, 5, 10, 15, 20, 25] as const

/** Pesos de barra oferecidos como atalho na UI (kg). */
export const COMMON_BAR_WEIGHTS = [20, 15, 10] as const

export interface PlateInventory {
  /**
   * valor da anilha (kg) → quantidade de **unidades** possuídas.
   * Unidades, não pares: é como o usuário conta ("tenho 6 de 20").
   */
  counts: Record<string, number>
  /** Peso da barra em kg. */
  barWeightKg: number
}

/**
 * Default = academia completa. Quantidades altas o bastante para que o inventário
 * NUNCA seja o fator limitante de quem treina em academia — assim o recurso não
 * atrapalha quem não quer cadastrar nada.
 */
export const DEFAULT_GYM_INVENTORY: PlateInventory = {
  counts: { '1.25': 8, '2': 8, '2.5': 8, '5': 8, '10': 8, '15': 8, '20': 12, '25': 8 },
  barWeightKg: 20,
}

const QUARTER = 4
const toQ = (kg: number): number => Math.round(kg * QUARTER)
const fromQ = (q: number): number => Math.round((q / QUARTER) * 100) / 100

/** Teto de segurança da DP (kg por lado). Impede varredura absurda com input corrompido. */
const MAX_PER_SIDE_KG = 500

export interface PairInfo {
  /** Valor da anilha em kg. */
  plate: number
  /** Pares completos disponíveis (unidades ÷ 2, arredondado para baixo). */
  pairs: number
  /** `true` quando sobra uma unidade ímpar — inutilizável numa barra. */
  hasOddLeftover: boolean
}

/**
 * Converte o inventário em pares utilizáveis, do mais pesado para o mais leve.
 * Entrada inválida (NaN, negativo, valor não numérico) é descartada — nunca lança.
 */
export function pairsAvailable(inv: PlateInventory | null | undefined): PairInfo[] {
  const counts = inv?.counts && typeof inv.counts === 'object' ? inv.counts : {}
  const out: PairInfo[] = []
  for (const [rawPlate, rawCount] of Object.entries(counts)) {
    const plate = Number(rawPlate)
    const units = Math.floor(Number(rawCount))
    if (!Number.isFinite(plate) || plate <= 0) continue
    if (!Number.isFinite(units) || units <= 0) continue
    const pairs = Math.floor(units / 2)
    if (pairs <= 0) {
      // Uma unidade solta não monta barra, mas a UI precisa avisar que ela existe
      // e está sobrando — senão o usuário acha que o app "perdeu" a anilha dele.
      if (units > 0) out.push({ plate, pairs: 0, hasOddLeftover: true })
      continue
    }
    out.push({ plate, pairs, hasOddLeftover: units % 2 === 1 })
  }
  return out.sort((a, b) => b.plate - a.plate)
}

/** Peso da barra saneado (0 quando ausente/inválido — permite halteres/carga sem barra). */
export function barWeightOf(inv: PlateInventory | null | undefined): number {
  const bar = Number(inv?.barWeightKg)
  return Number.isFinite(bar) && bar >= 0 ? bar : 0
}

interface ReachTable {
  /** `reach[q] === 1` quando a soma `q` (quartos de kg) é montável de um lado. */
  reach: Uint8Array
  /** Anilha (em quartos) que fechou a soma `q` pela primeira vez. -1 = inalcançável. */
  fromPlate: Int32Array
  /** Soma anterior na cadeia de reconstrução. */
  fromSum: Int32Array
  maxQ: number
}

/**
 * Bounded knapsack: marca toda soma alcançável por lado e guarda a cadeia de reconstrução.
 *
 * Cada soma é gravada UMA única vez (na primeira anilha que a alcança), então seguir
 * `fromPlate`/`fromSum` de trás para frente sempre termina em 0 sem ciclo.
 */
function buildReachTable(pairs: PairInfo[]): ReachTable {
  const totalKg = pairs.reduce((acc, p) => acc + p.plate * p.pairs, 0)
  const maxQ = Math.min(toQ(totalKg), toQ(MAX_PER_SIDE_KG))
  const reach = new Uint8Array(maxQ + 1)
  const fromPlate = new Int32Array(maxQ + 1).fill(-1)
  const fromSum = new Int32Array(maxQ + 1).fill(-1)
  reach[0] = 1

  for (const { plate, pairs: available } of pairs) {
    if (available <= 0) continue
    const plateQ = toQ(plate)
    if (plateQ <= 0 || plateQ > maxQ) continue
    // `used[s]` = quantos pares DESTA anilha foram gastos para alcançar `s`.
    // É o que limita a multiplicidade (sem isso viraria knapsack ilimitado).
    const used = new Int32Array(maxQ + 1)
    for (let s = plateQ; s <= maxQ; s++) {
      if (reach[s]) continue // já alcançável sem esta anilha — não gasta par
      const prev = s - plateQ
      if (!reach[prev] || used[prev] >= available) continue
      reach[s] = 1
      used[s] = used[prev] + 1
      fromPlate[s] = plateQ
      fromSum[s] = prev
    }
  }

  return { reach, fromPlate, fromSum, maxQ }
}

/** Reconstrói a lista de anilhas (kg, decrescente) que soma `q` de um lado. */
function reconstruct(table: ReachTable, q: number): number[] {
  const out: number[] = []
  let cur = q
  let guard = 0
  while (cur > 0 && guard++ < 512) {
    const plateQ = table.fromPlate[cur]
    if (plateQ <= 0) break
    out.push(fromQ(plateQ))
    cur = table.fromSum[cur]
  }
  return out.sort((a, b) => b - a)
}

export interface Decomposition {
  /** `true` quando o alvo fecha EXATO com o inventário. */
  exact: boolean
  /** Anilhas de UM lado, da mais pesada para a mais leve. Vazio quando só a barra. */
  perSide: number[]
  /** Total efetivamente montado (barra + 2 × lado). Igual ao alvo quando `exact`. */
  total: number
  /** Maior total montável ≤ alvo (null se nem a barra cabe). */
  below: number | null
  /** Menor total montável ≥ alvo (null se o alvo excede tudo que há). */
  above: number | null
  /** Peso da barra considerado. */
  barWeightKg: number
}

/**
 * Decompõe um peso-alvo em anilhas por lado.
 *
 * Sempre devolve os vizinhos montáveis (`below`/`above`) — inclusive quando o alvo fecha
 * exato — para a UI poder oferecer "próximo acima/abaixo" sem uma segunda chamada.
 * `perSide` corresponde a `total`: quando não há solução exata, mostra a montagem do
 * vizinho de baixo (viés de segurança: nunca sugere mais peso do que o usuário pediu).
 */
export function decompose(targetKg: number, inv: PlateInventory | null | undefined): Decomposition {
  const bar = barWeightOf(inv)
  const pairs = pairsAvailable(inv)
  const table = buildReachTable(pairs)

  const empty: Decomposition = {
    exact: false, perSide: [], total: bar, below: null, above: null, barWeightKg: bar,
  }
  if (!Number.isFinite(targetKg) || targetKg < 0) return empty

  // Alvo abaixo da barra: nada a montar. A barra nua é o menor total possível.
  const perSideTargetQ = (toQ(targetKg) - toQ(bar)) / 2
  if (perSideTargetQ < 0) {
    return { ...empty, exact: false, total: bar, below: null, above: bar }
  }

  const totalOf = (q: number): number => fromQ(toQ(bar) + q * 2)

  // Alvo com fração ímpar de quarto (ex.: 21,25 kg numa barra de 20 → 0,625/lado) não é
  // representável por par nenhum. Cai direto na busca por vizinhos.
  const exactQ = Number.isInteger(perSideTargetQ) ? perSideTargetQ : -1

  let below: number | null = null
  let above: number | null = null
  const ceilQ = Math.ceil(perSideTargetQ)
  const floorQ = Math.floor(perSideTargetQ)
  for (let q = Math.min(floorQ, table.maxQ); q >= 0; q--) {
    if (table.reach[q]) { below = totalOf(q); break }
  }
  for (let q = Math.max(ceilQ, 0); q <= table.maxQ; q++) {
    if (table.reach[q]) { above = totalOf(q); break }
  }

  if (exactQ >= 0 && exactQ <= table.maxQ && table.reach[exactQ]) {
    return {
      exact: true,
      perSide: reconstruct(table, exactQ),
      total: totalOf(exactQ),
      below,
      above,
      barWeightKg: bar,
    }
  }

  // Sem solução exata → mostra a montagem do vizinho de BAIXO (nunca empurra peso a mais).
  const fallbackQ = below != null ? (toQ(below) - toQ(bar)) / 2 : 0
  return {
    exact: false,
    perSide: below != null ? reconstruct(table, fallbackQ) : [],
    total: below ?? bar,
    below,
    above,
    barWeightKg: bar,
  }
}

/**
 * Todas as cargas montáveis, em ordem crescente, começando pela barra nua.
 * `limit` corta a lista (a UI só mostra as primeiras como prova de que o cadastro funcionou).
 */
export function loadableTotals(inv: PlateInventory | null | undefined, limit = 64): number[] {
  const bar = barWeightOf(inv)
  const table = buildReachTable(pairsAvailable(inv))
  const out: number[] = []
  for (let q = 0; q <= table.maxQ && out.length < limit; q++) {
    if (table.reach[q]) out.push(fromQ(toQ(bar) + q * 2))
  }
  return out
}

/**
 * Menor salto real entre duas cargas consecutivas montáveis (kg), ou `null` quando não há
 * nem um par disponível. É o número que explica ao usuário por que o app parou de sugerir
 * cargas quebradas: com 3 pares de 20 e 1 de 10, o menor salto é 20 kg — não 2,5.
 */
export function minStepKg(inv: PlateInventory | null | undefined): number | null {
  const totals = loadableTotals(inv, 256)
  if (totals.length < 2) return null
  let min = Infinity
  for (let i = 1; i < totals.length; i++) {
    const step = totals[i] - totals[i - 1]
    if (step > 0 && step < min) min = step
  }
  return Number.isFinite(min) ? Math.round(min * 100) / 100 : null
}

/** `true` quando o usuário mexeu no inventário (≠ default de academia). */
export function isCustomInventory(inv: PlateInventory | null | undefined): boolean {
  if (!inv || typeof inv !== 'object') return false
  if (barWeightOf(inv) !== DEFAULT_GYM_INVENTORY.barWeightKg) return true
  const a = inv.counts ?? {}
  const b = DEFAULT_GYM_INVENTORY.counts
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if (Number(a[k] ?? 0) !== Number(b[k] ?? 0)) return true
  }
  return false
}

/**
 * O inventário a partir das `settings` do usuário.
 *
 * Fonte ÚNICA da derivação: ela nasceu inline no `ExerciseCard` e passou a ser
 * necessária também nos renderers de série (a dica "por lado" abaixo do campo de
 * peso). Duas cópias divergiriam no dia em que o default mudasse — e o sintoma
 * seria a calculadora e a dica discordando sobre as MESMAS anilhas.
 *
 * Inventário vazio = academia completa: ninguém é obrigado a cadastrar nada para
 * a conta funcionar; só quem treina em casa ajusta.
 */
export function inventoryFromSettings(settings: unknown): PlateInventory {
  const s = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : null
  const raw = s?.plateInventory
  const counts = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, number>)
    : null
  const bar = Number(s?.barWeightKg)
  return {
    counts: counts && Object.keys(counts).length > 0 ? counts : DEFAULT_GYM_INVENTORY.counts,
    barWeightKg: Number.isFinite(bar) && bar >= 0 ? bar : DEFAULT_GYM_INVENTORY.barWeightKg,
  }
}
