/**
 * MÉTRICAS OFICIAIS da sessão entregues ao Gemini (Coach IA pós-treino).
 *
 * O prompt proíbe o modelo de somar qualquer coisa a partir dos logs: todo
 * agregado citado na narrativa tem que ser copiado literalmente daqui, e o que
 * escapar é descartado por `reconcileAiNarrative`. Logo, este número É o número
 * que o usuário lê no relatório — ele PRECISA ser o mesmo do card, do PDF e do
 * `reportMeta.totals.volumeKg`. Por isso o total sai de `sessionVolumeKg`, a
 * fonte única, e não de uma soma local (foi assim que nasceu a divergência de
 * jul/2026: duas contas paralelas para a mesma sessão).
 *
 * Mora fora do route.ts para poder ser exercitado direto pelo guard de
 * regressão que trava a paridade entre as duas fontes de volume.
 */
import { setVolume, isWorkingSet, sessionVolumeKg } from '@/utils/report/setVolume'

export type AiSessionMetrics = {
  totalVolumeKg: number
  totalSetsDone: number
  totalExercises: number
  topExercises: Array<{ name: string; volumeKg: number }>
}

export const computeAiSessionMetrics = (session: Record<string, unknown>): AiSessionMetrics | null => {
  try {
    const s = session && typeof session === 'object' ? session : {}
    const logs = s?.logs && typeof s.logs === 'object' ? (s.logs as Record<string, unknown>) : {}
    const exercises = Array.isArray(s?.exercises) ? (s.exercises as unknown[]) : []
    const exNameByIdx = new Map<number, string>()
    exercises.forEach((ex: unknown, idx: number) => {
      const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : {}
      const name = String(exObj?.name || '').trim()
      if (!name) return
      exNameByIdx.set(idx, name)
    })

    let setsDone = 0
    const volumeByExIdx = new Map<number, number>()
    const exercisesWithLogs = new Set<number>()

    // Fonte ÚNICA (mesma do volume exibido no relatório): setVolume trata
    // unilateral (L_/R_), cluster e dropset; isWorkingSet filtra aquecimento/feeler
    // e exige série feita. Antes somava só weight×reps do topo → volume subestimado
    // (ex.: 17.650 vs 30.195 reais) e o Coach IA reportava número divergente.
    Object.entries(logs).forEach(([k, log]) => {
      if (!log || typeof log !== 'object') return
      const parts = String(k || '').split('-')
      const exIdx = Number(parts[0])
      if (!Number.isFinite(exIdx)) return
      if (!isWorkingSet(log)) return
      exercisesWithLogs.add(exIdx)
      setsDone += 1
      const vol = setVolume(log)
      if (Number.isFinite(vol) && vol > 0) {
        volumeByExIdx.set(exIdx, (volumeByExIdx.get(exIdx) || 0) + vol)
      }
    })

    const topExercises = Array.from(volumeByExIdx.entries())
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 3)
      .map(([idx, vol]) => ({
        name: exNameByIdx.get(idx) || `Exercício ${idx + 1}`,
        volumeKg: Math.round(Number(vol) || 0),
      }))

    return {
      totalVolumeKg: Math.round(sessionVolumeKg(logs)),
      totalSetsDone: setsDone,
      totalExercises: exercisesWithLogs.size,
      topExercises,
    }
  } catch {
    return null
  }
}
