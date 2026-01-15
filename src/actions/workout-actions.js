'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { deleteTemplateFromSubscribers, syncTemplateToSubscribers } from '@/lib/workoutSync';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseTrainingNumber, parseTrainingNumberOrZero } from '@/utils/trainingNumber';
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'

const SETS_INSERT_CHUNK_SIZE = 200;

const POST_WORKOUT_AI_MODEL_ID = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash';

const extractJsonFromText = (raw) => {
    const text = String(raw || '').trim();
    if (!text) return null;

    let candidate = text;
    if (candidate.startsWith('```')) {
        const firstBreak = candidate.indexOf('\n');
        const lastFence = candidate.lastIndexOf('```');
        if (firstBreak !== -1 && lastFence !== -1) {
            candidate = candidate.substring(firstBreak + 1, lastFence).trim();
        }
    }

    try {
        return JSON.parse(candidate);
    } catch {
        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) return null;
        const slice = candidate.substring(start, end + 1);
        try {
            return JSON.parse(slice);
        } catch {
            return null;
        }
    }
};

export async function generateAssessmentPlanAi(payload) {
    try {
        const safePayload = payload && typeof payload === 'object' ? payload : {};
        const assessment = safePayload.assessment && typeof safePayload.assessment === 'object' ? safePayload.assessment : null;
        const studentName = String(safePayload.studentName || '').trim() || 'Aluno';
        const trainerName = String(safePayload.trainerName || '').trim() || 'Coach';
        const goal = String(safePayload.goal || safePayload.goals || '').trim();

        if (!assessment || typeof assessment !== 'object') {
            return {
                ok: false,
                error: 'Avaliação inválida para gerar plano tático',
            };
        }

        const weight = Number(assessment.weight ?? assessment.weight_kg ?? 0) || 0;
        const height = Number(assessment.height ?? assessment.height_cm ?? 0) || 0;
        const age = Number(assessment.age ?? 0) || 0;
        const gender = String(assessment.gender || '').toUpperCase();
        const bodyFat = Number(assessment.body_fat_percentage ?? assessment.bf ?? 0) || 0;
        const leanMass = Number(assessment.lean_mass ?? 0) || null;
        const fatMass = Number(assessment.fat_mass ?? 0) || null;
        const bmi = Number(assessment.bmi ?? 0) || 0;
        const bmr = Number(assessment.bmr ?? 0) || 0;
        const tdee = Number(assessment.tdee ?? 0) || 0;

        const safeMetrics = {
            weight,
            height,
            age,
            gender,
            bodyFat,
            leanMass,
            fatMass,
            bmi,
            bmr,
            tdee,
        };

        const hasCoreData = weight > 0 && height > 0 && age > 0 && bodyFat > 0;
        if (!hasCoreData) {
            return {
                ok: true,
                plan: {
                    summary: [
                        'Preencha peso, altura, idade e dobras para liberar o plano tático automático.',
                    ],
                    training: [],
                    nutrition: [],
                    habits: [],
                    warnings: [
                        'Sem dados completos, qualquer sugestão seria chute. Priorize uma avaliação bem preenchida.',
                    ],
                },
                usedAi: false,
            };
        }

        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        if (!apiKey) {
            const basePlan = buildFallbackAssessmentPlan(studentName, trainerName, safeMetrics, goal);
            return { ok: true, plan: basePlan, usedAi: false };
        }

        const prompt =
            'Você é um treinador especialista em avaliação física e periodização de treino.' +
            ' Gere um PLANO TÁTICO de 12 semanas, objetivo e acionável, para o aluno descrito abaixo.' +
            ' Retorne APENAS um JSON válido (sem markdown) no formato:' +
            ' {' +
            '  "summary": string[],' +
            '  "training": string[],' +
            '  "nutrition": string[],' +
            '  "habits": string[],' +
            '  "warnings": string[]' +
            ' }.' +
            ' Regras: summary máx 5 itens, training máx 10, nutrition máx 8, habits máx 8, warnings máx 5.' +
            ' Fale em português brasileiro, direto para o aluno, mas com tom profissional.' +
            ' Não invente dados: se algo não estiver claro, deixe explícito nas warnings.' +
            `\n\nALUNO: ${studentName}\nCOACH: ${trainerName}` +
            '\n\nMÉTRICAS (JSON):\n' +
            JSON.stringify({
                metrics: safeMetrics,
                goal: goal || null,
            });

        let plan = null;

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: POST_WORKOUT_AI_MODEL_ID });
            const result = await model.generateContent([{ text: prompt }]);
            const response = result?.response;
            const text = (await response?.text()) || '';
            const parsed = extractJsonFromText(text);
            if (!parsed || typeof parsed !== 'object') {
                throw new Error('Falha ao interpretar resposta da IA');
            }

            plan = buildAssessmentPlanObject(parsed, safeMetrics);
        } catch {
            plan = buildFallbackAssessmentPlan(studentName, trainerName, safeMetrics, goal);
            return { ok: true, plan, usedAi: false };
        }

        return { ok: true, plan, usedAi: true };
    } catch (e) {
        const msg = e?.message ? String(e.message) : String(e);
        return { ok: false, error: msg || 'Erro ao gerar plano tático' };
    }
}

const buildAssessmentPlanObject = (raw, metrics) => {
    const base = raw && typeof raw === 'object' ? raw : {};

    const coerceStringArray = (value, max) => {
        const list = Array.isArray(value) ? value : [];
        return list
            .map((item) => String(item || '').trim())
            .filter((item) => !!item)
            .slice(0, max);
    };

    const summary = coerceStringArray(base.summary, 5);
    const training = coerceStringArray(base.training, 10);
    const nutrition = coerceStringArray(base.nutrition, 8);
    const habits = coerceStringArray(base.habits, 8);
    const warnings = coerceStringArray(base.warnings, 5);

    return {
        summary,
        training,
        nutrition,
        habits,
        warnings,
        metrics,
    };
};

