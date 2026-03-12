/**
 * MET-based calorie estimation for resistance training sessions.
 *
 * ## MET selection (two-factor: avg load per rep + density)
 * Uses the HIGHER of the two independent MET estimates:
 *  a) Load-based MET (avg kg per rep):
 *     - Light    (avg load < 20 kg/rep)  → MET 3.5
 *     - Moderate (avg load < 50 kg/rep)  → MET 5.0
 *     - Vigorous (avg load >= 50 kg/rep) → MET 6.0
 *  b) Density-based MET (kg volume per active minute):
 *     - < 80 kg/min   → MET 3.5
 *     - < 200 kg/min  → MET 5.0
 *     - < 350 kg/min  → MET 6.0
 *     - >= 350 kg/min → MET 8.0  (Compendium of Physical Activities — vigorous circuit/weight training)
 *
 * ## Complexity factor (exercise type multiplier)
 * Applies a multiplier on top of MET based on exercise type.
 * When per-exercise volumes are provided, uses volume-weighted average
 * instead of simple mean — so heavy compound lifts have proportional weight.
 *
 * ## EPOC (Excess Post-exercise Oxygen Consumption)
 * For high-intensity sessions (MET ≥ 6.0 and > 60 min), adds +8% to total.
 * For moderate-high sessions (MET ≥ 5.0 and > 45 min), adds +5%.
 * Evidence: Børsheim & Bahr (2003), Melanson et al. (2009).
 *
 * ## Formula
 * kcal = (MET × complexityFactor × bodyWeightKg × activeHours × rpeMultiplier
 *        + MET_REST × bodyWeightKg × restHours) × sexMultiplier × epocFactor
 */

type AnyObj = Record<string, unknown>

// ── MET constants ──────────────────────────────────────────────────────────────
export const MET_LIGHT = 3.5
export const MET_MODERATE = 5.0
export const MET_VIGOROUS = 6.0
export const MET_HIGH_DENSITY = 8.0   // Compendium: vigorous circuit/weight training
export const MET_REST = 1.5

/** Default body weight in kg (IBGE 2019 — Brazilian adult male average). */
export const DEFAULT_BODY_WEIGHT_KG = 78

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
  // Load-based MET
  const metLoad =
    avgLoadPerRep < 20 ? MET_LIGHT
    : avgLoadPerRep < 50 ? MET_MODERATE
    : MET_VIGOROUS

  // Density-based MET (guards against long sessions with low load)
  const density = activeMinutes > 0 ? volumeKg / activeMinutes : 0
  const metDensity =
    density < 80 ? MET_LIGHT
    : density < 200 ? MET_MODERATE
    : density < 350 ? MET_VIGOROUS
    : MET_HIGH_DENSITY

  // Use the higher of the two — ensures volume is always reflected
  return Math.max(metLoad, metDensity)
}

// ── Complexity factor lookup (keyword-based, static table) ────────────────────

/**
 * Returns the exercise-type complexity factor for a given exercise name.
 * Uses keyword matching against a static table — no AI, no network calls.
 */
