// Iron Rank — níveis por volume total levantado (kg). Fonte ÚNICA de verdade,
// compartilhada por IronRankCard e BadgesGallery (antes duplicada nos dois).
//
// Níveis 9–12 (prestígio) preenchem o vão entre 1M e o ápice: antes o nível
// máximo "Lenda Imortal" ia de 1M direto a 10M e a barra ficava travada por
// muito tempo. Agora há marcos intermediários que mantêm o progresso vivo.

export const IRON_RANK_NAMES = [
  'Iniciante das Ferros',
  'Soldado de Aço',
  'Guerreiro de Ferro',
  'Cavaleiro Blindado',
  'Titã da Força',
  'Senhor das Barras',
  'Mestre Supremo',
  'Lenda Imortal',
  'Titã Colossal',
  'Divindade de Ferro',
  'Soberano do Olimpo',
  'Deus Absoluto',
] as const

// Limite SUPERIOR de cada nível (o "próximo alvo"). O último é a meta-estica do ápice.
export const IRON_RANK_THRESHOLDS = [
  5_000, 20_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
  1_750_000, 3_000_000, 5_500_000, 8_500_000, 15_000_000,
] as const

// Limite INFERIOR de cada nível (onde a barra começa).
export const IRON_RANK_PREV = [
  0, 5_000, 20_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
  1_750_000, 3_000_000, 5_500_000, 8_500_000,
] as const

export const IRON_RANK_MAX_LEVEL = IRON_RANK_NAMES.length // 12

/** Nível (1–12) a partir do volume total levantado. */
export function getIronRankLevel(volumeKg: number): number {
  const vol = Number(volumeKg) || 0
  // As primeiras 11 entradas de THRESHOLDS são fronteiras entre níveis; a 12ª é
  // só a meta-estica do nível máximo.
  for (let i = 0; i < IRON_RANK_THRESHOLDS.length - 1; i += 1) {
    if (vol < IRON_RANK_THRESHOLDS[i]) return i + 1
  }
  return IRON_RANK_MAX_LEVEL
}

export interface IronRankProgress {
  level: number
  name: string
  prevVol: number
  nextVol: number
  progress: number // 0..100
}

/** Nível + nome + faixa + progresso (0–100%) para o volume dado. */
export function getIronRankProgress(volumeKg: number): IronRankProgress {
  const vol = Number(volumeKg) || 0
  const level = getIronRankLevel(vol)
  const nextVol = IRON_RANK_THRESHOLDS[level - 1] ?? IRON_RANK_THRESHOLDS[IRON_RANK_THRESHOLDS.length - 1]
  const prevVol = IRON_RANK_PREV[level - 1] ?? 0
  const span = nextVol - prevVol
  const progress = span > 0 ? Math.min(100, Math.max(0, ((vol - prevVol) / span) * 100)) : 100
  return { level, name: IRON_RANK_NAMES[(level - 1) % IRON_RANK_NAMES.length], prevVol, nextVol, progress }
}