const buildFallbackAssessmentPlan = (studentName, trainerName, metrics, goal) => {
    const safeGoal = String(goal || '').toLowerCase();
    const goalLabel = safeGoal.includes('perder') || safeGoal.includes('cut') ? 'redução de gordura' : safeGoal.includes('ganho') || safeGoal.includes('bulk') ? 'ganho de massa magra' : 'recomposição corporal';

    const summary = [
        `Plano de 12 semanas focado em ${goalLabel} com ajustes semanais baseados em peso e percepção de esforço.`,
        'Monitorar peso, circunferências e percepção de fadiga pelo menos 1x por semana.',
    ];

    const training = [
        'Treino de força 3-5x/semana, priorizando multiarticulares (agachamento, supino, remada, levantamento terra).',
        'Dividir em membros superiores/inferiores ou ABC simples, conforme nível do aluno.',
        'Trabalhar faixas de 6-12 repetições para grandes grupamentos e 10-15 para menores.',
        'Progredir carga ou repetições semanalmente, mantendo 1-3 repetições em reserva na maior parte das séries.',
        'Incluir 1-2 sessões leves extras de mobilidade e core por semana para saúde articular.',
    ];

    const nutrition = [
        'Garantir pelo menos 1,6-2,2g de proteína por kg de peso corporal por dia.',
        'Organizar 3-5 refeições ao dia, com fonte de proteína em todas elas.',
        'Ajustar carboidratos em torno dos treinos (mais próximos do treino, menos longe dele).',
        'Manter ingestão adequada de água (2-3L/dia, ajustando por clima e suor).',
    ];

    const habits = [
        'Dormir 7-9 horas por noite, com horário de sono o mais regular possível.',
        'Registrar treino e alimentação em aplicativo ou planilha para aumentar a aderência.',
        'Fazer caminhadas leves nos dias sem treino para melhorar recuperação e gasto calórico.',
        'Agendar reavaliação física a cada 8-12 semanas para ajustar o plano.',
    ];

    const warnings = [
        'Qualquer dor articular persistente deve ser avaliada e pode exigir ajuste de volume/carga.',
        'Evite aumentar carga e volume ao mesmo tempo; priorize progressão controlada.',
    ];

    return {
        summary,
        training,
        nutrition,
        habits,
        warnings,
        metrics,
        meta: {
            studentName,
            trainerName,
            goal: goalLabel,
        },
    };
};

export async function computeWorkoutStreakAndStats() {
    try {
        const supabase = await createClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const user = authData?.user ?? null;
        const userId = user?.id ? String(user.id) : '';
        if (!userId) return { ok: false, error: 'Unauthorized' };

        const { data, error } = await supabase
            .from('workouts')
            .select('id, date, created_at, notes, is_template')
            .eq('user_id', userId)
            .eq('is_template', false)
            .order('date', { ascending: false })
            .limit(365);

        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];
        if (!rows.length) {
            return {
                ok: true,
                data: {
                    currentStreak: 0,
                    bestStreak: 0,
                    totalWorkouts: 0,
                    totalVolumeKg: 0,
                    badges: []
                }
            };
        }

        const dayKey = (v) => {
            try {
                if (!v) return null;
                const d = v?.toDate ? v.toDate() : new Date(v);
                const iso = d.toISOString();
                return iso.slice(0, 10);
            } catch {
                return null;
            }
        };

        const daysSet = new Set();
        const byDay = new Map();

        rows.forEach((r) => {
            if (!r || typeof r !== 'object') return;
            const dk = dayKey(r.date) ?? dayKey(r.created_at);
            if (!dk) return;
            daysSet.add(dk);
            const list = byDay.get(dk) || [];
            list.push(r);
            byDay.set(dk, list);
        });

        const sortedDays = Array.from(daysSet)
            .filter((d) => typeof d === 'string' && d.length === 10)
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

        let currentStreak = 0;
        let bestStreak = 0;

        if (sortedDays.length) {
            const today = new Date();
            const todayKey = today.toISOString().slice(0, 10);
            const dayToIndex = new Map(sortedDays.map((d, idx) => [d, idx]));

            const hasDay = (key) => dayToIndex.has(key);

            let cursor = todayKey;
            let streak = 0;

            while (true) {
                if (!hasDay(cursor)) {
                    const prev = new Date(cursor + 'T00:00:00Z');
                    prev.setUTCDate(prev.getUTCDate() - 1);
                    const prevKey = prev.toISOString().slice(0, 10);
                    const earliest = sortedDays[0];
                    if (prevKey < earliest) break;
                    if (!hasDay(prevKey)) break;
                    cursor = prevKey;
                    continue;
                }

                streak += 1;
                const prev = new Date(cursor + 'T00:00:00Z');
                prev.setUTCDate(prev.getUTCDate() - 1);
                const prevKey = prev.toISOString().slice(0, 10);
                if (!hasDay(prevKey)) break;
                cursor = prevKey;
            }

            currentStreak = streak;

            let best = 0;
            let run = 1;
            for (let i = 1; i < sortedDays.length; i += 1) {
                const prev = new Date(sortedDays[i - 1] + 'T00:00:00Z');
                const cur = new Date(sortedDays[i] + 'T00:00:00Z');
                const diffDays = Math.round((cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays === 1) {
                    run += 1;
                } else {
                    if (run > best) best = run;
                    run = 1;
                }
            }
            if (run > best) best = run;
            bestStreak = best;
        }

        let totalVolumeKg = 0;
        let totalWorkouts = rows.length;

        rows.forEach((r) => {
            try {
                let notes = null;
                if (typeof r.notes === 'string') {
                    const t = r.notes.trim();
                    if (t) notes = JSON.parse(t);
                } else if (r.notes && typeof r.notes === 'object') {
                    notes = r.notes;
                }
                const logs = notes?.logs && typeof notes.logs === 'object' ? notes.logs : {};
                Object.values(logs).forEach((log) => {
                    if (!log || typeof log !== 'object') return;
                    const w = parseTrainingNumber(log?.weight);
                    const reps = parseTrainingNumber(log?.reps);
                    if (!Number.isFinite(w) || !Number.isFinite(reps)) return;
                    if (w <= 0 || reps <= 0) return;
                    totalVolumeKg += w * reps;
                });
            } catch {
                return;
            }
        });

        const badges = [];

        if (totalWorkouts >= 1) {
            badges.push({ id: 'first_workout', label: 'Primeiro Treino', kind: 'milestone' });
        }
        if (currentStreak >= 3) {
            badges.push({ id: 'streak_3', label: '3 Dias Seguidos', kind: 'streak' });
        }
        if (currentStreak >= 7) {
            badges.push({ id: 'streak_7', label: '7 Dias Seguidos', kind: 'streak' });
        }
        if (bestStreak >= 30) {
            badges.push({ id: 'streak_30', label: '30 Dias de Foco', kind: 'streak' });
        }
        if (totalVolumeKg >= 50000) {
            badges.push({ id: 'volume_50k', label: '50.000kg Levantados', kind: 'volume' });
        }
        if (totalVolumeKg >= 100000) {
            badges.push({ id: 'volume_100k', label: '100.000kg Levantados', kind: 'volume' });
        }

        return {
            ok: true,
            data: {
                currentStreak,
                bestStreak,
                totalWorkouts,
                totalVolumeKg,
                badges
            }
        };
    } catch (e) {
        const msg = e?.message ? String(e.message) : String(e);
        return { ok: false, error: msg || 'Erro ao calcular conquistas' };
    }
}