export const getExerciseComplexityFactor = (exerciseName: string): number => {
  const n = String(exerciseName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  // ── 1.40 × Multi-joint free-weight compound (most demanding) ────────────
  if (
    /levantamento terra|deadlift|terra romeno|romanian|rdl|clean|snatch|thruster|power clean/.test(n)
  ) return 1.40

  // Agachamento livre / com barra (not machine, not hack, not smith)
  if (/agachamento/.test(n) && !/hack|smith|goblet|sumô|sumo|afundo|passada|lunge/.test(n)) return 1.40
  if (/back squat|front squat|overhead squat/.test(n)) return 1.40
  if (/remada curvada|bent.?over row|remada aberta/.test(n)) return 1.30
  if (/barra fixa|pull.?up|chin.?up/.test(n)) return 1.30
  if (/mergulho.*livre|dip.*livre|paralelas/.test(n)) return 1.25

  // ── 1.15 × Multi-joint free-weight simple ──────────────────────────────
  if (/supino/.test(n) && !/maquina|smith|peck|pec deck/.test(n)) return 1.15
  if (/bench press/.test(n) && !/machine|smith/.test(n)) return 1.15
  if (/desenvolvimento.*haltere|shoulder press.*dumbbell|arnold/.test(n)) return 1.15
  if (/hip thrust/.test(n) && !/maquina/.test(n)) return 1.15
  if (/passada|afundo|lunge|split squat/.test(n)) return 1.15
  if (/goblet|sumo|sumô/.test(n)) return 1.15
  if (/hack squat/.test(n) && !/maquina/.test(n)) return 1.10

  // ── 1.00 × Multi-joint machine/assisted (baseline) ─────────────────────
  if (/leg press/.test(n)) return 1.00
  if (/puxada|pulldown|pull down/.test(n)) return 1.00
  if (/remada/.test(n) && !/curvada|aberta|bent/.test(n)) return 1.00
  if (/supino.*maquina|chest press.*machine|smith.*supino/.test(n)) return 1.00
  if (/desenvolvimento.*maquina|shoulder press.*machine/.test(n)) return 1.00
  if (/hack.*maquina|v.?squat machine/.test(n)) return 1.00

  // ── 0.85 × Isolation free-weight ───────────────────────────────────────
  if (/rosca.*alternada|rosca.*haltere|curl.*dumbbell|hammer|martelo/.test(n)) return 0.85
  if (/rosca direta.*barra|barbell curl|zottman|scott.*barra/.test(n)) return 0.85
  if (/elevacao lateral|elevação lateral|lateral raise/.test(n)) return 0.85
  if (/elevacao frontal|elevação frontal|front raise/.test(n)) return 0.85
  if (/stiff.*haltere|stiff.*dumbbell|romanian.*dumbbell/.test(n)) return 0.85
  if (/tricep.*frances|skull crusher|testa|french press/.test(n)) return 0.85
  if (/rosca/.test(n)) return 0.85 // catch-all rosca
  if (/bicep curl|biceps curl/.test(n)) return 0.85

  // ── 0.75 × Isolation machine/cable ─────────────────────────────────────
  if (/cadeira extensora|leg extension|extensora/.test(n)) return 0.75
  if (/mesa flexora|leg curl|flexora/.test(n)) return 0.75
  if (/peck deck|pec deck|crucifixo.*maquina|fly.*maquina/.test(n)) return 0.75
  if (/crossover|cross.?over/.test(n)) return 0.75
  if (/voador|fly.*cabo/.test(n)) return 0.75
  if (/pushdown|push.?down/.test(n)) return 0.75
  if (/face pull/.test(n)) return 0.75
  if (/tricep.*maquina|tricep.*cabo|cable tricep/.test(n)) return 0.75
  if (/rosca.*scott.*maquina|preacher.*machine/.test(n)) return 0.75
  if (/panturrilha|calf raise|gemeo/.test(n)) return 0.70
  if (/abdutora|abducao|hip abduction/.test(n)) return 0.70
  if (/abdomen|crunch|prancha|plank|abdominal/.test(n)) return 0.70

  // Default: multi-joint machine baseline
  return 1.00
}

// ── RPE multiplier ────────────────────────────────────────────────────────────

/**
 * Maps post-workout RPE (1–10) to an intensity multiplier applied on top of MET.
 * RPE 7-8 → 1.00 baseline (MET tables assume average effort).
 */
export const getRpeMultiplier = (rpe: number | null | undefined): number => {
  if (rpe == null || !Number.isFinite(rpe)) return 1.0
  const r = Math.max(1, Math.min(10, Math.round(rpe)))
  if (r <= 3) return 0.80
  if (r === 4) return 0.87
  if (r === 5) return 0.92
  if (r === 6) return 0.96
  if (r <= 8) return 1.00
  if (r === 9) return 1.08
  return 1.15 // RPE 10
}

// ── Sex multiplier ────────────────────────────────────────────────────────────

/**
 * Applies a biological sex correction to the MET-based calorie estimate.
 *
 * Based on the Harris-Benedict equation, women have ~10% lower BMR per kg
 * of body weight compared to men of the same weight and training intensity,
 * due to proportionally higher body fat and lower skeletal muscle mass.
 *
 * - male:         1.00 (baseline)
 * - female:       0.90 (-10%)
 * - not_informed: 1.00 (conservative — never penalizes missing data)
 */
export const getSexMultiplier = (sex: string | null | undefined): number => {
  if (sex === 'female') return 0.90
  return 1.00 // male or not_informed
}

// ── EPOC factor ───────────────────────────────────────────────────────────────

/**
 * Returns the EPOC (Excess Post-exercise Oxygen Consumption) multiplier.
 *
 * Resistance training — especially high-intensity sessions — elevates oxygen
 * consumption for 24–72 hours post-exercise. This factor adds a conservative
 * estimate of that additional caloric cost to the in-session calculation.
 *
 * Evidence: Børsheim & Bahr (2003), Melanson et al. (2009), Schuenke et al. (2002).
 *
 * - MET ≥ 6.0 AND duration > 60 min → +8% (vigorous, long session)
 * - MET ≥ 5.0 AND duration > 45 min → +5% (moderate-high, standard session)
 * - Otherwise                        → +0% (light session, negligible EPOC)
 */
export const getEpocFactor = (met: number, durationMinutes: number): number => {
  if (met >= 6.0 && durationMinutes > 60) return 1.08
  if (met >= 5.0 && durationMinutes > 45) return 1.05
  return 1.0
}



/**
 * Computes the actual work time in minutes by subtracting tracked rest time
 * from total session duration. Clamped so active time is at least 35% of total.
 */
export const computeActiveWorkMinutes = (
  sessionLogs: Record<string, unknown>,
  totalMinutes: number,
): number => {
  if (!totalMinutes || totalMinutes <= 0) return 0
  let totalRestSeconds = 0
  for (const v of Object.values(sessionLogs)) {
    if (!v || typeof v !== 'object') continue
    const obj = v as Record<string, unknown>
    const rs = Number(obj?.restSeconds)
    if (Number.isFinite(rs) && rs > 0 && rs < 600) totalRestSeconds += rs // ignore >10 min outliers
  }
  const totalRestMinutes = totalRestSeconds / 60
  const active = totalMinutes - totalRestMinutes
  const minActive = totalMinutes * 0.35 // floor: at least 35% of total is active
  return Math.max(active, minActive)
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Estimates calories burned during a resistance training session using MET.
 *
 * Uses a two-factor MET selection (avg load per rep AND density kg/min)
 * to ensure higher-volume sessions always produce more calories than
 * lower-volume sessions, even at the same average load.
 *
 * When `exerciseVolumes` is provided (volume per exercise in kg), the
 * complexity factor is computed as a **volume-weighted average** so that
 * heavy compound lifts contribute proportionally more than light isolators.
 *
 * @param sessionLogs         - The session's log entries keyed by "exerciseIdx-setIdx".
 * @param durationMinutes     - Total duration of the session in minutes.
 * @param bodyWeightKg        - Athlete body weight in kg (optional; defaults to 78 kg).
 * @param exerciseNames       - Optional exercise names, used to compute complexity factor.
 * @param rpe                 - Post-workout RPE (1–10). Adjusts MET by ±15%.
 * @param execMinutesOverride - If known (from logs), use as active minutes directly.
 * @param restMinutesOverride - If known (from logs), use as rest minutes directly.
 * @param biologicalSex       - 'male' | 'female' | 'not_informed'. Applies ±10% sex correction.
 * @param exerciseVolumes     - Volume (kg×reps total) per exercise, same order as exerciseNames.
 *                              When provided, enables volume-weighted complexity factor.
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
): number => {
  if (!durationMinutes || durationMinutes <= 0) return 0

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

  const avgWeightPerRep = totalReps > 0 ? totalWeightedReps / totalReps : 0

  // Active and rest minutes — prefer explicit values from session, fallback to computed
  const activeMinutes = (() => {
    if (execMinutesOverride != null && execMinutesOverride > 0) return execMinutesOverride
    return computeActiveWorkMinutes(sessionLogs, durationMinutes)
  })()
  const restMinutes = (() => {
    if (restMinutesOverride != null && restMinutesOverride >= 0) return restMinutesOverride
    return Math.max(0, durationMinutes - activeMinutes)
  })()

  // Two-factor MET: load-based AND density-based — take the higher
  const met = selectMet(avgWeightPerRep, totalVolume, activeMinutes)

  // Complexity factor: volume-weighted average when volumes are available,
  // otherwise simple average across exercises
  let complexityFactor = 1.0
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

  // Body weight: use provided value when valid (20–300 kg), else default
  const bw = bodyWeightKg != null && Number.isFinite(bodyWeightKg) && bodyWeightKg >= 20 && bodyWeightKg <= 300
    ? bodyWeightKg
    : DEFAULT_BODY_WEIGHT_KG

  // RPE intensity multiplier from post-workout check-in
  const rpeMultiplier = getRpeMultiplier(rpe)

  // Biological sex correction (Harris-Benedict): female ~10% lower BMR per kg
  const sexMultiplier = getSexMultiplier(biologicalSex)

  // EPOC: extra post-exercise oxygen consumption for intense/long sessions
  const epocFactor = getEpocFactor(met, durationMinutes)

  // Active kcal (exercise) + rest kcal (recovery, MET ≈ 1.5), then EPOC
  const activeHours = activeMinutes / 60
  const restHours = restMinutes / 60
  const kcalBase = met * complexityFactor * bw * activeHours * rpeMultiplier * sexMultiplier
    + MET_REST * bw * restHours * sexMultiplier
  const kcal = kcalBase * epocFactor

  return Number.isFinite(kcal) && kcal > 0 ? Math.round(kcal) : 0
}
