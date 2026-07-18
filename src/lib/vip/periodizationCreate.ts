import crypto from 'crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseJsonWithSchema } from '@/utils/zod';
import { normalizeExerciseName } from '@/utils/normalizeExerciseName';
import { setTopWeightReps } from '@/utils/report/setVolume';
import { getGeminiModel } from '@/utils/ai/gemini';
import { env } from '@/utils/env';
import { VipPeriodizationQuestionnaire, buildWorkoutPlan } from '@/utils/vip/periodization';
import { vipPeriodizationExerciseSeed } from '@/data/vipPeriodizationExercises';

/**
 * Criação de um programa de periodização — motor COMPARTILHADO entre o self-service VIP
 * (aluno cria pra si) e a Área do professor (professor cria pro aluno). A diferença é só
 * QUEM é o dono e QUEM é o autor:
 *  - `ownerUserId` vira `user_id` nas tabelas (o dono do programa/treinos = o aluno);
 *  - `authorUserId` vira `p_created_by` nos workouts (o professor) e é registrado no config.
 * Roda tudo via service-role (o caller já autorizou: requireUser pro self, canCoachStudent
 * pro professor). Extraído da rota vip/periodization/create pra não duplicar ~150 linhas.
 */

const MODEL_ID = env.gemini.modelId;

const safeString = (v: unknown): string => {
    try { return String(v ?? '').trim(); } catch { return ''; }
};

interface LogEntry { weight?: unknown; reps?: unknown; done?: boolean | string; isDone?: boolean | string; completed?: boolean | string }
interface SessionData { workout?: { exercises?: unknown[] }; logs?: Record<string, LogEntry> }

const parseSession = (notes: unknown): SessionData | null => {
    const obj = parseJsonWithSchema(notes, z.record(z.unknown()));
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj as SessionData;
    return null;
};

/** Mapa normalizedName → melhor 1RM estimado, a partir do histórico do dono. */
export const buildUser1rmMapFromHistory = (history: Array<{ created_at: string; notes: unknown }>): Map<string, number> => {
    const byEx = new Map<string, number>();
    for (const row of history) {
        const session = parseSession(row.notes);
        if (!session) continue;
        const exercises = Array.isArray(session.workout?.exercises) ? (session.workout?.exercises as unknown[]) : [];
        const namesByIdx = new Map<number, string>();
        exercises.forEach((ex, idx) => {
            const name = safeString((ex as Record<string, unknown>)?.name);
            if (name) namesByIdx.set(idx, normalizeExerciseName(name));
        });
        const logs = session.logs;
        if (!logs) continue;
        for (const [key, v] of Object.entries(logs)) {
            const exIdx = Number(String(key).split('-')[0]);
            if (!Number.isFinite(exIdx)) continue;
            const exNameNorm = namesByIdx.get(exIdx) || '';
            if (!exNameNorm) continue;
            const log = v as LogEntry;
            if (!log) continue;
            const doneRaw = log.done ?? log.isDone ?? log.completed ?? null;
            const done = doneRaw == null ? true : doneRaw === true || String(doneRaw).toLowerCase() === 'true';
            const { weight, reps } = setTopWeightReps(log);
            if (!done && weight <= 0 && reps <= 0) continue;
            if (weight > 0 && reps > 0) {
                const est = weight * (1 + reps / 30);
                const cur = byEx.get(exNameNorm) || 0;
                if (est > cur) byEx.set(exNameNorm, est);
            }
        }
    }
    return byEx;
};

/** Garante a biblioteca de exercícios seedada (o motor buildWorkoutPlan depende dela). */
export const ensureExerciseLibrarySeeded = async (admin: SupabaseClient): Promise<void> => {
    const { count } = await admin.from('exercise_library').select('id', { count: 'exact', head: true });
    if (Number.isFinite(Number(count)) && Number(count) >= 150) return;
    const rows = vipPeriodizationExerciseSeed.map((ex) => ({
        display_name_pt: safeString(ex.display_name_pt),
        normalized_name: normalizeExerciseName(safeString(ex.display_name_pt)),
        video_url: null as string | null,
        aliases: null as string[] | null,
        primary_muscle: safeString(ex.primary_muscle) || null,
        secondary_muscles: Array.isArray(ex.secondary_muscles) ? ex.secondary_muscles : [],
        equipment: Array.isArray(ex.equipment) ? ex.equipment : [],
        difficulty: safeString(ex.difficulty) || null,
        environments: Array.isArray(ex.environments) ? ex.environments : [],
        is_compound: !!ex.is_compound,
    }));
    await admin.from('exercise_library').upsert(rows, { onConflict: 'normalized_name' });
};

const generateOverview = async (q: VipPeriodizationQuestionnaire, split: string): Promise<string | null> => {
    const apiKey = env.gemini.apiKey;
    if (!apiKey) return null;
    const model = getGeminiModel(apiKey, MODEL_ID);
    const prompt = [
        'Você é um coach de musculação do IronTracks.',
        'Crie um resumo curto e prático (pt-BR) para um programa de periodização.',
        'Não invente dados pessoais. Não use emojis.',
        '', 'Estrutura: Título; Como funciona (3 bullets); Deload e testes (2 bullets); Como progredir (2 bullets).', '',
        'Dados:',
        `- Modelo: ${q.model}`, `- Duração: ${q.weeks} semanas`, `- Objetivo: ${q.goal}`, `- Nível: ${q.level}`,
        `- Dias/semana: ${q.daysPerWeek}`, `- Tempo/sessão: ${q.timeMinutes} min`, `- Split: ${split}`,
        `- Equipamentos: ${(q.equipment || []).join(', ') || 'não informado'}`, `- Limitações: ${q.limitations || 'nenhuma'}`,
    ].join('\n');
    try {
        const result = await (model.generateContent as (parts: Array<{ text: string }>) => Promise<unknown>)([{ text: prompt }]);
        const text = String((await (result as { response?: { text?: () => Promise<string> } })?.response?.text?.()) || '').trim();
        return text || null;
    } catch { return null; }
};

