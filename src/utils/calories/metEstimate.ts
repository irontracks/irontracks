/**
 * MET-based calorie estimation for resistance training sessions.
 *
 * ## Scientific Basis
 * - Compendium of Physical Activities 2011 (Ainsworth et al.): MET 6.0 for
 *   vigorous weight training, MET 8.0 for circuit/vigorous weight training.
 * - Burleson et al. (1998), Scott et al. (2011): high-intensity resistance
 *   sessions (especially compound lower-body exercises) produce MET 7–10
 *   due to elevated EPOC and cardiovascular demand.
 * - ACSM Guidelines (2021): energy expenditure during leg press/squat is
 *   substantially higher than arm exercises at equal relative intensity.
 *
 * ## MET selection (two-factor: avg load per rep + density)
 * Uses the HIGHER of the two independent MET estimates:
 *  a) Load-based MET (avg kg per rep):
 *     - Light    (avg load < 20 kg/rep)  → MET 3.5
 *     - Moderate (avg load < 50 kg/rep)  → MET 5.0
 *     - Vigorous (avg load < 80 kg/rep)  → MET 6.5
 *     - Heavy    (avg load >= 80 kg/rep) → MET 8.0  (heavy multi-joint lifts)
 *  b) Density-based MET (kg volume per active minute):
 *     - < 80 kg/min   → MET 3.5
 *     - < 200 kg/min  → MET 5.0
 *     - < 350 kg/min  → MET 6.5
 *     - < 500 kg/min  → MET 8.0  (Compendium: vigorous circuit/weight training)
 *     - >= 500 kg/min → MET 9.0  (elite / very high density training)
 *
 * ## Complexity factor (exercise type multiplier — UPDATED)
 * Applies a multiplier based on exercise type and muscle group size.
 * Leg/glute exercises are systematically higher because:
 *   - Quad/glute mass ≈ 3–5× larger than arm muscles
 *   - Equal relative intensity = far more total muscle fibers recruited
 *   - Higher cardiovascular demand → more O₂ consumption → more kcal
 *
 * ## EPOC (Excess Post-exercise Oxygen Consumption)
 * For high-intensity sessions (MET ≥ 7.0 and > 45 min), adds +12%.
 * For moderate-high sessions (MET ≥ 5.0 and > 30 min), adds +6%.
 * Based on Børsheim & Bahr (2003), Schuenke et al. (2002).
 *
 * ## Duration fallback
 * When totalTime is missing from the session, duration is estimated from
 * log timestamps (completedAtMs or setStartMs fields).
 *
 * ## Formula
 * kcal = (MET × complexityFactor × bodyWeightKg × activeHours × rpeMultiplier
 *        + MET_REST × bodyWeightKg × restHours) × sexMultiplier × epocFactor
 */

type AnyObj = Record<string, unknown>

// ── MET constants ──────────────────────────────────────────────────────────────
export const MET_LIGHT = 3.5
export const MET_MODERATE = 5.0
export const MET_VIGOROUS = 6.5        // Updated: was 6.0 — ACSM 2021 vigorous resistance
export const MET_HEAVY = 8.0           // Updated: heavy multi-joint (Compendium 2011)
export const MET_HIGH_DENSITY = 9.0   // New: elite/very high density training
export const MET_REST = 1.5

/** Default body weight in kg (IBGE 2019 — Brazilian adult male average). */
export const DEFAULT_BODY_WEIGHT_KG = 80

// ── MET selection (two-factor) ─────────────────────────────────────────────────

/**
 * Selects MET using both avg load per rep and density (kg/active-min).
 * Returns the HIGHER of the two estimates to ensure heavier work = more kcal.
 */
export const selectMet = (
  avgLoadPerRep: number,
  volumeKg: number,
  activeMinutes: number,
): number => {
  // Load-based MET — updated to include "heavy" tier >= 80 kg/rep average
  const metLoad =
    avgLoadPerRep < 20  ? MET_LIGHT
    : avgLoadPerRep < 50 ? MET_MODERATE
    : avgLoadPerRep < 80 ? MET_VIGOROUS
    : MET_HEAVY

  // Density-based MET (guards against long sessions with low load)
  const density = activeMinutes > 0 ? volumeKg / activeMinutes : 0
  const metDensity =
    density < 80  ? MET_LIGHT
    : density < 200 ? MET_MODERATE
    : density < 350 ? MET_VIGOROUS
    : density < 500 ? MET_HEAVY
    : MET_HIGH_DENSITY

  // Use the higher of the two — ensures volume is always reflected
  return Math.max(metLoad, metDensity)
}

