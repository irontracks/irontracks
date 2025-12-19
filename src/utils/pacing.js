'use client'

export const parseCadenceSecondsPerRep = (cadence) => {
  try {
    if (!cadence || typeof cadence !== 'string') return 4;
    const digits = cadence.match(/\d/g);
    if (!digits || digits.length === 0) return 4;
    const sum = digits.reduce((acc, d) => acc + parseInt(d, 10), 0);
    return isNaN(sum) ? 4 : sum;
  } catch {
    return 4;
  }
};

export const isCardioExercise = (ex) => {
  const m = (ex?.method || '').toLowerCase();
  const name = (ex?.name || '').toLowerCase();
  const type = (ex?.type || '').toLowerCase();
  return type === 'cardio' || m === 'cardio' || /cardio|run|corrida|bike|cicl|esteira/.test(name);
};

export const estimateExerciseSeconds = (ex) => {
  if (!ex) return 0;
  const reps = parseInt(ex.reps) || 10;
  const sets = parseInt(ex.sets) || 1;
  const rest = parseInt(ex.restTime) || 0; // seconds
  if (isCardioExercise(ex)) {
    return (reps || 5) * 60; // treat reps as minutes for cardio
  }
  const perRep = parseCadenceSecondsPerRep(String(ex.cadence || ''));
  const perSet = (perRep * reps) + rest;
  return perSet * sets;
};

export const estimateWorkoutSeconds = (exercises) => {
  const list = Array.isArray(exercises) ? exercises : [];
  return list.reduce((acc, ex) => acc + estimateExerciseSeconds(ex), 0);
};

export const toMinutesRounded = (seconds) => Math.round((seconds || 0) / 60);

