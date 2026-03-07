const DEFAULT_SECONDS_PER_REP = 4;
const DEFAULT_CARDIO_MINUTES = 5;
const DEFAULT_REST_SECONDS = 60;
const SET_OVERHEAD_SECONDS = 5;

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

export function isCardioExercise(ex: Record<string, unknown> | null): boolean {
  const e = isRecord(ex) ? ex : {}
  const method = String(e?.method ?? '').toLowerCase();
  const type = String(e?.type ?? '').toLowerCase();
  const name = String(e?.name ?? '').toLowerCase();
  return method === 'cardio' || type === 'cardio' || /cardio|run|corrida|bike|cicl|esteira/.test(name);
}

function isBikeOutdoorCardio(ex: Record<string, unknown> | null): boolean {
  try {
    const e = isRecord(ex) ? ex : {}
    const method = String(e?.method ?? '').toLowerCase();
    const type = String(e?.type ?? '').toLowerCase();
    const name = String(e?.name ?? '').toLowerCase();
    const isCardio = method === 'cardio' || type === 'cardio' || name.includes('cardio');
    if (!isCardio) return false;
    const isBike = /bike|bicic|bici|cicl|pedal/.test(name);
    if (!isBike) return false;
    const isOutdoor = /outdoor|\bout\b|rua|extern/.test(name);
    return isOutdoor;
  } catch {
    return false;
  }
}

export function parseCadenceSecondsPerRep(cadence: string | undefined): number {
  try {
    if (!cadence || typeof cadence !== 'string') return DEFAULT_SECONDS_PER_REP;
    const digits = cadence.match(/\d/g);
    if (!digits || digits.length === 0) return DEFAULT_SECONDS_PER_REP;
    const sum = digits.reduce((acc, d) => acc + parseInt(d, 10), 0);
    return isNaN(sum) ? DEFAULT_SECONDS_PER_REP : sum;
  } catch {
    return DEFAULT_SECONDS_PER_REP;
  }
}

export function calculateExerciseDuration(ex: Record<string, unknown> | null): number {
  const e = isRecord(ex) ? ex : null
  if (!e) return 0;
  if (isCardioExercise(e)) {
    const minutesRaw = Number.parseInt(String(e?.reps ?? ''), 10);
    const minutes = Number.isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : null;
    if (isBikeOutdoorCardio(e)) return minutes ? minutes * 60 : 0;
    return (minutes ?? DEFAULT_CARDIO_MINUTES) * 60;
  }

  const reps = Number.parseInt(String(e.reps ?? ''), 10) || 10;
  const sets = Number.parseInt(String(e.sets ?? ''), 10) || 1;
  const restRaw = Number.parseInt(String(e.restTime ?? ''), 10);
  const rest = Number.isFinite(restRaw) && restRaw > 0 ? restRaw : DEFAULT_REST_SECONDS;

  const perRep = parseCadenceSecondsPerRep(String(e.cadence ?? ''));
  const perSetExecution = (perRep * reps) + SET_OVERHEAD_SECONDS;
  const perSetTotal = perSetExecution + rest;
  return perSetTotal * sets;
}

export function estimateExerciseSeconds(ex: Record<string, unknown> | null): number {
  return calculateExerciseDuration(ex)
}

export function estimateWorkoutSeconds(exercises: Array<Record<string, unknown>>): number {
  const list = Array.isArray(exercises) ? exercises : [];
  return list.reduce((acc, ex) => acc + estimateExerciseSeconds(ex), 0);
}

export function calculateExerciseDurationForGroup(ex: Record<string, unknown> | null, groupSize: number): number {
  const size = Number.isFinite(groupSize) && groupSize > 1 ? Math.floor(groupSize) : 1;
  if (size <= 1) return calculateExerciseDuration(ex);
  const e = isRecord(ex) ? ex : null
  if (!e) return 0;

  if (isCardioExercise(e)) {
    const base = calculateExerciseDuration(e);
    return base * size;
  }

  const reps = Number.parseInt(String(e.reps ?? ''), 10) || 10;
  const setsRaw = Number.parseInt(String(e.sets ?? ''), 10);
  const sets = Math.max(1, Number.isFinite(setsRaw) && setsRaw > 0 ? setsRaw : 1);
  const restRaw = Number.parseInt(String(e.restTime ?? ''), 10);
  const baseRest = Number.isFinite(restRaw) && restRaw > 0 ? restRaw : DEFAULT_REST_SECONDS;
  const perRep = parseCadenceSecondsPerRep(String(e.cadence ?? ''));
  const perSetExecution = (perRep * reps) + SET_OVERHEAD_SECONDS;
  const restPerCycle = Math.max(baseRest, (size - 1) * perSetExecution);
  const totalExecutionAll = size * sets * perSetExecution;
  const totalRest = (sets - 1) * restPerCycle;
  return totalExecutionAll + totalRest;
}

export function estimateWorkoutSecondsForGroup(exercises: Array<Record<string, unknown>>, groupSize: number): number {
  const size = Number.isFinite(groupSize) && groupSize > 1 ? Math.floor(groupSize) : 1;
  const list = Array.isArray(exercises) ? exercises : [];
  if (size <= 1) return estimateWorkoutSeconds(list);
  return list.reduce((acc, ex) => acc + calculateExerciseDurationForGroup(ex, size), 0);
}

export function toMinutesRounded(seconds: number): string {
  const mins = Math.round((Number(seconds) || 0) / 60)
  return String(mins)
}
