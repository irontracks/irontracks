/**
 * metEstimate.ts — V3 Multi-Factor Calorie Estimation
 *
 * Scientifically calibrated for resistance training using validated
 * MET values from the Compendium of Physical Activities (Ainsworth 2011).
 *
 * ## Validated calorie ranges for resistance training:
 *  - 45 min, light arms (male 80kg):    200–300 kcal
 *  - 60 min, moderate full-body:         350–500 kcal
 *  - 75 min, vigorous leg day:           450–600 kcal
 *  - 90 min, very intense compounds:     500–700 kcal
 *
 * ## Multi-factor inputs:
 *  1. Duration (execution time + rest time)
 *  2. Body weight
 *  3. Biological sex (male/female)
 *  4. Training volume & density (total weight / active minutes)
 *  5. Training style detection (strength/hypertrophy/endurance/circuit)
 *  6. Exercise complexity (compound vs isolation, muscle group size)
 *  7. RPE (Rate of Perceived Exertion)
 *  8. EPOC (post-exercise oxygen consumption, conservative)
 *
 * ## Formula:
 *  kcal = baseMET × styleFactor × complexityFactor × bodyWeight × activeHours × rpeFactor × sexFactor
 *       + MET_REST × bodyWeight × restHours × sexFactor
 *  then × epocFactor
 *
 * Base MET is selected from training density (volume per active minute).
 * All multipliers are conservative (0.85 – 1.10) to stay within validated ranges.
 */

type AnyObj = Record<string, unknown>

// ── MET constants (Compendium of Physical Activities 2011) ─────────────────
/** Light resistance training (stretching, warm-up sets, bodyweight) */
export const MET_LIGHT = 3.5
/** Moderate resistance training (standard hypertrophy work) */
export const MET_MODERATE = 5.0
/** Vigorous resistance training (heavy compounds, high density) */
export const MET_VIGOROUS = 6.0
/** Rest between sets (sitting/standing, light activity) */
export const MET_REST = 1.5

/** Default body weight (kg) when not available from user data. */
export const DEFAULT_BODY_WEIGHT_KG = 78

// ── Base MET selection from training density ─────────────────────────────────
/**
 * Selects base MET from volume density (kg moved per active minute).
 * This is the PRIMARY driver of calorie estimation.
 *
 * Calibrated to produce correct ranges when combined with other factors:
 *  - < 60 kg/min  → MET 3.5 (light: warm-up, arms, abs)
 *  - 60-200 kg/min → MET 5.0 (moderate: typical hypertrophy)
 *  - ≥ 200 kg/min → MET 6.0 (vigorous: heavy compounds, supersets)
 */
export const selectBaseMet = (
  volumeKg: number,
  activeMinutes: number,
): number => {
  if (activeMinutes <= 0) return MET_MODERATE // fallback
  const density = volumeKg / activeMinutes

  if (density < 60) return MET_LIGHT
  if (density < 200) return MET_MODERATE
  return MET_VIGOROUS
}

// ── Training style detection ─────────────────────────────────────────────────
/**
 * Detects training style from session data and returns a small multiplier.
 *
 * - Circuit / HIIT (very short rest): 1.10 (elevated HR throughout)
 * - Strength (heavy, low reps, long rest): 0.95 (more rest, less continuous work)
 * - Endurance (light, high reps): 1.05 (more continuous movement)
 * - Hypertrophy (default): 1.00 (baseline)
 */
export type TrainingStyle = 'circuit' | 'strength' | 'endurance' | 'hypertrophy'

export const detectTrainingStyle = (
  sessionLogs: Record<string, unknown>,
  exercises?: unknown[] | null,
): TrainingStyle => {
  const logs = Object.values(sessionLogs)
  if (logs.length === 0) return 'hypertrophy'

  let totalReps = 0
  let totalSets = 0
  let avgWeight = 0
  let totalRestSec = 0
  let restCount = 0

  for (const v of logs) {
    if (!v || typeof v !== 'object') continue
    const obj = v as AnyObj
    const w = Number(String(obj?.weight ?? '').replace(',', '.'))
    const r = Number(String(obj?.reps ?? '').replace(',', '.'))
    if (w > 0 && r > 0) {
      totalReps += r
      totalSets++
      avgWeight += w
    }
    const rest = Number(obj?.restSeconds)
    if (Number.isFinite(rest) && rest > 0) {
      totalRestSec += rest
      restCount++
    }
  }

  if (totalSets === 0) return 'hypertrophy'

  const avgRepsPerSet = totalReps / totalSets
  const avgWeightPerSet = avgWeight / totalSets
  const avgRestPerSet = restCount > 0 ? totalRestSec / restCount : 90

  // Check for circuit methods in exercise config
  const hasCircuitMethod = Array.isArray(exercises) && exercises.some((ex) => {
    const e = ex && typeof ex === 'object' ? (ex as AnyObj) : null
    const method = String(e?.method ?? '').toLowerCase()
    return /circuit|circuito|hiit|tabata|emom/.test(method)
  })

  if (hasCircuitMethod || avgRestPerSet < 30) return 'circuit'
  if (avgRepsPerSet <= 5 && avgWeightPerSet > 60) return 'strength'
  if (avgRepsPerSet >= 15) return 'endurance'
  return 'hypertrophy'
}

