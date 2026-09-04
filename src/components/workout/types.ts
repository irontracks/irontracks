
import type { Exercise, Workout, UserRecord, ActiveWorkoutSession, UnknownRecord } from '@/types/app';
import type { SetType } from '@/types/workout';

export type { UnknownRecord } from '@/types/app';
export type { SetType } from '@/types/workout';

export type UserProfile = Partial<UserRecord> & { id?: string };

export type WorkoutExercise = Omit<Partial<Exercise>, 'setDetails'> & {
  name?: string;
  weight?: number | string | null;
  rest?: number | string | null;
  setDetails?: WorkoutSetDetail[] | null;
  set_details?: WorkoutSetDetail[] | null;
  rest_time?: Exercise['restTime'] | null;
  video_url?: string | null;
  exercise_id?: string;
  exercise_library_id?: string;
  // snake_case aliases from DB
  is_unilateral?: boolean;
  side_rest_time?: number | string | null;
  transition_time?: number | string | null;
  /**
   * De onde veio a observação (`notes`) que está na tela AGORA.
   *
   * `'ai'` = gerada pela máquina ao trocar o exercício, e por isso desenhada na
   * cor da MÁQUINA (violeta) em vez de se passar pela palavra do professor —
   * o card chama esse campo de "Observação do professor".
   *
   * Vive só na SESSÃO: a rota de update monta colunas explícitas, então este
   * campo é descartado na fronteira e nunca chega ao banco nem ao payload do
   * bootstrap (cuja allowlist ele quebraria).
   */
  notesSource?: 'ai' | null;
};

export type WorkoutSetDetail = {
  set_number?: number | null;
  setNumber?: number | null;
  reps?: string | number | null;
  rpe?: number | string | null;
  weight?: number | null;
  is_warmup?: boolean | null;
  isWarmup?: boolean | null;
  set_type?: SetType | null;
  setType?: SetType | null;
  advanced_config?: unknown;
  advancedConfig?: unknown;
  notes?: string | null;
  completed?: boolean | null;
  [k: string]: unknown;
};

export type WorkoutDraft = Omit<Partial<Workout>, 'exercises'> & {
  exercises?: WorkoutExercise[];
  workout_id?: string | null;
};

export type WorkoutSession = Omit<Partial<ActiveWorkoutSession>, 'workout'> & {
  workout?: WorkoutDraft | null;
};

export type ActiveWorkoutProps = {
  session: WorkoutSession | null;
  user: UserProfile | null;
  settings?: UnknownRecord | null;
  onUpdateLog?: (key: string, updates: UnknownRecord) => void;
  onFinish?: (session: WorkoutSession | null, showReport: boolean) => void;
  onPersistWorkoutTemplate?: (workout: WorkoutDraft) => void;
  onBack?: () => void;
  onStartTimer?: (seconds: number, context: unknown) => void;
  isCoach?: boolean;
  onUpdateSession?: (updates: UnknownRecord) => void;
  nextWorkout?: UnknownRecord | null;
  onEditWorkout?: () => void;
  onAddExercise?: () => void;
  /** Name of the teacher controlling this session (null = not controlled) */
  controlledByName?: string | null;
  /** #autoload: liga/desliga a carga automática (persiste em settings.autoLoad). */
  onToggleAutoLoad?: (next: boolean) => void;
  /**
   * Deload por-exercício: liga/desliga o deload do motor novo pra UM exercício
   * (chave normalizada). Persiste em settings.autoLoadDeloadOff (lista de chaves
   * com deload off). Mesmo padrão do onToggleAutoLoad (updateSetting otimista + save).
   */
  onToggleExerciseDeload?: (exerciseKey: string, nextEnabled: boolean) => void;
  /** Liga/desliga a descarga do TREINO inteiro (chave = nome normalizado). */
  onToggleWorkoutDeload?: (workoutKey: string, nextEnabled: boolean) => void;
  /**
   * Calculadora de anilhas: persiste o inventário do usuário em
   * settings.plateInventory / settings.barWeightKg. Mesmo padrão do onToggleAutoLoad
   * (updateSetting otimista + save), porque o sheet edita direto no toque do stepper.
   */
  onSavePlateSetup?: (counts: Record<string, number>, barWeightKg: number) => void;
};