const normalizeSessionForAi = (session, user) => {
    const s = session && typeof session === 'object' ? session : null;
    if (!s) return null;

    const exercisesArr = Array.isArray(s.exercises) ? s.exercises : [];
    const logsObj = s.logs && typeof s.logs === 'object' ? s.logs : {};

    const maxExercises = 40;
    const maxSetsTotal = 260;
    const maxSetsPerExercise = 20;

    let remainingSets = maxSetsTotal;
    const exercises = exercisesArr.slice(0, maxExercises).map((ex, exIdx) => {
        const exSafe = ex && typeof ex === 'object' ? ex : {};
        const name = String(exSafe.name || '').trim();
        const targetReps = String(exSafe.reps ?? '').trim();
        const method = String(exSafe.method ?? '').trim();
        const notes = String(exSafe.notes ?? '').trim();

        const requestedSets = Number(exSafe.sets) || 0;
        const cap = Math.max(0, Math.min(maxSetsPerExercise, requestedSets, remainingSets));
        remainingSets -= cap;

        const sets = Array.from({ length: cap }).map((_, setIndex) => {
            const key = `${exIdx}-${setIndex}`;
            const log = logsObj?.[key] && typeof logsObj[key] === 'object' ? logsObj[key] : {};

            const restPauseActivation = (() => {
                try {
                    const rp = log?.rest_pause && typeof log.rest_pause === 'object' ? log.rest_pause : null;
                    const v = parseTrainingNumber(rp?.activation_reps);
                    return Number.isFinite(v) && v > 0 ? v : null;
                } catch {
                    return null;
                }
            })();

            return {
                set: setIndex + 1,
                weight: String(log?.weight ?? '').trim(),
                reps: String(log?.reps ?? '').trim(),
                done: !!log?.done,
                rpe: log?.rpe ?? null,
                advanced_config: log?.advanced_config ?? log?.advancedConfig ?? null,
                rest_pause_activation_reps: restPauseActivation
            };
        });

        return {
            name,
            targetReps,
            method,
            notes,
            sets
        };
    }).filter((x) => !!x && typeof x === 'object' && String(x.name || '').length > 0);

    const teamMeta = s.teamMeta && typeof s.teamMeta === 'object' ? s.teamMeta : null;
    const participants = Array.isArray(teamMeta?.participants) ? teamMeta.participants : [];
    const myId = user?.id ? String(user.id) : null;
    const hasMe = myId ? participants.some((p) => {
        const pid = p?.uid ?? p?.id ?? p?.user_id ?? p?.userId ?? null;
        return pid != null && String(pid) === myId;
    }) : false;
    const teamSize = Math.max(1, participants.length + (hasMe ? 0 : 1));

    const workoutTitle = String(s.workoutTitle || s.title || '').trim() || 'Treino';
    const durationSeconds = Number(s.realTotalTime ?? s.totalTime ?? 0) || 0;
    const dateIso = (() => {
        const d = s.date;
        if (!d) return null;
        if (typeof d === 'string') return d;
        try {
            const dt = d?.toDate ? d.toDate() : new Date(d);
            const t = dt?.getTime?.();
            if (!Number.isFinite(t)) return null;
            return new Date(t).toISOString();
        } catch {
            return null;
        }
    })();

    return {
        workoutTitle,
        dateIso,
        durationSeconds,
        teamSize,
        exercises
    };
};

const computeSessionMetrics = (normalized) => {
    const base = normalized && typeof normalized === 'object' ? normalized : null;
    if (!base) return null;

    const exercises = Array.isArray(base.exercises) ? base.exercises : [];
    let totalVolumeKg = 0;
    let totalSetsDone = 0;

    const perExercise = exercises.map((ex) => {
        const name = String(ex?.name || '').trim();
        if (!name) return null;
        const sets = Array.isArray(ex?.sets) ? ex.sets : [];
        let volumeKg = 0;
        let setsDone = 0;
        let topWeight = 0;
        let topReps = 0;

        const isClusterSet = (cfg) => {
            try {
                const c = cfg && typeof cfg === 'object' ? cfg : null;
                if (!c) return false;
                const hasCluster = c.cluster_size != null;
                const hasIntra = c.intra_rest_sec != null;
                const hasTotal = c.total_reps != null;
                return (hasCluster && hasIntra) || (hasCluster && hasTotal) || (hasIntra && hasTotal);
            } catch {
                return false;
            }
        };

        sets.forEach((s) => {
            const repsTotal = parseTrainingNumberOrZero(s?.reps);
            const rpAct = parseTrainingNumber(s?.rest_pause_activation_reps);
            const repsStrength = Number.isFinite(rpAct) && rpAct > 0 ? rpAct : repsTotal;
            const weight = parseTrainingNumberOrZero(s?.weight);
            const done = !!s?.done;
            const adv = s?.advanced_config ?? s?.advancedConfig ?? null;
            const isCluster = isClusterSet(adv);
            if (done) {
                setsDone += 1;
                const setVolume = weight * repsTotal;
                if (Number.isFinite(setVolume) && setVolume > 0) {
                    volumeKg += setVolume;
                }
                if (!isCluster) {
                    if (Number.isFinite(weight) && weight > topWeight) topWeight = weight;
                    if (Number.isFinite(repsStrength) && repsStrength > topReps) topReps = repsStrength;
                }
            }
        });

        totalVolumeKg += volumeKg;
        totalSetsDone += setsDone;

        return {
            name,
            volumeKg,
            setsDone,
            topWeight,
            topReps
        };
    }).filter((ex) => ex && typeof ex === 'object');

    const topExercises = [...perExercise]
        .filter((ex) => Number.isFinite(ex.volumeKg) && ex.volumeKg > 0)
        .sort((a, b) => b.volumeKg - a.volumeKg)
        .slice(0, 5);

    return {
        totalVolumeKg,
        totalSetsDone,
        totalExercises: perExercise.length,
        topExercises
    };
};

