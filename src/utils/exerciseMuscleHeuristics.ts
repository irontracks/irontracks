import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import type { MuscleId } from '@/utils/muscleMapConfig'

type Contribution = { muscleId: MuscleId; weight: number; role: 'primary' | 'secondary' | 'stabilizer' }

export type HeuristicExerciseMap = {
  exercise_key: string
  canonical_name: string
  mapping: {
    contributions: Contribution[]
    unilateral: boolean
    confidence: number
    notes: string
  }
  confidence: number
  source: 'heuristic'
}

const detect = (normalized: string, tokens: string[]) => tokens.some((t) => normalized.includes(t))

const make = (
  key: string,
  raw: string,
  contributions: Contribution[],
  unilateral = false,
  confidence = 0.82,
  notes = '',
): HeuristicExerciseMap => ({
  exercise_key: key,
  canonical_name: raw,
  mapping: { contributions, unilateral, confidence, notes: notes || `heuristic: ${contributions[0]?.muscleId ?? 'unknown'}` },
  confidence,
  source: 'heuristic',
})

export function buildHeuristicExerciseMap(canonicalName: string): HeuristicExerciseMap | null {
  const raw = String(canonicalName || '').trim()
  if (!raw) return null
  const key = normalizeExerciseName(raw)
  if (!key) return null

  const n = key
  const match = (tokens: string[]) => detect(n, tokens)
  const matchAll = (tokens: string[]) => tokens.every((t) => n.includes(t))

  // IDs válidos do MuscleId:
  // chest | delts_front | delts_side | biceps | triceps | abs | quads | calves | forearms
  // lats | upper_back | delts_rear | spinal_erectors | glutes | hamstrings

  // ── PANTURRILHA ────────────────────────────────────────────────────
  const isCalves =
    match(['panturr', 'calf', 'soleo', 'soleus', 'gastro', 'gastrocnem', 'gemeo', 'gemeos'])
    || matchAll(['leg press', 'panturr'])
  if (isCalves) return make(key, raw, [{ muscleId: 'calves', weight: 1, role: 'primary' }], false, 0.85, 'heuristic: calves')

  // ── ABDÔMEN ────────────────────────────────────────────────────────
  const isAbs = match(['abdomin', 'crunch', 'prancha', 'plank', 'vacuum', 'obliquo', 'situp', 'sit up'])
    || matchAll(['elevacao', 'pernas'])
    || matchAll(['elevação', 'pernas'])
  if (isAbs) return make(key, raw, [{ muscleId: 'abs', weight: 1, role: 'primary' }], false, 0.82, 'heuristic: abs')

  // ── PEITORAL: FLY / CRUCIFIXO ───────────────────────────────────────
  const isFly = match(['fly', 'flye', 'crucifixo', 'peck deck', 'pec deck', 'crossover', 'cross over', 'voador'])
  if (isFly) {
    return make(key, raw, [
      { muscleId: 'chest', weight: 0.80, role: 'primary' },
      { muscleId: 'delts_front', weight: 0.15, role: 'secondary' },
      { muscleId: 'biceps', weight: 0.05, role: 'stabilizer' },
    ], false, 0.82, 'heuristic: chest_fly')
  }

  // ── PEITORAL: PRESS / SUPINO ─────────────────────────────────────
  const isChestPress = match(['supino', 'chest press', 'bench press'])
  if (isChestPress) {
    const isIncline = match(['inclinado', 'incline'])
    const isDecline = match(['declinado', 'decline'])
    const contribs: Contribution[] = isIncline
      ? [
        { muscleId: 'chest', weight: 0.65, role: 'primary' },
        { muscleId: 'delts_front', weight: 0.25, role: 'secondary' },
        { muscleId: 'triceps', weight: 0.10, role: 'stabilizer' },
      ]
      : isDecline
        ? [
          { muscleId: 'chest', weight: 0.80, role: 'primary' },
          { muscleId: 'triceps', weight: 0.15, role: 'secondary' },
          { muscleId: 'delts_front', weight: 0.05, role: 'stabilizer' },
        ]
        : [
          { muscleId: 'chest', weight: 0.65, role: 'primary' },
          { muscleId: 'delts_front', weight: 0.20, role: 'secondary' },
          { muscleId: 'triceps', weight: 0.15, role: 'secondary' },
        ]
    return make(key, raw, contribs, false, 0.85, 'heuristic: chest')
  }

  // ── DELTOIDE LATERAL ───────────────────────────────────────────────
  const isSideDelt =
    match(['elevacao lateral', 'elevação lateral', 'lateral raise', 'side raise', 'side lateral'])
    || matchAll(['elevacao', 'lateral'])
  if (isSideDelt) {
    return make(key, raw, [
      { muscleId: 'delts_side', weight: 0.80, role: 'primary' },
      { muscleId: 'delts_front', weight: 0.10, role: 'secondary' },
      { muscleId: 'upper_back', weight: 0.10, role: 'secondary' },
    ], true, 0.85, 'heuristic: delts_side')
  }

  // ── DELTOIDE FRONTAL ───────────────────────────────────────────────
  const isFrontDelt = match(['elevacao frontal', 'elevação frontal', 'front raise', 'raise frontal'])
  if (isFrontDelt) {
    return make(key, raw, [
      { muscleId: 'delts_front', weight: 0.80, role: 'primary' },
      { muscleId: 'chest', weight: 0.10, role: 'secondary' },
      { muscleId: 'delts_side', weight: 0.10, role: 'secondary' },
    ], true, 0.85, 'heuristic: delts_front')
  }

  // ── OMBRO / DESENVOLVIMENTO / PRESS ──────────────────────────────
  const isShoulderPress =
    match(['desenvolvimento', 'shoulder press', 'overhead press', 'military press', 'press militar', 'press ombro', 'arnold'])
    && !match(['supino'])
  if (isShoulderPress) {
    return make(key, raw, [
      { muscleId: 'delts_front', weight: 0.50, role: 'primary' },
      { muscleId: 'delts_side', weight: 0.25, role: 'secondary' },
      { muscleId: 'triceps', weight: 0.20, role: 'secondary' },
      { muscleId: 'upper_back', weight: 0.05, role: 'stabilizer' },
    ], false, 0.82, 'heuristic: shoulder_press')
  }

  // ── FACE PULL / DELTOIDE POSTERIOR ───────────────────────────────
  const isFacePull = match(['face pull', 'facepull'])
  if (isFacePull) {
    return make(key, raw, [
      { muscleId: 'delts_rear', weight: 0.50, role: 'primary' },
      { muscleId: 'upper_back', weight: 0.30, role: 'secondary' },
      { muscleId: 'biceps', weight: 0.20, role: 'secondary' },
    ], false, 0.83, 'heuristic: face_pull')
  }

  // ── ENCOLHIMENTO / TRAPÉZIO ───────────────────────────────────────
  const isTraps = match(['encolhimento', 'shrug', 'trapezio', 'trapézio'])
  if (isTraps) {
    return make(key, raw, [
      { muscleId: 'upper_back', weight: 0.85, role: 'primary' },
      { muscleId: 'delts_rear', weight: 0.15, role: 'secondary' },
    ], false, 0.83, 'heuristic: upper_back')
  }

  // ── COSTAS: PUXADA / PULLDOWN ─────────────────────────────────────
  const isPulldown = match(['puxada', 'pulldown', 'pull down', 'pull up', 'pullup', 'barra fixa', 'chin up', 'chinup'])
  if (isPulldown) {
    return make(key, raw, [
      { muscleId: 'lats', weight: 0.65, role: 'primary' },
      { muscleId: 'biceps', weight: 0.25, role: 'secondary' },
      { muscleId: 'delts_rear', weight: 0.10, role: 'secondary' },
    ], false, 0.85, 'heuristic: lats_pull')
  }

  // ── COSTAS: REMADA ────────────────────────────────────────────────
  const isRow = match(['remada', 'row', 'serrote'])
  if (isRow) {
    return make(key, raw, [
      { muscleId: 'lats', weight: 0.45, role: 'primary' },
      { muscleId: 'upper_back', weight: 0.25, role: 'secondary' },
      { muscleId: 'biceps', weight: 0.20, role: 'secondary' },
      { muscleId: 'delts_rear', weight: 0.10, role: 'secondary' },
    ], false, 0.83, 'heuristic: lats_row')
  }

  // ── ANTEBRAÇO (isolado) ──────────────────────────────────────────
  const isForearms =
    match(['antebraco', 'antebraço', 'wrist curl', 'wrist extension', 'rosca punho', 'rosca inversa punho',
      'farmer', 'farmers carry', 'farmers walk', 'zottman', 'reverse curl', 'rosca inversa',
      'pronador', 'supinador', 'flexao punho', 'flexão punho', 'extensao punho', 'extensão punho'])
  if (isForearms) return make(key, raw, [
    { muscleId: 'forearms', weight: 0.85, role: 'primary' },
    { muscleId: 'biceps', weight: 0.15, role: 'secondary' },
  ], match(['unilateral']), 0.85, 'heuristic: forearms')

  // ── BÍCEPS ────────────────────────────────────────────────────────
  const isBiceps =
    match(['rosca', 'bicep', 'curl', 'scott', 'concentrado', 'hammer', 'martelo', 'zottman'])
    && !match(['tricep', 'trícep'])
  if (isBiceps) {
    // Hammer Curl / Martelo / Zottman: primarily forearms (brachioradialis)
    const isHammer = match(['hammer', 'martelo'])
    if (isHammer) return make(key, raw, [
      { muscleId: 'forearms', weight: 0.55, role: 'primary' },
      { muscleId: 'biceps', weight: 0.35, role: 'secondary' },
      { muscleId: 'delts_front', weight: 0.10, role: 'stabilizer' },
    ], true, 0.87, 'heuristic: forearms_hammer')
    return make(key, raw, [
      { muscleId: 'biceps', weight: 0.80, role: 'primary' },
      { muscleId: 'forearms', weight: 0.10, role: 'secondary' },
      { muscleId: 'delts_front', weight: 0.10, role: 'secondary' },
    ], match(['alternado', 'unilateral', 'concentrado']), 0.85, 'heuristic: biceps')
  }

  // ── TRÍCEPS ──────────────────────────────────────────────────────
  const isTriceps =
    match(['tricep', 'trícep', 'pushdown', 'push down', 'skullcrusher', 'skull crusher', 'frances', 'francês', 'mergulho', 'dip', 'coice', 'kickback', 'testa'])
    && !match(['bicep'])
  if (isTriceps) {
    const isUnilateral = match(['coice', 'kickback', 'unilateral'])
    return make(key, raw, [
      { muscleId: 'triceps', weight: 0.85, role: 'primary' },
      { muscleId: 'chest', weight: 0.10, role: 'secondary' },
      { muscleId: 'delts_front', weight: 0.05, role: 'stabilizer' },
    ], isUnilateral, 0.85, 'heuristic: triceps')
  }

  // ── QUADRÍCEPS ───────────────────────────────────────────────────
  const isQuads =
    match(['agachamento', 'squat', 'extensora', 'hack', 'sissy'])
    || (match(['leg press']) && !match(['panturr', 'calf']))
    || match(['cadeira extensora'])
  if (isQuads) {
    const isIsolation = match(['extensora', 'extension'])
    return make(key, raw, isIsolation
      ? [{ muscleId: 'quads', weight: 1, role: 'primary' }]
      : [
        { muscleId: 'quads', weight: 0.55, role: 'primary' },
        { muscleId: 'glutes', weight: 0.30, role: 'secondary' },
        { muscleId: 'hamstrings', weight: 0.15, role: 'secondary' },
      ],
      false, 0.82, 'heuristic: quads')
  }

  // ── POSTERIOR DE COXA ────────────────────────────────────────────
  const isHamstrings =
    match(['mesa flexora', 'flexora', 'leg curl', 'hamstring', 'stiff', 'terra romeno', 'romanian', 'rdl'])
    || match(['levantamento terra'])
  if (isHamstrings) {
    const isIsolation = match(['flexora', 'leg curl'])
    return make(key, raw, isIsolation
      ? [{ muscleId: 'hamstrings', weight: 1, role: 'primary' }]
      : [
        { muscleId: 'hamstrings', weight: 0.55, role: 'primary' },
        { muscleId: 'glutes', weight: 0.30, role: 'secondary' },
        { muscleId: 'spinal_erectors', weight: 0.15, role: 'stabilizer' },
      ],
      false, 0.83, 'heuristic: hamstrings')
  }

  // ── GLÚTEOS ──────────────────────────────────────────────────────
  const isGlutes =
    match(['hip thrust', 'hipthrust', 'gluteo', 'glúteo', 'passada', 'avanco', 'avanço', 'lunge', 'abducao', 'abdução', 'kickback gluteo'])
    || matchAll(['extensao', 'quadril'])
    || matchAll(['extensão', 'quadril'])
  if (isGlutes) {
    const isAbduction = match(['abducao', 'abdução', 'abdutora'])
    return make(key, raw, isAbduction
      ? [
        { muscleId: 'glutes', weight: 0.70, role: 'primary' },
        { muscleId: 'hamstrings', weight: 0.30, role: 'secondary' },
      ]
      : [
        { muscleId: 'glutes', weight: 0.65, role: 'primary' },
        { muscleId: 'hamstrings', weight: 0.25, role: 'secondary' },
        { muscleId: 'quads', weight: 0.10, role: 'secondary' },
      ],
      false, 0.82, 'heuristic: glutes')
  }

  // ── LOMBAR / ERETORES ────────────────────────────────────────────
  const isLowerBack = match(['lombar', 'lower back', 'hiperextensao', 'hiperextensão', 'back extension'])
  if (isLowerBack) {
    return make(key, raw, [
      { muscleId: 'spinal_erectors', weight: 0.65, role: 'primary' },
      { muscleId: 'glutes', weight: 0.20, role: 'secondary' },
      { muscleId: 'hamstrings', weight: 0.15, role: 'secondary' },
    ], false, 0.80, 'heuristic: spinal_erectors')
  }

  return null
}