export interface CreatePeriodizationParams {
    ownerUserId: string;
    authorUserId: string;
    questionnaire: VipPeriodizationQuestionnaire;
    /** Prefixo do nome dos treinos gerados. 'VIP' no self-service (compat), 'Periodização' pro professor. */
    namePrefix?: string;
}

export interface CreatePeriodizationResult {
    programId: string;
    createdWorkoutIds: string[];
    split: unknown;
    weeks: unknown;
}

export async function createPeriodizationProgram(
    admin: SupabaseClient,
    { ownerUserId, authorUserId, questionnaire: q, namePrefix = 'Periodização' }: CreatePeriodizationParams,
): Promise<CreatePeriodizationResult> {
    await ensureExerciseLibrarySeeded(admin);

    const { data: historyRows } = await admin
        .from('workouts')
        .select('created_at, notes')
        .eq('user_id', ownerUserId)
        .eq('is_template', false)
        .order('created_at', { ascending: false })
        .limit(120);
    const oneRmMap = buildUser1rmMapFromHistory((historyRows || []) as Array<{ created_at: string; notes: unknown }>);

    const plan = buildWorkoutPlan(q, {
        getEst1rm: (normalizedName: string) => oneRmMap.get(safeString(normalizedName)) || null,
    });

    // Arquiva o programa ativo anterior do dono (e seus treinos-modelo).
    const { data: existingActive } = await admin
        .from('vip_periodization_programs')
        .select('id')
        .eq('user_id', ownerUserId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (existingActive?.id) {
        const { data: prevLinks } = await admin
            .from('vip_periodization_workouts')
            .select('workout_id')
            .eq('user_id', ownerUserId)
            .eq('program_id', String(existingActive.id))
            .limit(500);
        const prevWorkoutIds = (prevLinks || [])
            .map((r: Record<string, unknown>) => String(r?.workout_id || '').trim())
            .filter(Boolean);
        if (prevWorkoutIds.length) {
            await admin.from('workouts').update({ archived_at: new Date().toISOString() })
                .eq('user_id', ownerUserId).eq('is_template', true).in('id', prevWorkoutIds);
        }
        await admin.from('vip_periodization_programs')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', existingActive.id);
    }

    const programId = crypto.randomUUID();
    const createdAtIso = new Date().toISOString();
    // Rastreia o autor quando é o professor (dono ≠ autor). O programa é do aluno.
    const baseConfig: Record<string, unknown> = { created_at: createdAtIso };
    if (authorUserId && authorUserId !== ownerUserId) baseConfig.created_by_teacher = authorUserId;

    const { data: programRow, error: pErr } = await admin
        .from('vip_periodization_programs')
        .insert({
            id: programId,
            user_id: ownerUserId,
            status: 'active',
            model: q.model,
            weeks: q.weeks,
            goal: q.goal,
            split: plan.split.split,
            days_per_week: plan.split.days.length,
            time_minutes: q.timeMinutes,
            equipment: q.equipment || [],
            limitations: q.limitations || null,
            start_date: q.startDate ? String(q.startDate).slice(0, 10) : null,
            config: baseConfig,
            questionnaire: q as unknown,
        })
        .select('id')
        .single();
    if (pErr) throw new Error(pErr.message || 'failed_to_create_program');
    if (!programRow?.id) throw new Error('failed_to_create_program');

    const overview = await generateOverview(q, plan.split.split);
    if (overview) {
        await admin.from('vip_periodization_programs').update({ config: { ...baseConfig, overview } }).eq('id', programId);
    }

    const createdWorkoutIds: string[] = [];
    for (const day of plan.days) {
        const exercisesPayload = day.exercises.map((ex) => ({
            name: ex.name,
            notes: safeString(ex.primary_muscle) ? `Alvo: ${safeString(ex.primary_muscle)}\n${safeString(day.phase)}` : safeString(day.phase),
            video_url: ex.video_url ?? null,
            rest_time: ex.rest_time ?? null,
            cadence: ex.cadence ?? null,
            method: ex.method ?? null,
            order: ex.order,
            sets: ex.sets.map((s) => ({
                weight: s.weight ?? null, reps: s.reps ?? null, rpe: s.rpe ?? null,
                set_number: s.set_number, completed: false, is_warmup: !!s.is_warmup,
                advanced_config: s.advanced_config ?? null,
            })),
        }));

        const { data: savedId, error: sErr } = await admin.rpc('save_workout_atomic', {
            p_workout_id: null,
            p_user_id: ownerUserId,
            p_created_by: authorUserId,
            p_is_template: true,
            p_name: `${namePrefix} • ${day.name}`,
            p_notes: day.notes || '',
            p_exercises: exercisesPayload,
        });
        if (sErr) throw new Error(sErr.message || 'failed_to_create_workout');
        const workoutId = String(savedId || '').trim();
        if (!workoutId) throw new Error('failed_to_create_workout');
        createdWorkoutIds.push(workoutId);

        const { error: linkErr } = await admin.from('vip_periodization_workouts').insert({
            program_id: programId,
            user_id: ownerUserId,
            week_number: day.weekNumber,
            day_number: day.dayNumber,
            phase: day.phase,
            is_deload: day.isDeload,
            is_test: day.isTest,
            scheduled_date: day.scheduledDate,
            workout_id: workoutId,
        });
        if (linkErr) throw new Error(linkErr.message || 'failed_to_link_workout');
    }

    return { programId, createdWorkoutIds, split: plan.split, weeks: plan.weeks };
}
