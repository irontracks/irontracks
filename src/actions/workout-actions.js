/*
  Client-safe action helpers.

  This module is imported by multiple client components:
  - '@/actions/workout-actions'

  Defensive coding rules:
  - Never assume auth/user exists.
  - Wrap all async logic in try/catch.
  - Prefer returning structured results instead of crashing UI.
*/

import { createClient } from '@/utils/supabase/client';
import { normalizeWorkoutTitle } from '@/utils/workoutTitle';

const errMsg = (e, fallback = 'Erro inesperado') => {
  try {
    const msg = e?.message ? String(e.message) : String(e);
    const cleaned = msg?.trim?.() ? msg.trim() : '';
    return cleaned || fallback;
  } catch {
    return fallback;
  }
};

const getSupabase = () => {
  try {
    return createClient();
  } catch (e) {
    return { __error: errMsg(e, 'Falha ao inicializar Supabase') };
  }
};

const getAuthedUserId = async () => {
  try {
    const supabase = getSupabase();
    if (supabase?.__error) return { ok: false, error: String(supabase.__error) };

    const { data, error } = await supabase.auth.getUser();
    if (error) return { ok: false, error: errMsg(error, 'Falha ao validar autenticação') };
    const userId = data?.user?.id ? String(data.user.id) : '';
    if (!userId) return { ok: false, error: 'unauthorized' };
    return { ok: true, userId };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Falha ao validar autenticação') };
  }
};