const computeDeterministicPrs = async (supabase, user, workoutId, normalized) => {
    try {
        const base = normalized && typeof normalized === 'object' ? normalized : null;
        if (!base) return [];

        const exercises = Array.isArray(base.exercises) ? base.exercises : [];
        const currentByName = new Map();

        exercises.forEach((ex) => {
            const name = String(ex?.name || '').trim();
            if (!name) return;
            const sets = Array.isArray(ex?.sets) ? ex.sets : [];
            let bestWeight = 0;
            let bestReps = 0;
            let bestVolume = 0;

            const isClusterSet = (cfg) => {
                try {
                    const c = cfg && typeof cfg === 'object' ? cfg : null;
                    if (!c) return false;
                    const hasCluster = c.cluster_size != null;
                    const hasIntra = c.intra_rest_sec != null;
                    const hasTotal = c.total_reps != null;
                    return (hasCluster && hasIntra) || (hasCluster && hasTotal) || (hasIntra && hasTotal);
                } catch {
                    return false;
                }
            };

            sets.forEach((s) => {
                const repsTotal = parseTrainingNumberOrZero(s?.reps);
                const rpAct = parseTrainingNumber(s?.rest_pause_activation_reps);
                const repsStrength = Number.isFinite(rpAct) && rpAct > 0 ? rpAct : repsTotal;
                const weight = parseTrainingNumberOrZero(s?.weight);
                const done = !!s?.done;
                if (!done) return;
                const adv = s?.advanced_config ?? s?.advancedConfig ?? null;
                const isCluster = isClusterSet(adv);
                if (!isCluster) {
                    if (Number.isFinite(weight) && weight > bestWeight) bestWeight = weight;
                    if (Number.isFinite(repsStrength) && repsStrength > bestReps) bestReps = repsStrength;
                }
                const vol = weight * repsTotal;
                if (Number.isFinite(vol) && vol > bestVolume) bestVolume = vol;
            });

            const prev = currentByName.get(name) || { weight: 0, reps: 0, volume: 0 };
            currentByName.set(name, {
                weight: Math.max(prev.weight, bestWeight),
                reps: Math.max(prev.reps, bestReps),
                volume: Math.max(prev.volume, bestVolume)
            });
        });

        if (!currentByName.size) return [];

        const userId = user?.id ? String(user.id) : '';
        if (!userId) return [];

        const query = supabase
            .from('workouts')
            .select('id, notes')
            .eq('user_id', userId)
            .eq('is_template', false);

        if (workoutId) {
            query.neq('id', workoutId);
        }

        const { data, error } = await query;
        if (error || !Array.isArray(data)) return [];

        const bestHistoryByName = new Map();

        for (const row of data) {
            if (!row) continue;
            let session = null;
            try {
                if (typeof row.notes === 'string') session = JSON.parse(row.notes);
                else if (row.notes && typeof row.notes === 'object') session = row.notes;
            } catch {
                session = null;
            }
            if (!session || typeof session !== 'object') continue;

            const normalizedSession = normalizeSessionForAi(session, user);
            const exArr = normalizedSession && Array.isArray(normalizedSession.exercises) ? normalizedSession.exercises : [];

            exArr.forEach((ex) => {
                const name = String(ex?.name || '').trim();
                if (!name) return;
                const sets = Array.isArray(ex?.sets) ? ex.sets : [];
                let bestWeight = 0;
                let bestReps = 0;
                let bestVolume = 0;

                sets.forEach((s) => {
                    const reps = parseTrainingNumberOrZero(s?.reps);
                    const weight = parseTrainingNumberOrZero(s?.weight);
                    const done = !!s?.done;
                    if (!done) return;
                    if (Number.isFinite(weight) && weight > bestWeight) bestWeight = weight;
                    if (Number.isFinite(reps) && reps > bestReps) bestReps = reps;
                    const vol = weight * reps;
                    if (Number.isFinite(vol) && vol > bestVolume) bestVolume = vol;
                });

                const prev = bestHistoryByName.get(name) || { weight: 0, reps: 0, volume: 0 };
                bestHistoryByName.set(name, {
                    weight: Math.max(prev.weight, bestWeight),
                    reps: Math.max(prev.reps, bestReps),
                    volume: Math.max(prev.volume, bestVolume)
                });
            });
        }

        const prs = [];

        currentByName.forEach((current, name) => {
            const history = bestHistoryByName.get(name) || { weight: 0, reps: 0, volume: 0 };
            const weightPr = Number.isFinite(current.weight) && current.weight > 0 && current.weight > (history.weight || 0);
            const repsPr = Number.isFinite(current.reps) && current.reps > 0 && current.reps > (history.reps || 0);
            const volumePr = Number.isFinite(current.volume) && current.volume > 0 && current.volume > (history.volume || 0);

            if (!weightPr && !repsPr && !volumePr) return;

            if (volumePr) {
                prs.push({
                    exercise: name,
                    label: 'Volume',
                    value: `${current.volume.toLocaleString('pt-BR')}kg`
                });
                return;
            }

            if (weightPr) {
                prs.push({
                    exercise: name,
                    label: 'Carga',
                    value: `${current.weight.toLocaleString('pt-BR')}kg`
                });
                return;
            }

            if (repsPr) {
                prs.push({
                    exercise: name,
                    label: 'Reps',
                    value: `${current.reps} reps`
                });
            }
        });

        prs.sort((a, b) => {
            const av = Number(String(a.value).replace(/[^0-9.,]/g, '').replace('.', '').replace(',', '.')) || 0;
            const bv = Number(String(b.value).replace(/[^0-9.,]/g, '').replace('.', '').replace(',', '.')) || 0;
            return bv - av;
        });

        return prs.slice(0, 10);
    } catch {
        return [];
    }
};