export const getStyleFactor = (style: TrainingStyle): number => {
  switch (style) {
    case 'circuit': return 1.10
    case 'strength': return 0.95
    case 'endurance': return 1.05
    case 'hypertrophy': return 1.00
    default: return 1.00
  }
}

// ── Exercise complexity factor ───────────────────────────────────────────────
/**
 * Returns a multiplier based on exercise type and muscle group size.
 *
 * CONSERVATIVE multipliers (0.85–1.15) that reflect relative metabolic cost.
 * Large muscle groups (quads, glutes) get a modest bump over small muscles (biceps).
 * This is NOT a dramatic multiplier — it's a fine-tuning adjustment.
 */
export const getExerciseComplexityFactor = (exerciseName: string): number => {
  const n = String(exerciseName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  // ── 1.15 × Olympic / Deadlift / Full-body compound ─────────────────────
  if (/levantamento terra|deadlift|terra romeno|romanian|rdl|clean|snatch|thruster|power clean/.test(n)) return 1.15

  // ── 1.12 × Free-weight squat (barbell) ─────────────────────────────────
  if (/agachamento/.test(n) && !/hack|smith|goblet|sumô|sumo|afundo|passada|lunge/.test(n)) return 1.12
  if (/back squat|front squat|overhead squat/.test(n)) return 1.12

  // ── 1.10 × Compound pull / Hip thrust ──────────────────────────────────
  if (/remada curvada|bent.?over row|remada aberta/.test(n)) return 1.10
  if (/barra fixa|pull.?up|chin.?up/.test(n)) return 1.10
  if (/hip thrust/.test(n)) return 1.10
  if (/glute bridge|ponte gluteo|ponte de gluteo/.test(n)) return 1.08

  // ── 1.05 × Multi-joint compound (free weight) ─────────────────────────
  if (/supino/.test(n) && !/maquina|smith|peck|pec deck/.test(n)) return 1.05
  if (/bench press/.test(n) && !/machine|smith/.test(n)) return 1.05
  if (/mergulho.*livre|dip.*livre|paralelas/.test(n)) return 1.05
  if (/desenvolvimento.*haltere|shoulder press.*dumbbell|arnold/.test(n)) return 1.05
  if (/passada|afundo|lunge|split squat/.test(n)) return 1.05
  if (/goblet|sumo|sumô/.test(n)) return 1.05
  if (/hack squat/.test(n)) return 1.05

  // ── 1.02 × Multi-joint machine / Leg compound machine ──────────────────
  if (/leg press/.test(n)) return 1.02
  if (/puxada|pulldown|pull down/.test(n)) return 1.00
  if (/remada/.test(n) && !/curvada|aberta|bent/.test(n)) return 1.00
  if (/supino.*maquina|chest press.*machine|smith/.test(n)) return 1.00
  if (/desenvolvimento.*maquina|shoulder press.*machine/.test(n)) return 1.00

  // ── 0.98 × Isolation lower-body (quad/ham — moderately large muscles) ──
  if (/cadeira extensora|leg extension|extensora/.test(n)) return 0.98
  if (/mesa flexora|leg curl|flexora/.test(n)) return 0.98
  if (/stiff|romanian/.test(n)) return 1.02

  // ── 0.95 × Calf / Core / Adductor ──────────────────────────────────────
  if (/panturrilha|calf raise|gemeo/.test(n)) return 0.95
  if (/abdutora|adutora|abducao|adducao|hip abduction|hip adduction/.test(n)) return 0.92
  if (/abdomen|crunch|prancha|plank|abdominal/.test(n)) return 0.90

  // ── 0.92 × Isolation free-weight (arms — small muscles) ────────────────
  if (/rosca|curl|bicep|martelo|hammer|zottman|scott/.test(n)) return 0.92
  if (/elevacao lateral|elevação lateral|lateral raise/.test(n)) return 0.92
  if (/elevacao frontal|elevação frontal|front raise/.test(n)) return 0.92
  if (/tricep.*frances|skull crusher|testa|french press/.test(n)) return 0.92

  // ── 0.88 × Isolation cable/machine (arms — guided, minimal stabilization)
  if (/peck deck|pec deck|crucifixo.*maquina|fly.*maquina/.test(n)) return 0.88
  if (/crossover|cross.?over|voador/.test(n)) return 0.88
  if (/pushdown|push.?down/.test(n)) return 0.88
  if (/face pull/.test(n)) return 0.90
  if (/tricep.*maquina|tricep.*cabo|cable/.test(n)) return 0.88

  // Default: standard machine work
  return 1.00
}

// ── RPE multiplier ───────────────────────────────────────────────────────────
/**
 * RPE (Rate of Perceived Exertion) scales intensity estimation.
 * Conservative range: 0.85 – 1.08.
 *
 * RPE 7–8 is the baseline (1.00) — most trained individuals work here.
 */
export const getRpeMultiplier = (rpe: number | null | undefined): number => {
  if (rpe == null || !Number.isFinite(rpe)) return 1.00
  const r = Math.max(1, Math.min(10, Math.round(rpe)))
  if (r <= 3) return 0.85
  if (r === 4) return 0.88
  if (r === 5) return 0.92
  if (r === 6) return 0.96
  if (r <= 8) return 1.00
  if (r === 9) return 1.04
  return 1.08 // RPE 10
}

// ── Sex multiplier ───────────────────────────────────────────────────────────
/**
 * Women have ~10% lower resting metabolic rate per kg body weight
 * (Harris-Benedict). Applied as a conservative correction.
 */
export const getSexMultiplier = (sex: string | null | undefined): number => {
  if (sex === 'female') return 0.90
  return 1.00
}

// ── EPOC factor ──────────────────────────────────────────────────────────────
/**
 * Conservative EPOC (Excess Post-exercise Oxygen Consumption).
 * Only applies to vigorous sessions of sufficient duration.
 *
 * - MET ≥ 6.0 AND duration > 60 min → +5%
 * - MET ≥ 5.0 AND duration > 45 min → +3%
 * - Otherwise → +0%
 */
export const getEpocFactor = (met: number, durationMinutes: number): number => {
  if (met >= 6.0 && durationMinutes > 60) return 1.05
  if (met >= 5.0 && durationMinutes > 45) return 1.03
  return 1.00
}

// ── Active minutes computation ───────────────────────────────────────────────
/**
 * Computes active work time from logs or total duration.
 * Uses per-set executionSeconds when available, otherwise estimates
 * from total duration minus tracked rest time.
 *
 * Active time is clamped to at least 35% of total (accounts for
 * untracked warm-up, transitions, etc.)
 */
export const computeActiveWorkMinutes = (
  sessionLogs: Record<string, unknown>,
  totalMinutes: number,
): number => {
  if (!totalMinutes || totalMinutes <= 0) return 0

  // Try summing per-set execution seconds
  let totalExecSeconds = 0
  let totalRestSeconds = 0
  for (const v of Object.values(sessionLogs)) {
    if (!v || typeof v !== 'object') continue
    const obj = v as AnyObj
    const exec = Number(obj?.executionSeconds ?? obj?.execution_seconds)
    if (Number.isFinite(exec) && exec > 0 && exec < 600) totalExecSeconds += exec
    const rest = Number(obj?.restSeconds ?? obj?.rest_seconds)
    if (Number.isFinite(rest) && rest > 0 && rest < 600) totalRestSeconds += rest
  }

  // If we have per-set execution data, use it directly (most accurate)
  if (totalExecSeconds > 60) {
    return Math.max(totalExecSeconds / 60, totalMinutes * 0.35)
  }

  // Otherwise estimate: total - rest, clamped to minimum 35%
  const restMinutes = totalRestSeconds / 60
  const active = totalMinutes - restMinutes
  return Math.max(active, totalMinutes * 0.35)
}

// ── Duration fallback from log timestamps ────────────────────────────────────
/**
 * When totalTime is missing, estimates duration from log timestamps.
 */
export const estimateDurationFromLogs = (
  sessionLogs: Record<string, unknown>,
  startedAtMs?: number | null,
): number | null => {
  try {
    const timestamps: number[] = []
    for (const v of Object.values(sessionLogs)) {
      if (!v || typeof v !== 'object') continue
      const obj = v as AnyObj
      for (const ts of [Number(obj.completedAtMs), Number(obj.setStartMs), Number(obj.restStartMs)]) {
        if (Number.isFinite(ts) && ts > 1_000_000_000_000) timestamps.push(ts)
      }
    }
    if (timestamps.length < 2) return null
    const min = Math.min(...timestamps)
    const max = Math.max(...timestamps)
    const start = (startedAtMs && startedAtMs > 0 && startedAtMs < min) ? startedAtMs : min
    const minutes = (max - start) / 60_000
    return (minutes >= 5 && minutes <= 240) ? minutes : null
  } catch { return null }
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Estimates calories burned for a resistance training session.
 *
 * Multi-factor model using:
 *  1. Duration (exec + rest time split)
 *  2. Body weight
 *  3. Sex
 *  4. Volume density → base MET
 *  5. Training style (auto-detected)
 *  6. Exercise complexity (volume-weighted)
 *  7. RPE
 *  8. EPOC
 *
 * @returns Estimated kcal, rounded. Typical range: 200–700 kcal.
 */
export const estimateCaloriesMet = (
  sessionLogs: Record<string, unknown>,
  durationMinutes: number,
  bodyWeightKg?: number | null,
  exerciseNames?: string[] | null,
  rpe?: number | null,
  execMinutesOverride?: number | null,
  restMinutesOverride?: number | null,
  biologicalSex?: string | null,
  exerciseVolumes?: number[] | null,
  startedAtMs?: number | null,
): number => {
  // ── 1. Compute total volume ──────────────────────────────────────────────
  let totalVolume = 0
  let totalReps = 0
  for (const v of Object.values(sessionLogs)) {
    if (!v || typeof v !== 'object') continue
    const obj = v as AnyObj
    const w = Number(String(obj?.weight ?? '').replace(',', '.'))
    const r = Number(String(obj?.reps ?? '').replace(',', '.'))
    if (w > 0 && r > 0) {
      totalVolume += w * r
      totalReps += r
    }
  }

  // ── 2. Body weight ───────────────────────────────────────────────────────
  const bw = bodyWeightKg != null && Number.isFinite(bodyWeightKg)
    && bodyWeightKg >= 20 && bodyWeightKg <= 300
    ? bodyWeightKg
    : DEFAULT_BODY_WEIGHT_KG

  // ── 3. Duration ──────────────────────────────────────────────────────────
  let effectiveDuration = durationMinutes
  if (!effectiveDuration || effectiveDuration <= 0) {
    const fromLogs = estimateDurationFromLogs(sessionLogs, startedAtMs ?? undefined)
    if (fromLogs && fromLogs > 0) effectiveDuration = fromLogs
  }
  if (!effectiveDuration || effectiveDuration <= 0) return 0

  // ── 4. Active vs rest time split ─────────────────────────────────────────
  const activeMinutes = (() => {
    if (execMinutesOverride != null && execMinutesOverride > 0) return execMinutesOverride
    return computeActiveWorkMinutes(sessionLogs, effectiveDuration)
  })()
  const restMinutes = (() => {
    if (restMinutesOverride != null && restMinutesOverride >= 0) return restMinutesOverride
    return Math.max(0, effectiveDuration - activeMinutes)
  })()

  // ── 5. Base MET from density ─────────────────────────────────────────────
  const baseMet = selectBaseMet(totalVolume, activeMinutes)

  // ── 6. Training style factor ─────────────────────────────────────────────
  const exercises = Array.isArray(exerciseNames)
    ? exerciseNames.map((name) => ({ name }))
    : null
  const style = detectTrainingStyle(sessionLogs, exercises)
  const styleFactor = getStyleFactor(style)

  // ── 7. Complexity factor (volume-weighted) ───────────────────────────────
  let complexityFactor = 1.00
  if (exerciseNames && exerciseNames.length > 0) {
    const hasVolumes = exerciseVolumes != null && exerciseVolumes.length === exerciseNames.length
    if (hasVolumes) {
      const totalExVol = exerciseVolumes!.reduce((a, b) => a + b, 0)
      if (totalExVol > 0) {
        complexityFactor = exerciseNames.reduce((acc, name, i) =>
          acc + getExerciseComplexityFactor(name) * exerciseVolumes![i], 0) / totalExVol
      } else {
        const factors = exerciseNames.map(getExerciseComplexityFactor)
        complexityFactor = factors.reduce((a, b) => a + b, 0) / factors.length
      }
    } else {
      const factors = exerciseNames.map(getExerciseComplexityFactor)
      complexityFactor = factors.reduce((a, b) => a + b, 0) / factors.length
    }
  }

  // ── 8. RPE multiplier ────────────────────────────────────────────────────
  const rpeFactor = getRpeMultiplier(rpe)

  // ── 9. Sex multiplier ────────────────────────────────────────────────────
  const sexFactor = getSexMultiplier(biologicalSex)

  // ── 10. EPOC ─────────────────────────────────────────────────────────────
  const effectiveMet = baseMet * styleFactor * complexityFactor
  const epocFactor = getEpocFactor(effectiveMet, effectiveDuration)

  // ── Final calculation ────────────────────────────────────────────────────
  const activeHours = activeMinutes / 60
  const restHours = restMinutes / 60

  const activeKcal = baseMet * styleFactor * complexityFactor * bw * activeHours * rpeFactor * sexFactor
  const restKcal = MET_REST * bw * restHours * sexFactor
  const totalKcal = (activeKcal + restKcal) * epocFactor

  return Number.isFinite(totalKcal) && totalKcal > 0 ? Math.round(totalKcal) : 0
}