// ── Complexity factor lookup (keyword-based, static table) ────────────────────

/**
 * Returns the exercise-type complexity factor for a given exercise name.
 *
 * Key scientific update: leg/glute exercises now have higher multipliers
 * (1.25–1.50) because large lower-body muscles consume 35–55% more energy
 * than upper-body isolations at equal training volume (ACSM 2021).
 */
export const getExerciseComplexityFactor = (exerciseName: string): number => {
  const n = String(exerciseName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  // ── 1.50 × Deadlift, Olympic — highest metabolic demands ────────────────
  if (
    /levantamento terra|deadlift|terra romeno|romanian|rdl|clean|snatch|thruster|power clean/.test(n)
  ) return 1.50

  // ── 1.45 × Free-weight squat (barbell) ────────────────────────────────────
  // Quad/glute/erector synergy with axial load — highest kcal of gym lifts
  if (/agachamento/.test(n) && !/hack|smith|goblet|sumô|sumo|afundo|passada|lunge/.test(n)) return 1.45
  if (/back squat|front squat|overhead squat/.test(n)) return 1.45

  // ── 1.35 × Compound pull (free weight) ────────────────────────────────────
  if (/remada curvada|bent.?over row|remada aberta/.test(n)) return 1.35
  if (/barra fixa|pull.?up|chin.?up/.test(n)) return 1.35

  // ── 1.30 × Hip thrust / Glute bridge (large muscle, high activation) ──────
  // Glutes are the largest muscle group — hip thrust activates ~250% vs squat
  if (/hip thrust/.test(n) && !/maquina/.test(n)) return 1.30
  if (/glute bridge|ponte gluteo|ponte de gluteo/.test(n)) return 1.30

  // ── 1.25 × Multi-joint free weight moderate + leg compound machines ───────
  if (/mergulho.*livre|dip.*livre|paralelas/.test(n)) return 1.25
  if (/supino/.test(n) && !/maquina|smith|peck|pec deck/.test(n)) return 1.25
  if (/bench press/.test(n) && !/machine|smith/.test(n)) return 1.25
  if (/desenvolvimento.*haltere|shoulder press.*dumbbell|arnold/.test(n)) return 1.20
  if (/passada|afundo|lunge|split squat/.test(n)) return 1.25
  if (/goblet|sumo|sumô/.test(n)) return 1.25
  if (/hack squat/.test(n)) return 1.25   // Updated: was 1.10 — large quad activation even on machine

  // ── 1.20 × Leg press — large muscle group, machine (was 1.00) ────────────
  // Key fix: leg press activates quad+glute+hamstring = major energy consumers
  if (/leg press/.test(n)) return 1.20

  // ── 1.15 × Upper-body machine / smith press ───────────────────────────────
  if (/puxada|pulldown|pull down/.test(n)) return 1.10
  if (/remada/.test(n) && !/curvada|aberta|bent/.test(n)) return 1.05
  if (/supino.*maquina|chest press.*machine|smith.*supino/.test(n)) return 1.05
  if (/desenvolvimento.*maquina|shoulder press.*machine/.test(n)) return 1.05
  if (/hack.*maquina|v.?squat machine/.test(n)) return 1.20  // same as leg press hack

  // ── 1.15 × Isolation lower-body (quads/hamstrings) ── Updated from 0.75 ──
  // Cadeira extensora / mesa flexora activate very large quad/hamstring — more
  // metabolically costly than arm isolations despite being "machine isolations"
  if (/cadeira extensora|leg extension|extensora/.test(n)) return 1.15
  if (/mesa flexora|leg curl|flexora/.test(n)) return 1.15

  // ── 1.05 × Calf / Adductor / Abductor ─────────────────────────────────────
  if (/panturrilha|calf raise|gemeo/.test(n)) return 1.05
  if (/abdutora|adutora|abducao|adducao|hip abduction|hip adduction/.test(n)) return 1.00

  // ── 0.90 × Isolation free-weight (arms) ────────────────────────────────────
  if (/rosca.*alternada|rosca.*haltere|curl.*dumbbell|hammer|martelo/.test(n)) return 0.90
  if (/rosca direta.*barra|barbell curl|zottman|scott.*barra/.test(n)) return 0.90
  if (/elevacao lateral|elevação lateral|lateral raise/.test(n)) return 0.90
  if (/elevacao frontal|elevação frontal|front raise/.test(n)) return 0.90
  if (/stiff.*haltere|stiff.*dumbbell|romanian.*dumbbell/.test(n)) return 0.90
  if (/tricep.*frances|skull crusher|testa|french press/.test(n)) return 0.90
  if (/rosca/.test(n)) return 0.90  // catch-all rosca
  if (/bicep curl|biceps curl/.test(n)) return 0.90

  // ── 0.80 × Isolation cable/machine (arms) ──────────────────────────────────
  if (/peck deck|pec deck|crucifixo.*maquina|fly.*maquina/.test(n)) return 0.80
  if (/crossover|cross.?over/.test(n)) return 0.80
  if (/voador|fly.*cabo/.test(n)) return 0.80
  if (/pushdown|push.?down/.test(n)) return 0.80
  if (/face pull/.test(n)) return 0.80
  if (/tricep.*maquina|tricep.*cabo|cable tricep/.test(n)) return 0.80
  if (/rosca.*scott.*maquina|preacher.*machine/.test(n)) return 0.80

  // ── 0.70 × Core / Abs ──────────────────────────────────────────────────────
  if (/abdomen|crunch|prancha|plank|abdominal/.test(n)) return 0.70

  // Default: multi-joint machine baseline (bumped from 1.00 to 1.05)
  return 1.05
}

// ── RPE multiplier ────────────────────────────────────────────────────────────

/**
 * Maps post-workout RPE (1–10) to an intensity multiplier applied on top of MET.
 * Updated: RPE 9-10 now reflects higher real-world intensity (up from 1.08/1.15).
 */
export const getRpeMultiplier = (rpe: number | null | undefined): number => {
  if (rpe == null || !Number.isFinite(rpe)) return 1.0
  const r = Math.max(1, Math.min(10, Math.round(rpe)))
  if (r <= 3) return 0.80
  if (r === 4) return 0.87
  if (r === 5) return 0.93
  if (r === 6) return 0.97
  if (r <= 8) return 1.00
  if (r === 9) return 1.10   // Updated: was 1.08
  return 1.20                 // RPE 10 — updated: was 1.15
}

// ── Sex multiplier ────────────────────────────────────────────────────────────

/**
 * Applies a biological sex correction to the MET-based calorie estimate.
 * Based on Harris-Benedict equation.
 */
export const getSexMultiplier = (sex: string | null | undefined): number => {
  if (sex === 'female') return 0.90
  return 1.00 // male or not_informed
}

// ── EPOC factor ───────────────────────────────────────────────────────────────

/**
 * Returns the EPOC (Excess Post-exercise Oxygen Consumption) multiplier.
 *
 * Updated thresholds based on Schuenke et al. (2002) showing that vigorous
 * resistance training (especially compound leg exercises) produces EPOC for
 * up to 38 hours post-exercise.
 *
 * - MET ≥ 7.0 AND duration > 40 min → +12% (very vigorous session)
 * - MET ≥ 5.0 AND duration > 30 min → +6%  (moderate-high, updated from 5%)
 * - Otherwise                         → +0%  (light session, negligible EPOC)
 */
export const getEpocFactor = (met: number, durationMinutes: number): number => {
  if (met >= 7.0 && durationMinutes > 40) return 1.12  // Updated: was 1.08 at ≥6.0/>60
  if (met >= 5.0 && durationMinutes > 30) return 1.06  // Updated: was 1.05 at ≥5.0/>45
  return 1.0
}

// ── Duration fallback from log timestamps ────────────────────────────────────

/**
 * Estimates duration in minutes from log timestamps when totalTime is missing.
 * Looks at completedAtMs and setStartMs fields across all log entries.
 * Returns null if insufficient timestamp data.
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
      const candidates = [
        Number(obj.completedAtMs),
        Number(obj.setStartMs),
        Number(obj.restStartMs),
      ]
      for (const ts of candidates) {
        if (Number.isFinite(ts) && ts > 1_000_000_000_000) {
          timestamps.push(ts)
        }
      }
    }

    if (timestamps.length < 2) return null

    const minTs = Math.min(...timestamps)
    const maxTs = Math.max(...timestamps)
    const spanMs = maxTs - minTs

    // If we have a session startedAt, use it as the floor
    const effectiveStart = (startedAtMs && startedAtMs > 0 && startedAtMs < minTs)
      ? startedAtMs
      : minTs

    const totalMs = maxTs - effectiveStart
    const minutes = totalMs / 60_000

    // Sanity bounds: must be 5 min – 4 hours
    if (minutes < 5 || minutes > 240) {
      // Fallback to span between log entries + 10 min buffer (for first/last set warmup)
      const spanMinutes = spanMs / 60_000 + 10
      if (spanMinutes >= 5 && spanMinutes <= 240) return spanMinutes
      return null
    }

    return minutes
  } catch { return null }
}

// ── Active minutes ─────────────────────────────────────────────────────────────

/**
 * Computes the actual work time in minutes by subtracting tracked rest time
 * from total session duration. Clamped so active time is at least 40% of total.
 */
export const computeActiveWorkMinutes = (
  sessionLogs: Record<string, unknown>,
  totalMinutes: number,
): number => {
  if (!totalMinutes || totalMinutes <= 0) return 0
  let totalRestSeconds = 0
  for (const v of Object.values(sessionLogs)) {
    if (!v || typeof v !== 'object') continue
    const obj = v as AnyObj
    const rs = Number(obj?.restSeconds)
    if (Number.isFinite(rs) && rs > 0 && rs < 600) totalRestSeconds += rs // ignore > 10 min outliers
  }
  const totalRestMinutes = totalRestSeconds / 60
  const active = totalMinutes - totalRestMinutes
  const minActive = totalMinutes * 0.40  // floor: at least 40% of total is active (up from 35%)
  return Math.max(active, minActive)
}

// ── Volume-based minimum calorie floor ───────────────────────────────────────

/**
 * Returns a minimum calorie floor based on total training volume.
 * Research shows that 1 kcal is burned per ~10-15 kg of mechanical work
 * in resistance training (net; not counting EPOC).
 * This prevents unrealistically low estimates when timing data is poor.
 */
export const computeVolumeFloor = (totalVolumeKg: number, bodyWeightKg: number): number => {
  if (totalVolumeKg <= 0) return 0
  // Empirical floor: ~1 kcal per 12 kg lifted + BMR baseline (5 kcal/min × estimated duration)
  // Minimum: volume/12 kcal for mechanical work alone
  const mechanicalKcal = totalVolumeKg / 12
  // Additional: 5 kcal/min × estimated duration from volume
  // (assume ~50 kg/min average density = volume/50 minutes)
  const estimatedDurationMin = Math.max(5, totalVolumeKg / 50)
  const baselineKcal = 5 * estimatedDurationMin * (bodyWeightKg / 80)
  return Math.max(mechanicalKcal, baselineKcal)
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Estimates calories burned during a resistance training session using MET.
 *
 * Key improvements in this version:
 * - Higher MET ceiling (9.0) for very high-density training
 * - Higher MET tier for heavy loads (avg > 80 kg/rep → MET 8.0)
 * - Leg exercises have 20-50% higher complexity factors (large muscle groups)
 * - EPOC factor triggers at lower thresholds (MET 7.0 / 40 min)
 * - Volume-based calorie floor prevents zero due to missing timing
 * - Duration fallback from log timestamps when totalTime is missing
 *
 * @param sessionLogs         - The session's log entries keyed by "exerciseIdx-setIdx".
 * @param durationMinutes     - Total duration of the session in minutes.
 * @param bodyWeightKg        - Athlete body weight in kg (optional; defaults to 80 kg).
 * @param exerciseNames       - Optional exercise names, used to compute complexity factor.
 * @param rpe                 - Post-workout RPE (1–10). Adjusts MET by ±20%.
 * @param execMinutesOverride - If known (from logs), use as active minutes directly.
 * @param restMinutesOverride - If known (from logs), use as rest minutes directly.
 * @param biologicalSex       - 'male' | 'female' | 'not_informed'. Applies ±10% sex correction.
 * @param exerciseVolumes     - Volume (kg×reps total) per exercise, same order as exerciseNames.
 * @param startedAtMs         - Session start timestamp (ms) for duration fallback calculation.
 * @returns Estimated kcal burned, rounded to the nearest integer.
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
  const logEntries = Object.values(sessionLogs)
  let totalWeightedReps = 0
  let totalReps = 0
  let totalVolume = 0

  for (const v of logEntries) {
    if (!v || typeof v !== 'object') continue
    const obj = v as AnyObj
    const w = Number(String(obj?.weight ?? '').replace(',', '.'))
    const r = Number(String(obj?.reps ?? '').replace(',', '.'))
    if (w > 0 && r > 0) {
      totalWeightedReps += w * r
      totalReps += r
      totalVolume += w * r
    }
  }

  // Body weight
  const bw = bodyWeightKg != null && Number.isFinite(bodyWeightKg) && bodyWeightKg >= 20 && bodyWeightKg <= 300
    ? bodyWeightKg
    : DEFAULT_BODY_WEIGHT_KG

  // Duration: use provided, else fall back to log timestamps, else 0
  let effectiveDuration = durationMinutes
  if (!effectiveDuration || effectiveDuration <= 0) {
    const fromLogs = estimateDurationFromLogs(sessionLogs, startedAtMs ?? undefined)
    if (fromLogs && fromLogs > 0) effectiveDuration = fromLogs
  }

  // If still no duration, use volume-based floor
  if (!effectiveDuration || effectiveDuration <= 0) {
    const floor = computeVolumeFloor(totalVolume, bw)
    return Number.isFinite(floor) && floor > 0 ? Math.round(floor) : 0
  }

  const avgWeightPerRep = totalReps > 0 ? totalWeightedReps / totalReps : 0

  // Active and rest minutes — prefer explicit values from session, fallback to computed
  const activeMinutes = (() => {
    if (execMinutesOverride != null && execMinutesOverride > 0) return execMinutesOverride
    return computeActiveWorkMinutes(sessionLogs, effectiveDuration)
  })()
  const restMinutes = (() => {
    if (restMinutesOverride != null && restMinutesOverride >= 0) return restMinutesOverride
    return Math.max(0, effectiveDuration - activeMinutes)
  })()

  // Two-factor MET: load-based AND density-based — take the higher
  const met = selectMet(avgWeightPerRep, totalVolume, activeMinutes)

  // Complexity factor: volume-weighted average when volumes are available,
  // otherwise simple average across exercises
  let complexityFactor = 1.05
  if (exerciseNames && exerciseNames.length > 0) {
    const hasVolumes = exerciseVolumes != null
      && exerciseVolumes.length === exerciseNames.length
    if (hasVolumes) {
      // Volume-weighted: heavy compound lifts contribute more
      const totalExVol = exerciseVolumes!.reduce((a, b) => a + b, 0)
      if (totalExVol > 0) {
        complexityFactor = exerciseNames.reduce((acc, name, i) =>
          acc + getExerciseComplexityFactor(name) * exerciseVolumes![i], 0) / totalExVol
      } else {
        // All volumes are 0 — fallback to simple average
        const factors = exerciseNames.map(getExerciseComplexityFactor)
        complexityFactor = factors.reduce((a, b) => a + b, 0) / factors.length
      }
    } else {
      // Simple average (backward-compatible)
      const factors = exerciseNames.map(getExerciseComplexityFactor)
      complexityFactor = factors.reduce((a, b) => a + b, 0) / factors.length
    }
  }

  // RPE intensity multiplier from post-workout check-in
  const rpeMultiplier = getRpeMultiplier(rpe)

  // Biological sex correction (Harris-Benedict): female ~10% lower BMR per kg
  const sexMultiplier = getSexMultiplier(biologicalSex)

  // EPOC: extra post-exercise oxygen consumption for intense/long sessions
  const epocFactor = getEpocFactor(met, effectiveDuration)

  // Active kcal (exercise) + rest kcal (recovery, MET ≈ 1.5), then EPOC
  const activeHours = activeMinutes / 60
  const restHours = restMinutes / 60
  const kcalBase = met * complexityFactor * bw * activeHours * rpeMultiplier * sexMultiplier
    + MET_REST * bw * restHours * sexMultiplier
  const kcal = kcalBase * epocFactor

  // Apply volume-based floor to prevent unrealistically low values
  const volumeFloor = computeVolumeFloor(totalVolume, bw)
  const result = Math.max(kcal, volumeFloor)

  return Number.isFinite(result) && result > 0 ? Math.round(result) : 0
}
