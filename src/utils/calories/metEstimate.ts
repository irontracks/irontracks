/**
 * MET-based calorie estimation for resistance training sessions.
 *
 * ## MET scale (intensity level, by average load per rep)
 * - Light    (avg load <  20 kg/rep): MET 3.5
 * - Moderate (avg load <  50 kg/rep): MET 5.0
 * - Vigorous (avg load ≥  50 kg/rep): MET 6.0
 *
 * ## Complexity factor (exercise type multiplier)
 * Applies a multiplier on top of the MET based on how demanding the
 * exercise type is relative to its load, using a static lookup table.
 * This is 100% deterministic — no AI, no hallucinations.
 *
 * | Category                          | Examples                             | Factor |
 * |-----------------------------------|--------------------------------------|--------|
 * | Multi-joint free-weight compound  | Levantamento terra, Agachamento livre| 1.40   |
 * | Multi-joint free-weight simple    | Supino barra, Remada curvada         | 1.15   |
 * | Multi-joint machine/assisted      | Leg press, Puxada, Remada máquina    | 1.00   |
 * | Isolation free-weight             | Rosca alternada, Elevação lateral    | 0.85   |
 * | Isolation machine/cable           | Cadeira extensora, Peck Deck         | 0.75   |
 *
 * ## Body weight
 * When the athlete's body weight is provided (from pre-workout check-in),
 * it replaces the default 75 kg estimate, improving accuracy by up to ±30%.
 *
 * Formula: kcal = MET × complexityFactor × bodyWeightKg × durationHours
 */

type AnyObj = Record<string, unknown>

// ── MET constants ─────────────────────────────────────────────────────────────
export const MET_LIGHT = 3.5
export const MET_MODERATE = 5.0
export const MET_VIGOROUS = 6.0

/** Default body weight in kg used when athlete weight is unavailable. */
export const DEFAULT_BODY_WEIGHT_KG = 75

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

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Estimates calories burned during a resistance training session using MET.
 *
 * @param sessionLogs        - The session's log entries keyed by `"exerciseIdx-setIdx"`.
 * @param durationMinutes    - Total duration of the session in minutes.
 * @param bodyWeightKg       - Athlete body weight in kg (optional; defaults to 75 kg when omitted).
 * @param exerciseNames      - Optional array of exercise names in order, used to compute
 *                             the average complexity factor for the session.
 * @returns Estimated kcal burned, rounded to the nearest integer. Returns 0 if
 *          duration is zero or inputs are invalid.
 */
export const estimateCaloriesMet = (
  sessionLogs: Record<string, unknown>,
  durationMinutes: number,
  bodyWeightKg?: number | null,
  exerciseNames?: string[] | null,
): number => {
  if (!durationMinutes || durationMinutes <= 0) return 0

  const logEntries = Object.values(sessionLogs)
  let totalWeightedReps = 0
  let totalReps = 0

  for (const v of logEntries) {
    if (!v || typeof v !== 'object') continue
    const obj = v as AnyObj
    const w = Number(String(obj?.weight ?? '').replace(',', '.'))
    const r = Number(String(obj?.reps ?? '').replace(',', '.'))
    if (w > 0 && r > 0) {
      totalWeightedReps += w * r
      totalReps += r
    }
  }

  const avgWeightPerRep = totalReps > 0 ? totalWeightedReps / totalReps : 0
  const met = avgWeightPerRep < 20 ? MET_LIGHT : avgWeightPerRep < 50 ? MET_MODERATE : MET_VIGOROUS

  // Complexity factor: average across all exercises in the session
  let complexityFactor = 1.0
  if (exerciseNames && exerciseNames.length > 0) {
    const factors = exerciseNames.map(getExerciseComplexityFactor)
    complexityFactor = factors.reduce((a, b) => a + b, 0) / factors.length
  }

  // Body weight: use provided value when valid (20–300 kg), else default
  const bw = bodyWeightKg != null && Number.isFinite(bodyWeightKg) && bodyWeightKg >= 20 && bodyWeightKg <= 300
    ? bodyWeightKg
    : DEFAULT_BODY_WEIGHT_KG

  const kcal = met * complexityFactor * bw * (durationMinutes / 60)
  return Number.isFinite(kcal) && kcal > 0 ? Math.round(kcal) : 0
}
