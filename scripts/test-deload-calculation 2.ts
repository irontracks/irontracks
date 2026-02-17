const DELOAD_HISTORY_SIZE = 6
const DELOAD_RECENT_WINDOW = 3
const DELOAD_STAGNATION_PCT = 0.02
const DELOAD_REGRESSION_PCT = 0.03
const DELOAD_REDUCTION_STABLE = 0.12
const DELOAD_REDUCTION_STAGNATION = 0.15
const DELOAD_REDUCTION_OVERTRAIN = 0.22
const DELOAD_MIN_1RM_FACTOR = 0.5
const DELOAD_REDUCTION_MIN = 0.05
const DELOAD_REDUCTION_MAX = 0.4
const WEIGHT_ROUND_STEP = 0.5

const toNumber = (value) => {
  if (value == null || value === '') return null
  const v = Number(value)
  if (!Number.isFinite(v)) return null
  return v
}

const averageNumbers = (list) => {
  const arr = Array.isArray(list) ? list.filter((v) => Number.isFinite(Number(v))) : []
  if (!arr.length) return null
  const sum = arr.reduce((acc, v) => acc + Number(v), 0)
  return sum / arr.length
}

const clampNumber = (value, min, max) => {
  const v = Number(value)
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

const roundToStep = (value, step) => {
  const v = Number(value)
  if (!Number.isFinite(v)) return 0
  const s = Number(step) || 1
  return Math.round(v / s) * s
}

const estimate1Rm = (weight, reps) => {
  const w = Number(weight)
  const r = Number(reps)
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return null
  return w * (1 + r / 30)
}

const analyzeDeloadHistory = (items) => {
  const ordered = Array.isArray(items) ? items.slice(-DELOAD_HISTORY_SIZE) : []
  const recent = ordered.slice(-DELOAD_RECENT_WINDOW)
  const older = ordered.slice(0, Math.max(0, ordered.length - recent.length))
  const avgRecentVolume = averageNumbers(recent.map((i) => i?.totalVolume).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0))
  const avgOlderVolume = averageNumbers(older.map((i) => i?.totalVolume).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0))
  const avgRecentWeight = averageNumbers(recent.map((i) => i?.avgWeight).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0))
  const avgOlderWeight = averageNumbers(older.map((i) => i?.avgWeight).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0))

  const volumeDelta = avgOlderVolume && avgRecentVolume ? (avgRecentVolume - avgOlderVolume) / avgOlderVolume : null
  const weightDelta = avgOlderWeight && avgRecentWeight ? (avgRecentWeight - avgOlderWeight) / avgOlderWeight : null

  const hasRegression =
    (volumeDelta != null && volumeDelta <= -DELOAD_REGRESSION_PCT) ||
    (weightDelta != null && weightDelta <= -DELOAD_REGRESSION_PCT)
  const hasStagnation =
    (!hasRegression && volumeDelta != null && Math.abs(volumeDelta) <= DELOAD_STAGNATION_PCT) ||
    (!hasRegression && weightDelta != null && Math.abs(weightDelta) <= DELOAD_STAGNATION_PCT)

  const status = hasRegression ? 'overtraining' : hasStagnation ? 'stagnation' : 'stable'
  return { status, volumeDelta, weightDelta }
}

const estimate1RmFromSets = (sets, historyItems) => {
  const candidates = []
  const list = Array.isArray(sets) ? sets : []
  list.forEach((s) => {
    const w = Number(s?.weight ?? 0)
    const r = Number(s?.reps ?? 0)
    const est = estimate1Rm(w, r)
    if (est) candidates.push(est)
  })
  const hist = Array.isArray(historyItems) ? historyItems : []
  hist.forEach((h) => {
    const est = estimate1Rm(h?.topWeight ?? null, h?.avgReps ?? null)
    if (est) candidates.push(est)
  })
  if (!candidates.length) return null
  return Math.max(...candidates)
}