const buildPostWorkoutAiObject = (source, metrics, deterministicPrs) => {
    const base = source && typeof source === 'object' ? source : {};
    const safePrs = Array.isArray(deterministicPrs) ? deterministicPrs : [];

    return {
        summary: Array.isArray(base.summary)
            ? base.summary
                  .map((x) => String(x || '').trim())
                  .filter((x) => x)
                  .slice(0, 6)
            : [],
        highlights: Array.isArray(base.highlights)
            ? base.highlights
                  .map((x) => String(x || '').trim())
                  .filter((x) => x)
                  .slice(0, 5)
            : [],
        progression: Array.isArray(base.progression)
            ? base.progression
                  .map((x) => {
                      if (!x || typeof x !== 'object') return null;
                      return {
                          exercise: String(x.exercise || '').trim(),
                          recommendation: String(x.recommendation || '').trim(),
                          reason: String(x.reason || '').trim()
                      };
                  })
                  .filter((x) => x && x.exercise && x.recommendation)
                  .slice(0, 10)
            : [],
        motivation: String(base.motivation || '').trim(),
        prs: safePrs,
        warnings: Array.isArray(base.warnings)
            ? base.warnings
                  .map((x) => String(x || '').trim())
                  .filter((x) => x)
                  .slice(0, 5)
            : [],
        metrics,
        meta: {
            model: base.meta && typeof base.meta === 'object' && base.meta.model ? String(base.meta.model).trim() : POST_WORKOUT_AI_MODEL_ID,
            generatedAt:
                base.meta && typeof base.meta === 'object' && base.meta.generatedAt
                    ? String(base.meta.generatedAt).trim()
                    : new Date().toISOString()
        }
    };
};

export async function generatePostWorkoutInsights(payload) {
    try {
        const supabase = await createClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const user = authData?.user ?? null;
        if (!user) return { ok: false, error: 'Unauthorized' };

        const workoutId = typeof payload?.workoutId === 'string' ? payload.workoutId : null;

        const normalized = normalizeSessionForAi(payload?.session, user);
        if (!normalized) return { ok: false, error: 'Sessão inválida' };
        const metrics = computeSessionMetrics(normalized);
        const deterministicPrs = await computeDeterministicPrs(supabase, user, workoutId, normalized);

        let existingAi = null;
        if (workoutId) {
            try {
                const { data: row, error: rowErr } = await supabase
                    .from('workouts')
                    .select('id, notes')
                    .eq('id', workoutId)
                    .eq('user_id', user.id)
                    .maybeSingle();
                if (!rowErr && row) {
                    let current = null;
                    try {
                        if (typeof row.notes === 'string') current = JSON.parse(row.notes);
                        else if (row.notes && typeof row.notes === 'object') current = row.notes;
                    } catch {
                        current = null;
                    }
                    if (current && typeof current === 'object' && current.ai && typeof current.ai === 'object') {
                        existingAi = current.ai;
                    }
                }
            } catch {
                existingAi = null;
            }
        }

        if (existingAi) {
            const aiFromExisting = buildPostWorkoutAiObject(existingAi, metrics, deterministicPrs);
            return { ok: true, ai: aiFromExisting, saved: true };
        }

        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        if (!apiKey) {
            const aiNoApi = buildPostWorkoutAiObject(null, metrics, deterministicPrs);
            return { ok: true, ai: aiNoApi, saved: false };
        }

        const prompt =
            'Você é um treinador especialista em musculação. Analise o treino abaixo e gere INSIGHTS objetivos e acionáveis.' +
            ' Retorne APENAS um JSON válido (sem markdown) seguindo estritamente esta estrutura:' +
            ' {' +
            '"summary": string[],' +
            '"highlights": string[],' +
            '"progression": {"exercise": string, "recommendation": string, "reason": string}[],' +
            '"motivation": string,' +
            '"prs": {"exercise": string, "label": string, "value": string}[],' +
            '"warnings": string[]' +
            ' }.' +
            ' Regras: summary max 6 itens, highlights max 5, progression max 10, warnings max 5.' +
            ' Seja específico. Não invente dados. Se faltar dado, diga "insuficiente" e recomende o que registrar.' +
            '\n\nTREINO (JSON):\n' +
            JSON.stringify(normalized);

        let ai = null;
        let saved = false;

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: POST_WORKOUT_AI_MODEL_ID });
            const result = await model.generateContent([{ text: prompt }]);
            const response = result?.response;
            const text = (await response?.text()) || '';
            const parsed = extractJsonFromText(text);
            if (!parsed || typeof parsed !== 'object') {
                throw new Error('Falha ao interpretar resposta da IA');
            }

            const obj = parsed;
            ai = buildPostWorkoutAiObject(obj, metrics, deterministicPrs);

            if (workoutId) {
                const { data: row, error: rowErr } = await supabase
                    .from('workouts')
                    .select('id, notes')
                    .eq('id', workoutId)
                    .eq('user_id', user.id)
                    .maybeSingle();
                if (!rowErr && row) {
                    let current = null;
                    try {
                        if (typeof row.notes === 'string') current = JSON.parse(row.notes);
                        else if (row.notes && typeof row.notes === 'object') current = row.notes;
                    } catch {
                        current = null;
                    }

                    const nextSession = current && typeof current === 'object' ? { ...current, ai } : { ai };
                    const { error: upErr } = await supabase
                        .from('workouts')
                        .update({ notes: JSON.stringify(nextSession) })
                        .eq('id', workoutId)
                        .eq('user_id', user.id);
                    if (!upErr) saved = true;
                }
            }
        } catch {
            ai = buildPostWorkoutAiObject(null, metrics, deterministicPrs);
            saved = false;
        }

        try {
            revalidatePath('/');
        } catch {}

        return { ok: true, ai, saved };
    } catch (e) {
        const msg = e?.message ? String(e.message) : String(e);
        return { ok: false, error: msg || 'Erro inesperado ao gerar insights' };
    }
}

const chunkArray = (arr, size) => {
    const safe = Array.isArray(arr) ? arr : [];
    const chunkSize = Math.max(1, Number(size) || 1);
    const out = [];
    for (let i = 0; i < safe.length; i += chunkSize) out.push(safe.slice(i, i + chunkSize));
    return out;
};

