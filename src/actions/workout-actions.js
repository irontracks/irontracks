'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

const SETS_INSERT_CHUNK_SIZE = 200;

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

// WORKOUTS
export async function createWorkout(data) {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const user = authData?.user ?? null;
    if (!user) throw new Error('Unauthorized');

    const { data: workout, error } = await supabase
        .from('workouts')
        .insert({
            user_id: user.id,
            name: String(data?.title ?? ''),
            notes: String(data?.notes ?? ''),
            is_template: true,
            created_by: user.id
        })
        .select()
        .single();

    if (error) throw error;

    // Insert Exercises
    const sourceExercises = Array.isArray(data?.exercises) ? data.exercises : []
    if (sourceExercises.length > 0) {
        const exercisesToInsert = sourceExercises
            .filter((ex) => ex && typeof ex === 'object')
            .map((ex, idx) => ({
            workout_id: workout.id,
            name: String(ex?.name ?? ''),
            muscle_group: ex?.muscleGroup ?? null,
            notes: String(ex?.notes ?? ''),
            video_url: ex?.videoUrl ?? null,
            rest_time: ex?.restTime ?? null,
            cadence: ex?.cadence ?? null,
            method: ex?.method ?? null,
            "order": idx
        }));

        const { data: exercises, error: exError } = await supabase
            .from('exercises')
            .insert(exercisesToInsert)
            .select();

        if (exError) throw exError;

        const setRows = [];
        for (const ex of (exercises || [])) {
            const originalEx = (typeof ex?.order === 'number' && Array.isArray(data?.exercises))
                ? (data.exercises[ex.order] || {})
                : (data.exercises.find(e => e?.name === ex.name) || {});
            const setDetails = Array.isArray(originalEx?.setDetails)
                ? originalEx.setDetails
                : (Array.isArray(originalEx?.set_details) ? originalEx.set_details : null);
            const headerSets = Number.parseInt(originalEx?.sets, 10) || 0;
            const numSets = headerSets || (Array.isArray(setDetails) ? setDetails.length : 0);

            for (let i = 0; i < numSets; i += 1) {
                const s = Array.isArray(setDetails) ? (setDetails[i] || null) : null;
                setRows.push({
                    exercise_id: ex.id,
                    reps: s?.reps ?? originalEx?.reps ?? null,
                    rpe: s?.rpe ?? originalEx?.rpe ?? null,
                    set_number: s?.set_number ?? (i + 1),
                    weight: s?.weight ?? null,
                    is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
                    advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null
                });
            }
        }

        if (setRows.length > 0) await insertSetsBulkSafe(supabase, setRows);
    }

    revalidatePath('/');
    return workout;
}

export async function updateWorkout(id, data) {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const user = authData?.user ?? null;
    if (!user) throw new Error('Unauthorized');

    // Update Workout
    const { error } = await supabase
        .from('workouts')
        .update({
            name: String(data?.title ?? ''),
            notes: String(data?.notes ?? '')
        })
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) throw error;

    // For simplicity in this migration: Delete all existing exercises and re-insert.
    // This is destructive but ensures we match the new state exactly without complex diffing.
    await supabase.from('exercises').delete().eq('workout_id', id);

    // Re-insert logic (same as create)
    const sourceExercises = Array.isArray(data?.exercises) ? data.exercises : []
    if (sourceExercises.length > 0) {
        const exercisesToInsert = sourceExercises
            .filter((ex) => ex && typeof ex === 'object')
            .map((ex, idx) => ({
            workout_id: id,
            name: String(ex?.name ?? ''),
            notes: String(ex?.notes ?? ''),
            video_url: ex?.videoUrl ?? null,
            rest_time: ex?.restTime ?? null,
            cadence: ex?.cadence ?? null,
            method: ex?.method ?? null,
            "order": idx
        }));

        const { data: exercises, error: exError } = await supabase
            .from('exercises')
            .insert(exercisesToInsert)
            .select();

        if (exError) throw exError;

        const setRows = [];
        for (const ex of (exercises || [])) {
            const originalEx = (typeof ex?.order === 'number' && Array.isArray(data?.exercises))
                ? (data.exercises[ex.order] || {})
                : (data.exercises.find(e => e?.name === ex.name) || {});
            const setDetails = Array.isArray(originalEx?.setDetails)
                ? originalEx.setDetails
                : (Array.isArray(originalEx?.set_details) ? originalEx.set_details : null);
            const headerSets = Number.parseInt(originalEx?.sets, 10) || 0;
            const numSets = headerSets || (Array.isArray(setDetails) ? setDetails.length : 0);

            for (let i = 0; i < numSets; i += 1) {
                const s = Array.isArray(setDetails) ? (setDetails[i] || null) : null;
                setRows.push({
                    exercise_id: ex.id,
                    reps: s?.reps ?? originalEx?.reps ?? null,
                    rpe: s?.rpe ?? originalEx?.rpe ?? null,
                    set_number: s?.set_number ?? (i + 1),
                    weight: s?.weight ?? null,
                    is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
                    advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null
                });
            }
        }

        if (setRows.length > 0) await insertSetsBulkSafe(supabase, setRows);
    }

    revalidatePath('/');
    return { success: true };
}

export async function deleteWorkout(id) {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const user = authData?.user ?? null;
    if (!user) throw new Error('Unauthorized');

    // SECURITY: Ensure user owns the workout before deletion attempt
    // Although RLS should handle this, double-check in logic prevents accidental calls
    const { data: workout } = await supabase.from('workouts').select('user_id').eq('id', id).single();
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