const buildDeloadSuggestion = ({ sets, historyItems }) => {
  const items = Array.isArray(historyItems) ? historyItems : []
  const historyCount = items.length
  const baseWeightFromSets = averageNumbers(sets.map((s) => s?.weight).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0))
  const baseWeightFromHistory = averageNumbers(items.map((i) => i?.avgWeight).filter((v) => Number.isFinite(Number(v)) && Number(v) > 0))
  const baseWeight = baseWeightFromSets ?? baseWeightFromHistory ?? null
  if (!baseWeight || !Number.isFinite(Number(baseWeight)) || Number(baseWeight) <= 0) {
    return { ok: false, error: 'Sem peso suficiente para calcular deload.' }
  }
  const analysis = analyzeDeloadHistory(items)
  const targetReduction =
    analysis.status === 'overtraining'
      ? DELOAD_REDUCTION_OVERTRAIN
      : analysis.status === 'stagnation'
        ? DELOAD_REDUCTION_STAGNATION
        : DELOAD_REDUCTION_STABLE
  const est1rm = estimate1RmFromSets(sets, items)
  const minWeight = est1rm ? est1rm * DELOAD_MIN_1RM_FACTOR : 0
  const rawSuggested = baseWeight * (1 - targetReduction)
  const suggestedWeight = roundToStep(Math.max(rawSuggested, minWeight || 0), WEIGHT_ROUND_STEP)
  const appliedReduction = baseWeight > 0 ? clampNumber(1 - suggestedWeight / baseWeight, 0, 1) : targetReduction
  return {
    ok: true,
    baseWeight,
    suggestedWeight,
    appliedReduction,
    targetReduction,
    historyCount,
    minWeight,
    analysis,
  }
}

const applyReductionToWeight = ({ baseWeight, pct, minWeight }) => {
  const p = clampNumber(Number(pct), DELOAD_REDUCTION_MIN, DELOAD_REDUCTION_MAX)
  const suggestedRaw = baseWeight * (1 - p)
  const suggestedWeight = roundToStep(Math.max(suggestedRaw, minWeight || 0), WEIGHT_ROUND_STEP)
  return suggestedWeight
}

const approxEqual = (a, b, eps = 0.01) => Math.abs(a - b) <= eps

const assert = (cond, msg) => {
  if (!cond) {
    throw new Error(msg)
  }
}

const run = () => {
  const historyStable = [
    { avgWeight: 95, avgReps: 8, totalVolume: 900, topWeight: 110 },
    { avgWeight: 96, avgReps: 8, totalVolume: 1000, topWeight: 110 },
    { avgWeight: 105, avgReps: 8, totalVolume: 1100, topWeight: 112 },
    { avgWeight: 106, avgReps: 8, totalVolume: 1200, topWeight: 112 },
  ]
  const setsStable = [
    { weight: 100, reps: 8 },
    { weight: 100, reps: 8 },
  ]
  const stable = buildDeloadSuggestion({ sets: setsStable, historyItems: historyStable })
  assert(stable.ok, 'stable should be ok')
  assert(stable.analysis.status === 'stable', 'stable status expected')
  assert(approxEqual(stable.suggestedWeight, 88), 'stable suggested weight')

  const historyStagnation = [
    { avgWeight: 100, avgReps: 8, totalVolume: 1000, topWeight: 110 },
    { avgWeight: 100, avgReps: 8, totalVolume: 1005, topWeight: 110 },
    { avgWeight: 100, avgReps: 8, totalVolume: 1000, topWeight: 110 },
    { avgWeight: 100, avgReps: 8, totalVolume: 1001, topWeight: 110 },
  ]
  const stagnation = buildDeloadSuggestion({ sets: setsStable, historyItems: historyStagnation })
  assert(stagnation.ok, 'stagnation should be ok')
  assert(stagnation.analysis.status === 'stagnation', 'stagnation status expected')
  assert(approxEqual(stagnation.suggestedWeight, 85), 'stagnation suggested weight')

  const historyRegression = [
    { avgWeight: 100, avgReps: 8, totalVolume: 1200, topWeight: 112 },
    { avgWeight: 100, avgReps: 8, totalVolume: 1180, topWeight: 112 },
    { avgWeight: 96, avgReps: 8, totalVolume: 1080, topWeight: 110 },
    { avgWeight: 95, avgReps: 8, totalVolume: 1080, topWeight: 110 },
  ]
  const regression = buildDeloadSuggestion({ sets: setsStable, historyItems: historyRegression })
  assert(regression.ok, 'regression should be ok')
  assert(regression.analysis.status === 'overtraining', 'overtraining status expected')
  assert(approxEqual(regression.suggestedWeight, 78), 'overtraining suggested weight')

  const clamped = applyReductionToWeight({ baseWeight: 100, pct: 0.4, minWeight: 70 })
  assert(approxEqual(clamped, 70), 'min weight clamp expected')

  console.log('OK: deload calculation tests passed')
}

run()