const insertSetsBulkSafe = async (supabase, rows) => {
    const batches = chunkArray(rows, SETS_INSERT_CHUNK_SIZE);
    for (const batch of batches) {
        if (!Array.isArray(batch) || batch.length === 0) continue;
        const { error } = await supabase.from('sets').insert(batch);
        if (!error) continue;

        const msg = String(error?.message || '').toLowerCase();
        const shouldReduce = msg.includes('advanced_config') || msg.includes('is_warmup');
        if (!shouldReduce) throw error;

        const reducedBatch = batch.map((row) => {
            if (!row || typeof row !== 'object') return row;
            const next = { ...row };
            delete next.advanced_config;
            return next;
        });

        const { error: reducedErr } = await supabase.from('sets').insert(reducedBatch);
        if (!reducedErr) continue;

        const reducedMsg = String(reducedErr?.message || '').toLowerCase();
        if (!reducedMsg.includes('is_warmup')) throw reducedErr;

        const batchHasWarmup = batch.some((row) => !!(row && typeof row === 'object' && row.is_warmup));
        if (batchHasWarmup) {
            throw new Error('Seu Supabase não tem a coluna "is_warmup" na tabela "sets". Rode a migration 20251222120000_sets_advanced_logic.sql e tente novamente.');
        }

        const finalBatch = batch.map((row) => {
            if (!row || typeof row !== 'object') return row;
            const next = { ...row };
            delete next.advanced_config;
            delete next.is_warmup;
            return next;
        });

        const { error: finalErr } = await supabase.from('sets').insert(finalBatch);
        if (finalErr) throw finalErr;
    }
};

export async function applyProgressionToNextTemplate(payload) {
    try {
        const supabase = await createClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const user = authData?.user ?? null;
        if (!user) return { ok: false, error: 'Unauthorized' };

        const session = payload && typeof payload.session === 'object' ? payload.session : null;
        if (!session) return { ok: false, error: 'Sessão inválida' };

        const rawProgression = Array.isArray(payload?.progression) ? payload.progression : [];
        const progression = rawProgression
            .map((item) => {
                if (!item || typeof item !== 'object') return null;
                const exercise = String(item.exercise || '').trim();
                const recommendation = String(item.recommendation || '').trim();
                const reason = String(item.reason || '').trim();
                if (!exercise || !recommendation) return null;
                return { exercise, recommendation, reason };
            })
            .filter((x) => x)
            .slice(0, 20);

        if (!progression.length) return { ok: false, error: 'Sem progressão para aplicar' };

        const historyIdRaw = payload?.historyId;
        const historyId =
            typeof historyIdRaw === 'string' || typeof historyIdRaw === 'number' ? historyIdRaw : null;

        let historySession = null;

        if (historyId != null) {
            try {
                const { data: row } = await supabase
                    .from('workouts')
                    .select('id, user_id, notes, name, is_template')
                    .eq('id', historyId)
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (row && row.user_id === user.id) {
                    let parsed = null;
                    try {
                        if (typeof row.notes === 'string') parsed = JSON.parse(row.notes);
                        else if (row.notes && typeof row.notes === 'object') parsed = row.notes;
                    } catch {
                        parsed = null;
                    }
                    if (parsed && typeof parsed === 'object') historySession = parsed;
                }
            } catch {
                historySession = null;
            }
        }

        const baseSession = historySession && typeof historySession === 'object' ? historySession : session;

        const baseTitle = (() => {
            const raw = baseSession?.workoutTitle || historySession?.name || session?.workoutTitle;
            const title = String(raw || '').trim();
            if (title) return title;
            return 'Treino';
        })();

        const baseTemplateId = (() => {
            const originId = baseSession?.originWorkoutId;
            const workoutId = baseSession?.workoutId;
            if (originId) return originId;
            if (workoutId) return workoutId;
            return null;
        })();

        const logs = baseSession?.logs && typeof baseSession.logs === 'object' ? baseSession.logs : {};
        const sourceExercises = Array.isArray(baseSession?.exercises) ? baseSession.exercises : [];

        const exercises = sourceExercises
            .filter((ex) => ex && typeof ex === 'object')
            .map((ex, exIdx) => {
                const name = String(ex.name || '').trim();
                const sets = Number.parseInt(ex.sets, 10) || 0;
                const reps = ex.reps || '';
                const restTime = ex.restTime != null ? Number(ex.restTime) || 0 : null;
                const cadence = ex.cadence || null;
                const method = ex.method || null;
                const notes = ex.notes || '';
                const muscleGroup = ex.muscleGroup ?? null;
                const videoUrl = ex.videoUrl ?? null;

                const setDetails = [];
                if (sets > 0) {
                    for (let i = 0; i < sets; i += 1) {
                        const key = `${exIdx}-${i}`;
                        const log = logs[key] && typeof logs[key] === 'object' ? logs[key] : null;
                        const weight = log && log.weight != null ? log.weight : null;
                        const setReps = log && log.reps != null ? log.reps : reps;
                        const rpe = log && log.rpe != null ? log.rpe : null;
                        const isWarmup = !!(log && (log.is_warmup || log.isWarmup));
                        setDetails.push({
                            reps: setReps ?? null,
                            rpe: rpe ?? null,
                            set_number: i + 1,
                            weight: weight ?? null,
                            is_warmup: isWarmup,
                            advanced_config: null
                        });
                    }
                }

                return {
                    name,
                    sets,
                    reps,
                    restTime,
                    cadence,
                    method,
                    notes,
                    muscleGroup,
                    videoUrl,
                    setDetails
                };
            });

        if (!exercises.length) return { ok: false, error: 'Sem exercícios para aplicar progressão' };

        const notesPayload = {
            type: 'ai_progression_template',
            baseTemplateId: baseTemplateId || null,
            fromHistoryId: historyId ?? null,
            originalWorkoutTitle: baseTitle,
            createdFrom: 'post_workout',
            createdAt: new Date().toISOString(),
            progression
        };

        const workout = await createWorkout({
            title: baseTitle,
            notes: JSON.stringify(notesPayload),
            exercises
        });

        return { ok: true, templateId: workout?.id || null };
    } catch (e) {
        const msg = e?.message ? String(e.message) : String(e);
        return { ok: false, error: msg || 'Erro inesperado ao aplicar progressão' };
    }
}