const parseTrainingNumberOrZero = (v) => {
  try {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const raw = String(v ?? '').replace(',', '.');
    const cleaned = raw.replace(/[^0-9.\-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
};

const safeParseSession = (notes) => {
  try {
    if (!notes) return null;
    if (typeof notes === 'object') return notes;
    const raw = String(notes || '').trim();
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
};

const getExercisePlannedSetsCount = (ex) => {
  try {
    const bySets = Math.max(0, Number(ex?.sets) || 0);
    const byDetails = Array.isArray(ex?.setDetails) ? ex.setDetails.length : Array.isArray(ex?.set_details) ? ex.set_details.length : 0;
    return Math.max(bySets, byDetails);
  } catch {
    return 0;
  }
};

const buildBestByExerciseFromSession = (session, onlyNames) => {
  const base = session && typeof session === 'object' ? session : null;
  const logs = base?.logs && typeof base.logs === 'object' ? base.logs : {};
  const exercises = Array.isArray(base?.exercises) ? base.exercises : [];
  const out = new Map();

  exercises.forEach((ex, exIdx) => {
    const name = String(ex?.name || '').trim();
    if (!name) return;
    if (onlyNames && !onlyNames.has(name)) return;

    const setsCount = getExercisePlannedSetsCount(ex);
    let bestWeight = 0;
    let bestReps = 0;
    let bestVolume = 0;

    for (let setIdx = 0; setIdx < setsCount; setIdx += 1) {
      const key = `${exIdx}-${setIdx}`;
      const log = logs?.[key];
      if (!log || typeof log !== 'object') continue;
      if (!log?.done) continue;
      const weight = parseTrainingNumberOrZero(log?.weight);
      const reps = parseTrainingNumberOrZero(log?.reps);
      if (weight > bestWeight) bestWeight = weight;
      if (reps > bestReps) bestReps = reps;
      const vol = weight * reps;
      if (vol > bestVolume) bestVolume = vol;
    }

    const prev = out.get(name) || { weight: 0, reps: 0, volume: 0 };
    out.set(name, {
      weight: Math.max(prev.weight, bestWeight),
      reps: Math.max(prev.reps, bestReps),
      volume: Math.max(prev.volume, bestVolume),
    });
  });

  return out;
};

const sumVolumeFromLogs = (session) => {
  try {
    const base = session && typeof session === 'object' ? session : null;
    const logs = base?.logs && typeof base.logs === 'object' ? base.logs : {};
    let total = 0;
    Object.values(logs).forEach((log) => {
      if (!log || typeof log !== 'object') return;
      if (!log?.done) return;
      const weight = parseTrainingNumberOrZero(log?.weight);
      const reps = parseTrainingNumberOrZero(log?.reps);
      const vol = weight * reps;
      if (Number.isFinite(vol) && vol > 0) total += vol;
    });
    return total;
  } catch {
    return 0;
  }
};

const buildExercisesPayload = (workout) => {
  const exs = Array.isArray(workout?.exercises) ? workout.exercises : [];
  return exs
    .filter((ex) => ex && typeof ex === 'object')
    .map((ex, idx) => {
      const setDetails = Array.isArray(ex?.setDetails)
        ? ex.setDetails
        : Array.isArray(ex?.set_details)
          ? ex.set_details
          : null;
      const headerSets = Number.parseInt(String(ex?.sets ?? ''), 10) || 0;
      const numSets = headerSets || (Array.isArray(setDetails) ? setDetails.length : 0);
      const sets = [];
      for (let i = 0; i < numSets; i += 1) {
        const s = Array.isArray(setDetails) ? setDetails[i] : null;
        sets.push({
          weight: s?.weight ?? null,
          reps: s?.reps ?? ex?.reps ?? null,
          rpe: s?.rpe ?? ex?.rpe ?? null,
          set_number: s?.set_number ?? i + 1,
          completed: false,
          is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
          advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null,
        });
      }
      return {
        name: String(ex?.name || '').trim(),
        notes: ex?.notes != null ? String(ex.notes) : '',
        video_url: ex?.videoUrl ?? ex?.video_url ?? null,
        rest_time: ex?.restTime ?? ex?.rest_time ?? null,
        cadence: ex?.cadence ?? null,
        method: ex?.method ?? null,
        order: Number.isFinite(ex?.order) ? ex.order : idx,
        sets,
      };
    });
};

// -------------------------------
// CRUD (templates)
// -------------------------------

export async function createWorkout(workout) {
  try {
    const supabase = getSupabase();
    if (supabase?.__error) throw new Error(String(supabase.__error));

    const auth = await getAuthedUserId();
    if (!auth.ok) throw new Error(auth.error);

    const title = normalizeWorkoutTitle(workout?.title ?? workout?.name ?? 'Novo Treino');
    const notes = workout?.notes != null ? String(workout.notes) : '';
    const exercisesPayload = buildExercisesPayload(workout);

    const { data: workoutId, error } = await supabase.rpc('save_workout_atomic', {
      p_workout_id: null,
      p_user_id: auth.userId,
      p_created_by: auth.userId,
      p_is_template: true,
      p_name: title,
      p_notes: notes,
      p_exercises: exercisesPayload,
    });
    if (error) throw error;
    if (!workoutId) throw new Error('Falha ao salvar treino');
    return { ok: true, id: String(workoutId) };
  } catch (e) {
    // Keep compatibility with call sites that don't check `ok`.
    return { ok: false, error: errMsg(e, 'Falha ao criar treino') };
  }
}

export async function updateWorkout(workoutId, workout) {
  try {
    const supabase = getSupabase();
    if (supabase?.__error) throw new Error(String(supabase.__error));

    const auth = await getAuthedUserId();
    if (!auth.ok) throw new Error(auth.error);

    const id = String(workoutId || '').trim();
    if (!id) throw new Error('ID do treino ausente');

    const title = normalizeWorkoutTitle(workout?.title ?? workout?.name ?? 'Treino');
    const notes = workout?.notes != null ? String(workout.notes) : '';
    const exercisesPayload = buildExercisesPayload(workout);

    const { data: savedId, error } = await supabase.rpc('save_workout_atomic', {
      p_workout_id: id,
      p_user_id: auth.userId,
      p_created_by: auth.userId,
      p_is_template: true,
      p_name: title,
      p_notes: notes,
      p_exercises: exercisesPayload,
    });
    if (error) throw error;
    if (!savedId) throw new Error('Falha ao salvar treino');
    return { ok: true, id: String(savedId) };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Falha ao atualizar treino') };
  }
}

export async function deleteWorkout(workoutId) {
  try {
    const supabase = getSupabase();
    if (supabase?.__error) return { success: false, error: String(supabase.__error) };

    const id = String(workoutId || '').trim();
    if (!id) return { success: false, error: 'ID do treino ausente' };

    // Delete children first (no assumption about cascading).
    const { data: exs, error: exErr } = await supabase.from('exercises').select('id').eq('workout_id', id);
    if (exErr) throw exErr;
    const exIds = (Array.isArray(exs) ? exs : []).map((r) => r?.id).filter(Boolean);
    if (exIds.length) {
      const { error: setsErr } = await supabase.from('sets').delete().in('exercise_id', exIds);
      if (setsErr) throw setsErr;
    }
    const { error: exDelErr } = await supabase.from('exercises').delete().eq('workout_id', id);
    if (exDelErr) throw exDelErr;

    const { error: wErr } = await supabase.from('workouts').delete().eq('id', id);
    if (wErr) throw wErr;

    return { success: true };
  } catch (e) {
    return { success: false, error: errMsg(e, 'Falha ao excluir treino') };
  }
}

export async function importData(payload) {
  try {
    const workouts = Array.isArray(payload?.workouts) ? payload.workouts : [];
    if (workouts.length === 0) return { ok: true, imported: 0 };
    let imported = 0;
    for (const w of workouts) {
      const res = await createWorkout(w);
      if (!res?.ok) return { ok: false, error: String(res?.error || 'Falha ao importar um treino') };
      imported += 1;
    }
    return { ok: true, imported };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Falha ao importar dados') };
  }
}

// -------------------------------
// Stats / gamification
// -------------------------------

export async function computeWorkoutStreakAndStats() {
  try {
    const supabase = getSupabase();
    if (supabase?.__error) return { ok: false, error: String(supabase.__error) };

    const auth = await getAuthedUserId();
    if (!auth.ok) return { ok: false, error: auth.error };

    const { data: rows, error } = await supabase
      .from('workouts')
      .select('id, name, date, created_at, notes')
      .eq('user_id', auth.userId)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .limit(600);
    if (error) throw error;

    const arr = Array.isArray(rows) ? rows : [];
    const daySet = new Set();
    let totalVolumeKg = 0;
    for (const r of arr) {
      try {
        const raw = r?.date ?? r?.created_at;
        const ms = raw ? new Date(raw).getTime() : Number.NaN;
        if (Number.isFinite(ms)) daySet.add(new Date(ms).toISOString().slice(0, 10));
      } catch {}
      try {
        const session = safeParseSession(r?.notes);
        totalVolumeKg += sumVolumeFromLogs(session);
      } catch {}
    }

    const days = Array.from(daySet)
      .map((d) => String(d))
      .filter(Boolean)
      .map((d) => ({ day: d, ms: new Date(`${d}T00:00:00.000Z`).getTime() }))
      .filter((x) => Number.isFinite(x.ms))
      .sort((a, b) => a.ms - b.ms);

    let bestStreak = 0;
    let run = 0;
    for (let i = 0; i < days.length; i += 1) {
      if (i === 0) {
        run = 1;
      } else {
        const diff = days[i].ms - days[i - 1].ms;
        run = diff === 24 * 60 * 60 * 1000 ? run + 1 : 1;
      }
      if (run > bestStreak) bestStreak = run;
    }

    let currentStreak = 0;
    const latestMs = days.length ? days[days.length - 1].ms : 0;
    if (latestMs) {
      let cursor = latestMs;
      while (true) {
        const iso = new Date(cursor).toISOString().slice(0, 10);
        if (!daySet.has(iso)) break;
        currentStreak += 1;
        cursor -= 24 * 60 * 60 * 1000;
        if (currentStreak > 370) break;
      }
    }

    const totalWorkouts = arr.length;
    const badges = [];
    if (totalWorkouts > 0) {
      badges.push({ id: 'first_workout', label: 'Primeiro treino', kind: 'milestone' });
    }

    const streakMilestones = [3, 7, 14, 30, 60, 100];
    streakMilestones.forEach((m) => {
      if (currentStreak >= m) badges.push({ id: `streak_${m}`, label: `Streak ${m} dias`, kind: 'streak' });
    });

    const volumeMilestones = [5000, 20000, 50000, 100000, 250000, 500000, 1000000];
    volumeMilestones.forEach((m) => {
      if (totalVolumeKg >= m) badges.push({ id: `volume_${m}`, label: `Volume ${Number(m).toLocaleString('pt-BR')}kg`, kind: 'volume' });
    });

    return {
      ok: true,
      data: {
        currentStreak,
        bestStreak,
        totalWorkouts,
        totalVolumeKg: Math.round(totalVolumeKg),
        badges,
      },
    };
  } catch (e) {
    return {
      ok: true,
      data: {
        currentStreak: 0,
        bestStreak: 0,
        totalWorkouts: 0,
        totalVolumeKg: 0,
        badges: [],
      },
      error: errMsg(e, 'Falha ao calcular estatísticas'),
    };
  }
}

export async function getIronRankLeaderboard(limitCount = 100) {
  try {
    const supabase = getSupabase();
    if (supabase?.__error) return { ok: false, error: String(supabase.__error) };

    const limit = Number(limitCount);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(200, Math.floor(limit)) : 50;
    const { data, error } = await supabase.rpc('iron_rank_leaderboard', { limit_count: safeLimit });
    if (error) return { ok: false, error: errMsg(error, 'Falha ao carregar ranking') };
    const rows = Array.isArray(data) ? data : [];
    return {
      ok: true,
      data: rows.map((r) => ({
        userId: String(r?.userId ?? r?.user_id ?? '').trim(),
        displayName: r?.displayName != null ? String(r.displayName) : r?.display_name != null ? String(r.display_name) : null,
        photoUrl: r?.photoUrl != null ? String(r.photoUrl) : r?.photo_url != null ? String(r.photo_url) : null,
        role: r?.role != null ? String(r.role) : null,
        totalVolumeKg: Number(r?.totalVolumeKg ?? r?.total_volume_kg ?? 0) || 0,
      })),
    };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Falha ao carregar ranking') };
  }
}

export async function getLatestWorkoutPrs() {
  // Keep interface expected by RecentAchievements.tsx
  // { ok: boolean, prs: [], workout?: { date, title } }
  try {
    const supabase = getSupabase();
    if (supabase?.__error) return { ok: false, error: String(supabase.__error), prs: [] };

    const auth = await getAuthedUserId();
    if (!auth.ok) return { ok: false, error: auth.error, prs: [] };

    const { data: latest, error } = await supabase
      .from('workouts')
      .select('id, name, date, created_at, notes')
      .eq('user_id', auth.userId)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!latest?.id) return { ok: true, prs: [], workout: null };

    const session = safeParseSession(latest?.notes);
    const bestNow = buildBestByExerciseFromSession(session);
    const names = new Set(Array.from(bestNow.keys()));
    if (!names.size) {
      return {
        ok: true,
        prs: [],
        workout: { date: latest?.date ?? latest?.created_at ?? null, title: String(latest?.name || 'Treino') },
      };
    }

    const { data: histRows, error: histErr } = await supabase
      .from('workouts')
      .select('id, notes')
      .eq('user_id', auth.userId)
      .eq('is_template', false)
      .neq('id', latest.id)
      .order('date', { ascending: false })
      .limit(260);
    if (histErr) throw histErr;

    const bestPrev = new Map();
    (Array.isArray(histRows) ? histRows : []).forEach((r) => {
      const s = safeParseSession(r?.notes);
      const map = buildBestByExerciseFromSession(s, names);
      map.forEach((val, key) => {
        const prev = bestPrev.get(key) || { weight: 0, reps: 0, volume: 0 };
        bestPrev.set(key, {
          weight: Math.max(prev.weight, val.weight || 0),
          reps: Math.max(prev.reps, val.reps || 0),
          volume: Math.max(prev.volume, val.volume || 0),
        });
      });
    });

    const prs = [];
    bestNow.forEach((val, exercise) => {
      const prev = bestPrev.get(exercise) || { weight: 0, reps: 0, volume: 0 };
      if ((val.weight || 0) > (prev.weight || 0) && val.weight > 0) {
        prs.push({
          exercise,
          label: 'Peso',
          value: `${Number(val.weight).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}kg`,
          _sort: val.volume || val.weight,
        });
      }
      if ((val.reps || 0) > (prev.reps || 0) && val.reps > 0) {
        prs.push({
          exercise,
          label: 'Reps',
          value: `${Number(val.reps).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`,
          _sort: val.volume || val.reps,
        });
      }
      if ((val.volume || 0) > (prev.volume || 0) && val.volume > 0) {
        prs.push({
          exercise,
          label: 'Volume',
          value: `${Math.round(Number(val.volume)).toLocaleString('pt-BR')}kg`,
          _sort: val.volume,
        });
      }
    });

    prs.sort((a, b) => (b?._sort || 0) - (a?._sort || 0));

    return {
      ok: true,
      prs: prs.slice(0, 10).map(({ _sort, ...rest }) => rest),
      workout: { date: latest?.date ?? latest?.created_at ?? null, title: String(latest?.name || 'Treino') },
    };
  } catch (e) {
    return { ok: true, prs: [], workout: null, error: errMsg(e, 'Falha ao buscar PRs') };
  }
}

// -------------------------------
// AI helpers (safe stubs)
// -------------------------------

export async function generatePostWorkoutInsights(_) {
  return { ok: false, error: 'IA em manutenção (insights pós-treino indisponíveis).' };
}

export async function applyProgressionToNextTemplate(_) {
  return { ok: false, error: 'IA em manutenção (progressão automática indisponível).' };
}

export async function generatePeriodReportInsights(_) {
  return { ok: false, error: 'IA em manutenção (insights do período indisponíveis).' };
}

export async function generateAssessmentPlanAi(input) {
  // Provide a deterministic fallback so the UI can show something useful.
  try {
    const studentName = String(input?.studentName || '').trim() || 'Aluno';
    const goal = String(input?.goal || '').trim();
    const lines = [];
    lines.push(`Plano tático (fallback) para ${studentName}`);
    if (goal) lines.push(`Objetivo: ${goal}`);
    lines.push('');
    lines.push('Foco 14 dias:');
    lines.push('- 3 treinos/semana (Full body)');
    lines.push('- Progressão: +1 rep por série até o topo da faixa; depois +2,5kg');
    lines.push('- Cardio: 2x/semana 20-30min Z2');
    lines.push('- Sono: meta 7-8h; hidratação 30-40ml/kg');
    const plan = lines.join('\n');
    return { ok: true, usedAi: false, reason: 'fallback', plan };
  } catch (e) {
    return { ok: false, usedAi: false, reason: 'fallback_failed', error: errMsg(e, 'Falha ao gerar plano') };
  }
}