export type ReportHistoryItem = {
  ts: number;
  avgWeight: number | null;
  avgReps: number | null;
  totalVolume: number;
  topWeight: number | null;
  setsCount: number;
  name?: string;
  /**
   * Per-set arrays. Indexed by setIdx so consumers can reliably read
   * `setWeights[setIdx]` and get the value for that specific set. A `null`
   * slot means the set was not logged or had no value (this is intentional —
   * filtering nulls would shift later sets down and corrupt the lookup).
   */
  setWeights?: (number | null)[] | null;
  setReps?: (number | null)[] | null;
  setRpes?: (number | null)[] | null;
  setNotes?: (string | null)[] | null;
  /**
   * Séries levadas à FALHA muscular (flag `failure` do log), por índice de série.
   * Alimenta duas coisas: a marca 💥 no histórico e — mais importante — a trava
   * anti-progressão do motor de carga (`suggestWeight` segura o peso quando a
   * última sessão foi à falha). Sem este array o motor NUNCA enxergava as falhas:
   * a trava existia no código mas o dado nunca chegava nela.
   */
  setFailures?: (boolean | null)[] | null;
  /**
   * Drop-set per-set, per-stage history. `dropSetStages[setIdx]` is the array
   * of stage objects logged on that set (or `null` if the set wasn't a drop
   * set). Lets the drop-set modal placeholder show the actual previous weight
   * for each stage instead of the same average across all of them.
   */
  dropSetStages?: (Array<{ weight: number | null; reps: number | null }> | null)[] | null;
  /**
   * A sessão teve DELOAD aplicado neste exercício (o log da série carrega o campo
   * `deload`). As cargas são baixas de propósito, então esta sessão não serve como
   * referência de progressão: o motor de carga a interpretava como regressão real
   * do atleta, ancorava a trava anti-regressão no peso reduzido e, com o teto de
   * +10% por sessão, levava várias sessões para voltar ao patamar anterior —
   * punindo quem fez um deload planejado. O dado é preservado (aparece no
   * histórico); quem consome decide se usa.
   */
  deloadApplied?: boolean;
  /**
   * Treino de ORIGEM desta sessão (nome normalizado), porque o histórico é
   * agrupado por nome de exercício e o mesmo exercício vive em treinos diferentes.
   *
   * Caso real do dono: "Remada na máquina" aparece em cinco treinos, com cargas
   * que não se comparam — 110 kg no "TER · Pull", 90 no "QUA · Upper A", 40 no
   * "QUA · Costas + Ombro". Só no dia 14/07 o exercício apareceu em três treinos
   * com 60, 110 e 100 kg. Agregado por nome, a série temporal viravam ruído:
   * o motor ancorava na carga de outro treino e o deload lia a alternância de
   * contexto como "carga caiu" (falso positivo confirmado em 29/07).
   */
  workoutKey?: string;
};

export type ReportHistory = {
  version: number;
  exercises: Record<string, { name: string; items: ReportHistoryItem[] }>;
};

export type AiRecommendation = { weight: number | null; reps: number | null; rpe: number | null };
export type DeloadSetEntries = Record<string, { weight: number | null; reps: number | null; rpe: number | null }>;
export type DeloadAnalysis = {
  status: 'overtraining' | 'stagnation' | 'stable';
  volumeDelta: number | null;
  weightDelta: number | null;
  /** Sessões consideradas na análise. */
  itemsCount: number;
  /**
   * Havia histórico suficiente para o status significar algo. Com menos de
   * DELOAD_HISTORY_MIN sessões, `volumeDelta`/`weightDelta` ficam null e o status
   * cai em 'stable' por ausência de dado — o que dava ao usuário uma frase de
   * análise ("progressão estável") calculada sobre 1 ponto. O status continua
   * preenchido para não quebrar quem já consome, mas quem for AFIRMAR algo deve
   * checar esta flag primeiro.
   */
  hasEnoughHistory: boolean;
};

export type DeloadSuggestion =
  | {
    ok: true;
    name: string;
    exIdx: number;
    baseWeight: number;
    suggestedWeight: number;
    appliedReduction: number;
    targetReduction: number;
    historyCount: number;
    minWeight: number;
    analysis: DeloadAnalysis;
  }
  | { ok: false; error: string };

export type DeloadSetSuggestion =
  | { ok: true; name: string; key: string; entries: DeloadSetEntries; itemsCount: number; baseSuggestion: DeloadSuggestion | null }
  | { ok: false; error: string };