// WORKOUTS
export async function createWorkout(data) {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const user = authData?.user ?? null;
    if (!user) throw new Error('Unauthorized');

    const sourceExercises = Array.isArray(data?.exercises) ? data.exercises : []
    let exercisesPayload = (sourceExercises || [])
        .filter((ex) => ex && typeof ex === 'object')
        .map((ex, idx) => {
            const setDetails = Array.isArray(ex?.setDetails)
                ? ex.setDetails
                : (Array.isArray(ex?.set_details) ? ex.set_details : null);
            const headerSets = Number.parseInt(ex?.sets, 10) || 0;
            const numSets = headerSets || (Array.isArray(setDetails) ? setDetails.length : 0);
            const sets = []
            for (let i = 0; i < numSets; i += 1) {
                const s = Array.isArray(setDetails) ? (setDetails[i] || null) : null;
                sets.push({
                    weight: s?.weight ?? null,
                    reps: s?.reps ?? ex?.reps ?? null,
                    rpe: s?.rpe ?? ex?.rpe ?? null,
                    set_number: s?.set_number ?? (i + 1),
                    completed: false,
                    is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
                    advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null,
                })
            }
            return {
                name: String(ex?.name ?? ''),
                notes: String(ex?.notes ?? ''),
                video_url: ex?.videoUrl ?? null,
                rest_time: ex?.restTime ?? null,
                cadence: ex?.cadence ?? null,
                method: ex?.method ?? null,
                order: idx,
                sets,
            }
        });

    try {
        const missing = exercisesPayload
            .map((ex) => {
                const name = String(ex?.name ?? '').trim();
                const hasVideo = !!String(ex?.video_url ?? '').trim();
                if (!name || hasVideo) return null;
                const normalized = normalizeExerciseName(name);
                if (!normalized) return null;
                return normalized;
            })
            .filter(Boolean);

        const unique = Array.from(new Set(missing));
        if (unique.length) {
            const admin = createAdminClient();
            const { data: lib } = await admin
                .from('exercise_library')
                .select('normalized_name, video_url')
                .in('normalized_name', unique)
                .limit(unique.length);

            const rows = Array.isArray(lib) ? lib : [];
            const map = new Map(rows.map((r) => [String(r?.normalized_name || ''), String(r?.video_url || '')]));
            exercisesPayload = exercisesPayload.map((ex) => {
                if (ex?.video_url) return ex;
                const normalized = normalizeExerciseName(String(ex?.name ?? ''));
                const url = normalized ? map.get(normalized) : null;
                return url ? { ...ex, video_url: url } : ex;
            });
        }
    } catch {}

    const { data: workoutId, error: rpcError } = await supabase.rpc('save_workout_atomic', {
        p_workout_id: null,
        p_user_id: user.id,
        p_created_by: user.id,
        p_is_template: true,
        p_name: String(data?.title ?? ''),
        p_notes: String(data?.notes ?? ''),
        p_exercises: exercisesPayload,
    })
    if (rpcError) throw rpcError;
    if (!workoutId) throw new Error('Falha ao salvar treino');

    const { data: workout, error: readError } = await supabase
        .from('workouts')
        .select('*')
        .eq('id', workoutId)
        .single();
    if (readError) throw readError;

    let sync = null;
    try {
        const res = await syncTemplateToSubscribers({ sourceUserId: user.id, sourceWorkoutId: workoutId });
        sync = { created: res?.created ?? 0, updated: res?.updated ?? 0, failed: res?.failed ?? 0 };
    } catch (e) {
        sync = { error: e?.message ?? String(e) };
    }

    revalidatePath('/');
    return { ...workout, sync };
}

export async function updateWorkout(id, data) {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const user = authData?.user ?? null;
    if (!user) throw new Error('Unauthorized');

    const sourceExercises = Array.isArray(data?.exercises) ? data.exercises : []
    let exercisesPayload = (sourceExercises || [])
        .filter((ex) => ex && typeof ex === 'object')
        .map((ex, idx) => {
            const setDetails = Array.isArray(ex?.setDetails)
                ? ex.setDetails
                : (Array.isArray(ex?.set_details) ? ex.set_details : null);
            const headerSets = Number.parseInt(ex?.sets, 10) || 0;
            const numSets = headerSets || (Array.isArray(setDetails) ? setDetails.length : 0);
            const sets = []
            for (let i = 0; i < numSets; i += 1) {
                const s = Array.isArray(setDetails) ? (setDetails[i] || null) : null;
                sets.push({
                    weight: s?.weight ?? null,
                    reps: s?.reps ?? ex?.reps ?? null,
                    rpe: s?.rpe ?? ex?.rpe ?? null,
                    set_number: s?.set_number ?? (i + 1),
                    completed: false,
                    is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
                    advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null,
                })
            }
            return {
                name: String(ex?.name ?? ''),
                notes: String(ex?.notes ?? ''),
                video_url: ex?.videoUrl ?? null,
                rest_time: ex?.restTime ?? null,
                cadence: ex?.cadence ?? null,
                method: ex?.method ?? null,
                order: idx,
                sets,
            }
        });

    try {
        const missing = exercisesPayload
            .map((ex) => {
                const name = String(ex?.name ?? '').trim();
                const hasVideo = !!String(ex?.video_url ?? '').trim();
                if (!name || hasVideo) return null;
                const normalized = normalizeExerciseName(name);
                if (!normalized) return null;
                return normalized;
            })
            .filter(Boolean);

        const unique = Array.from(new Set(missing));
        if (unique.length) {
            const admin = createAdminClient();
            const { data: lib } = await admin
                .from('exercise_library')
                .select('normalized_name, video_url')
                .in('normalized_name', unique)
                .limit(unique.length);

            const rows = Array.isArray(lib) ? lib : [];
            const map = new Map(rows.map((r) => [String(r?.normalized_name || ''), String(r?.video_url || '')]));
            exercisesPayload = exercisesPayload.map((ex) => {
                if (ex?.video_url) return ex;
                const normalized = normalizeExerciseName(String(ex?.name ?? ''));
                const url = normalized ? map.get(normalized) : null;
                return url ? { ...ex, video_url: url } : ex;
            });
        }
    } catch {}

    const { data: workoutId, error: rpcError } = await supabase.rpc('save_workout_atomic', {
        p_workout_id: id,
        p_user_id: user.id,
        p_created_by: user.id,
        p_is_template: true,
        p_name: String(data?.title ?? ''),
        p_notes: String(data?.notes ?? ''),
        p_exercises: exercisesPayload,
    })
    if (rpcError) throw rpcError;
    if (!workoutId) throw new Error('Falha ao salvar treino');

    let sync = null;
    try {
        const res = await syncTemplateToSubscribers({ sourceUserId: user.id, sourceWorkoutId: workoutId });
        sync = { created: res?.created ?? 0, updated: res?.updated ?? 0, failed: res?.failed ?? 0 };
    } catch (e) {
        sync = { error: e?.message ?? String(e) };
    }

    revalidatePath('/');
    return { success: true, sync };
}

