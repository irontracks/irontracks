export const MUSCLE_GROUPS = [
  { id: 'chest', label: 'Peitoral', minSets: 8, maxSets: 16, view: 'front' },
  { id: 'delts_front', label: 'Deltoide (frontal)', minSets: 6, maxSets: 14, view: 'front' },
  { id: 'delts_side', label: 'Deltoide (lateral)', minSets: 8, maxSets: 16, view: 'front' },
  { id: 'biceps', label: 'Bíceps', minSets: 6, maxSets: 14, view: 'front' },
  { id: 'triceps', label: 'Tríceps', minSets: 6, maxSets: 14, view: 'front' },
  { id: 'abs', label: 'Abdômen', minSets: 4, maxSets: 12, view: 'front' },
  { id: 'quads', label: 'Quadríceps', minSets: 8, maxSets: 18, view: 'front' },
  { id: 'calves', label: 'Panturrilhas', minSets: 6, maxSets: 16, view: 'front' },
  { id: 'lats', label: 'Dorsais', minSets: 8, maxSets: 18, view: 'back' },
  { id: 'upper_back', label: 'Costas (superior)', minSets: 8, maxSets: 18, view: 'back' },
  { id: 'delts_rear', label: 'Deltoide (posterior)', minSets: 6, maxSets: 14, view: 'back' },
  { id: 'spinal_erectors', label: 'Eretores', minSets: 4, maxSets: 10, view: 'back' },
  { id: 'glutes', label: 'Glúteos', minSets: 8, maxSets: 18, view: 'back' },
  { id: 'hamstrings', label: 'Posteriores', minSets: 8, maxSets: 18, view: 'back' },
] as const

export type MuscleId = (typeof MUSCLE_GROUPS)[number]['id']

export const MUSCLE_BY_ID = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m.id, m])) as Record<
  MuscleId,
  (typeof MUSCLE_GROUPS)[number]
>

export const DEFAULT_WEEK_START = 'monday' as const

