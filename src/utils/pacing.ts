const DEFAULT_SECONDS_PER_REP = 4;
const DEFAULT_CARDIO_MINUTES = 5;
const DEFAULT_REST_SECONDS = 60;
const SET_OVERHEAD_SECONDS = 5;

export function isCardioExercise(ex: any): boolean {
  const method = (ex?.method || '').toLowerCase();
  const type = (ex?.type || '').toLowerCase();
  const name = (ex?.name || '').toLowerCase();
  return method === 'cardio' || type === 'cardio' || /cardio|run|corrida|bike|cicl|esteira/.test(name);
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

export function calculateExerciseDuration(ex: any): number {
  if (!ex) return 0;
  const reps = parseInt(ex.reps) || 10;
  const sets = parseInt(ex.sets) || 1;
  const restRaw = parseInt(ex.restTime);
  const rest = Number.isFinite(restRaw) && restRaw > 0 ? restRaw : DEFAULT_REST_SECONDS;

  if (isCardioExercise(ex)) {
    const minutes = reps || DEFAULT_CARDIO_MINUTES;
    return minutes * 60;
  }

  const perRep = parseCadenceSecondsPerRep(String(ex.cadence || ''));
  const perSetExecution = (perRep * reps) + SET_OVERHEAD_SECONDS;
  const perSetTotal = perSetExecution + rest;
  return perSetTotal * sets;
}

export function estimateExerciseSeconds(ex: any): number {
  return calculateExerciseDuration(ex)
}

export function estimateWorkoutSeconds(exercises: any[]): number {
  const list = Array.isArray(exercises) ? exercises : [];
  return list.reduce((acc, ex) => acc + estimateExerciseSeconds(ex), 0);
}

export function calculateExerciseDurationForGroup(ex: any, groupSize: number): number {
  const size = Number.isFinite(groupSize) && groupSize > 1 ? Math.floor(groupSize) : 1;
  if (size <= 1) return calculateExerciseDuration(ex);
  if (!ex) return 0;

  if (isCardioExercise(ex)) {
    const base = calculateExerciseDuration(ex);
    return base * size;
  }

  const reps = parseInt(ex.reps) || 10;
  const setsRaw = parseInt(ex.sets);
  const sets = Math.max(1, Number.isFinite(setsRaw) && setsRaw > 0 ? setsRaw : 1);
  const restRaw = parseInt(ex.restTime);
  const baseRest = Number.isFinite(restRaw) && restRaw > 0 ? restRaw : DEFAULT_REST_SECONDS;
  const perRep = parseCadenceSecondsPerRep(String(ex.cadence || ''));
  const perSetExecution = (perRep * reps) + SET_OVERHEAD_SECONDS;
  const restPerCycle = Math.max(baseRest, (size - 1) * perSetExecution);
  const totalExecutionAll = size * sets * perSetExecution;
  const totalRest = (sets - 1) * restPerCycle;
  return totalExecutionAll + totalRest;
}

export function estimateWorkoutSecondsForGroup(exercises: any[], groupSize: number): number {
  const size = Number.isFinite(groupSize) && groupSize > 1 ? Math.floor(groupSize) : 1;
  const list = Array.isArray(exercises) ? exercises : [];
  if (size <= 1) return estimateWorkoutSeconds(list);
  return list.reduce((acc, ex) => acc + calculateExerciseDurationForGroup(ex, size), 0);
}

export function toMinutesRounded(seconds: number): string {
  const mins = Math.round((Number(seconds) || 0) / 60)
  return String(mins)
}