export async function deleteWorkout(id) {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const user = authData?.user ?? null;
    if (!user) throw new Error('Unauthorized');

    // SECURITY: Ensure user owns the workout before deletion attempt
    // Although RLS should handle this, double-check in logic prevents accidental calls
    const { data: workout } = await supabase.from('workouts').select('user_id, is_template').eq('id', id).single();
    if (!workout) return { success: false, error: 'Workout not found' };
    
    // Strict Ownership Check
    if (workout.user_id !== user.id) {
        console.error(`SECURITY ALERT: User ${user.id} attempted to delete workout ${id} owned by ${workout.user_id}`);
        throw new Error('Você só pode excluir seus próprios treinos.');
    }

    // Cascade delete: sets -> exercises -> workout
    const { data: exs } = await supabase.from('exercises').select('id').eq('workout_id', id);
    const exIds = (exs || []).map(e => e.id);
    if (exIds.length > 0) {
        await supabase.from('sets').delete().in('exercise_id', exIds);
    }
    await supabase.from('exercises').delete().eq('workout_id', id);
    
    const { error } = await supabase.from('workouts').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;
    
    try {
        if (workout?.is_template) await deleteTemplateFromSubscribers({ sourceUserId: user.id, sourceWorkoutId: id });
    } catch {}

    revalidatePath('/');
    return { success: true };
}

// IMPORT JSON ACTION
export async function importData(jsonData) {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const user = authData?.user ?? null;
    if (!user) throw new Error('Unauthorized');

    // 1. Import Workouts
    const workouts = Array.isArray(jsonData?.workouts) ? jsonData.workouts : []
    for (const w of workouts) {
        const workoutName = w?.title || w?.name || 'Treino Importado'
        const workoutNotes = w?.notes ?? null
        const isTemplate = w?.is_template === false ? false : true

        let newW = null
        const insertBase = {
            user_id: user.id,
            name: workoutName,
            notes: workoutNotes,
            is_template: isTemplate,
            created_by: user.id
        }

        if (w?.id) {
            const { data, error } = await supabase
                .from('workouts')
                .insert({ ...insertBase, id: w.id })
                .select()
                .single()
            if (!error) newW = data
        }

        if (!newW) {
            const { data, error } = await supabase
                .from('workouts')
                .insert(insertBase)
                .select()
                .single()
            if (error) {
                console.error('Error importing workout:', error)
                continue
            }
            newW = data
        }

        const exercises = Array.isArray(w?.exercises) ? w.exercises : []
        for (const [idx, ex] of exercises.entries()) {
            let newEx = null
            const exerciseBase = {
                workout_id: newW.id,
                name: ex?.name ?? '',
                notes: ex?.notes ?? null,
                rest_time: ex?.restTime ?? ex?.rest_time ?? null,
                video_url: ex?.videoUrl ?? ex?.video_url ?? null,
                cadence: ex?.cadence ?? null,
                method: ex?.method ?? null,
                "order": ex?.order ?? idx
            }

            if (ex?.id) {
                const { data, error } = await supabase
                    .from('exercises')
                    .insert({ ...exerciseBase, id: ex.id })
                    .select()
                    .single()
                if (!error) newEx = data
            }

            if (!newEx) {
                const { data, error } = await supabase
                    .from('exercises')
                    .insert(exerciseBase)
                    .select()
                    .single()
                if (error) continue
                newEx = data
            }

            const sets = Array.isArray(ex?.sets) ? ex.sets : null
            const setDetails = Array.isArray(ex?.setDetails) ? ex.setDetails : (Array.isArray(ex?.set_details) ? ex.set_details : null)
            const numSets = sets ? sets.length : (parseInt(ex?.sets) || 0)
            for (let i = 0; i < numSets; i++) {
                const s = sets ? sets[i] : null
                const sd = setDetails ? setDetails[i] : null
                const { error } = await supabase.from('sets').insert({
                    exercise_id: newEx.id,
                    reps: s?.reps ?? sd?.reps ?? ex?.reps ?? null,
                    rpe: s?.rpe ?? sd?.rpe ?? ex?.rpe ?? null,
                    set_number: s?.set_number ?? sd?.set_number ?? (i + 1),
                    weight: s?.weight ?? sd?.weight ?? null,
                    is_warmup: !!(sd?.is_warmup ?? sd?.isWarmup ?? s?.is_warmup ?? s?.isWarmup),
                    advanced_config: sd?.advanced_config ?? sd?.advancedConfig ?? s?.advanced_config ?? s?.advancedConfig ?? null
                })
                if (error) break
            }
        }
    }

    // 2. Import History? (Optional but requested "Importar JSON para Supabase")
    // The backup contains 'history'. Ideally we should import it too.
    const history = Array.isArray(jsonData?.history) ? jsonData.history : []
    if (history.length) {
        for (const h of history) {
            const { data: newH, error: hErr } = await supabase.from('workouts').insert({
                user_id: user.id,
                name: h.workoutTitle || "Treino Realizado",
                date: h.date?.seconds ? new Date(h.date.seconds * 1000) : new Date(),
                is_template: false // It's a log
            }).select().single();

            // We would need to map the history logs to exercises/sets tables too...
            // For now, let's focus on Templates as that's the core structure.
        }
    }

    revalidatePath('/');
    return { success: true };
}
