'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { requireRole } from '@/utils/auth/route'
import type { ActionResult } from '@/types/actions'

type AdminActionResult<T = Record<string, unknown>> = ActionResult<T> & { success?: boolean; error?: string; data?: unknown }

function getErrorMessage(err: unknown) {
    try {
        if (err instanceof Error && typeof err.message === 'string' && err.message.trim()) return err.message
        if (err && typeof err === 'object' && 'message' in err) {
            const msg = err.message
            if (typeof msg === 'string' && msg.trim()) return msg
        }
        const s = String(err ?? '').trim()
        return s || 'Erro desconhecido'
    } catch {
        return 'Erro desconhecido'
    }
}

async function checkAdmin() {
    const auth = await requireRole(['admin'])
    if (!auth.ok) throw new Error('Unauthorized')
    return auth.user
}

export async function sendBroadcastMessage(title: string, message: string): Promise<AdminActionResult<Record<string, unknown>>> {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()

        // 1. Get all users
        const { data: profiles, error: pError } = await adminDb.from('profiles').select('id')
        if (pError) throw pError

        const safeProfiles = Array.isArray(profiles) ? profiles : []

        // 2. Prepare notifications
        const notifications = safeProfiles
            .filter((p) => p && typeof p === 'object' && p.id)
            .map((p) => ({
            user_id: p.id,
            title,
            message,
            type: 'broadcast',
            read: false,
            created_at: new Date().toISOString()
        }))

        // 3. Insert in batches of 100 to avoid limits
        const batchSize = 100
        for (let i = 0; i < notifications.length; i += batchSize) {
            const batch = notifications.slice(i, i + batchSize)
            const { error: iError } = await adminDb.from('notifications').insert(batch)
            if (iError) throw iError
        }

        return { success: true, count: notifications.length } as unknown as AdminActionResult<Record<string, unknown>>
    } catch (e) {
        return { error: getErrorMessage(e) } as unknown as AdminActionResult<Record<string, unknown>>
    }
}

export async function registerStudent(email: string, password: string, name: string): Promise<AdminActionResult<Record<string, unknown>>> {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()

        // Create User
        const { data, error } = await adminDb.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { display_name: name, full_name: name }
        })

        if (error) throw error

        // Create Profile explicitly
        const { error: pError } = await adminDb.from('profiles').upsert({
            id: data.user.id,
            email: email,
            display_name: name,
            role: 'student',
            photo_url: null,
            last_seen: new Date()
        })

        if (pError) console.error("Profile creation warning:", pError)

        return { success: true, user: data.user } as unknown as AdminActionResult<Record<string, unknown>>
    } catch (e) {
        return { error: getErrorMessage(e) } as unknown as AdminActionResult<Record<string, unknown>>
    }
}

export async function addTeacher(
    name: string,
    email: string,
    phone: string,
    birth_date: string,
    status = 'pending',
): Promise<AdminActionResult<Record<string, unknown>>> {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()

        const normalizeString = (v: unknown): string | null => {
            const s = String(v ?? '').trim()
            return s ? s : null
        }

        const nextName = normalizeString(name)
        const nextEmail = normalizeString(email)?.toLowerCase() || null
        const nextPhone = normalizeString(phone)
        const nextBirthDate = normalizeString(birth_date)
        const nextStatus = normalizeString(status) || 'pending'

        if (!nextName || !nextEmail) throw new Error('Missing name or email')

        const payload: Record<string, string | null> = { name: nextName, email: nextEmail, status: nextStatus }
        if (nextPhone !== null) payload.phone = nextPhone
        if (nextBirthDate !== null) payload.birth_date = nextBirthDate

        const tryInsert = async (p: Record<string, string | null>) => {
            const { error } = await adminDb.from('teachers').insert(p)
            if (error) throw error
        }

        try {
            await tryInsert(payload)
        } catch (err) {
            const msg = String(err?.message || err || '')
            if (msg.includes("Could not find the 'birth_date' column") || msg.includes('birth_date')) {
                const { birth_date, ...rest } = payload
                await tryInsert(rest)
            } else if (msg.includes("Could not find the 'phone' column") || msg.includes('phone')) {
                const { phone, ...rest } = payload
                await tryInsert(rest)
            } else {
                throw err
            }
        }
        return { success: true } as unknown as AdminActionResult<Record<string, unknown>>
    } catch (e) {
        return { error: getErrorMessage(e) } as unknown as AdminActionResult<Record<string, unknown>>
    }
}

export async function clearAllStudents(): Promise<AdminActionResult<Record<string, unknown>>> {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()
        const { error } = await adminDb.from('profiles').delete().neq('role', 'admin')
        if (error) throw error
        return { success: true } as unknown as AdminActionResult<Record<string, unknown>>
    } catch (e) {
        return { error: getErrorMessage(e) } as unknown as AdminActionResult<Record<string, unknown>>
    }
}

export async function clearAllTeachers(): Promise<AdminActionResult<Record<string, unknown>>> {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()
        const { error } = await adminDb.from('teachers').delete().gte('created_at', '1900-01-01')
        if (error) throw error
        return { success: true } as unknown as AdminActionResult<Record<string, unknown>>
    } catch (e) {
        return { error: getErrorMessage(e) } as unknown as AdminActionResult<Record<string, unknown>>
    }
}

export async function clearAllWorkouts(): Promise<AdminActionResult<Record<string, unknown>>> {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()
        const { error } = await adminDb.from('workouts').delete().gte('created_at', '1900-01-01')
        if (error) throw error
        return { success: true } as unknown as AdminActionResult<Record<string, unknown>>
    } catch (e) {
        return { error: getErrorMessage(e) } as unknown as AdminActionResult<Record<string, unknown>>
    }
}

export async function updateTeacher(id: unknown, data: Record<string, unknown>): Promise<AdminActionResult<Record<string, unknown>>> {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()

        const safeId = String(id || '').trim()
        if (!safeId) throw new Error('Missing teacher id')

        const normalizeString = (v: unknown): string | null => {
            const s = String(v ?? '').trim()
            return s ? s : null
        }

        const payload: Record<string, unknown> = {}
        const nextName = normalizeString(data?.name)
        const nextEmail = normalizeString(data?.email)?.toLowerCase() || null
        const nextPhone = normalizeString(data?.phone)
        const nextBirthDate = normalizeString(data?.birth_date)

        if (nextName !== null) payload.name = nextName
        if (nextEmail !== null) payload.email = nextEmail
        if (nextPhone !== null) payload.phone = nextPhone
        if (nextBirthDate !== null) payload.birth_date = nextBirthDate

        const tryUpdate = async (p: Record<string, unknown>) => {
            const { error } = await adminDb.from('teachers').update(p).eq('id', safeId)
            if (error) throw error
        }

        try {
            await tryUpdate(payload)
        } catch (err) {
            const msg = String(err?.message || err || '')
            if (msg.includes("Could not find the 'birth_date' column") || msg.includes('birth_date')) {
                const { birth_date, ...rest } = payload
                await tryUpdate(rest)
            } else if (msg.includes("Could not find the 'phone' column") || msg.includes('phone')) {
                const { phone, ...rest } = payload
                await tryUpdate(rest)
            } else {
                throw err
            }
        }

        if (nextEmail) {
            const email = nextEmail
            const name = nextName || email
            const { data: existingProfile } = await adminDb
                .from('profiles')
                .select('id')
                .ilike('email', email)
                .maybeSingle()
            const userId = existingProfile?.id || null
            if (userId) {
                await adminDb.from('profiles').upsert({
                    id: userId,
                    email,
                    display_name: name,
                    role: 'teacher',
                    last_seen: new Date(),
                }, { onConflict: 'id' })

                await adminDb.from('teachers')
                    .update({ user_id: userId, email })
                    .eq('id', safeId)
            }
        }

        return { success: true } as unknown as AdminActionResult<Record<string, unknown>>
    } catch (e) {
        return { error: getErrorMessage(e) } as unknown as AdminActionResult<Record<string, unknown>>
    }
}

export async function deleteTeacher(id: unknown): Promise<AdminActionResult<Record<string, unknown>>> {
    try {
        const adminUser = await checkAdmin()
        const adminDb = createAdminClient()
        const safeId = String(id || '').trim()
        if (!safeId) throw new Error('Missing teacher id')
        const { data, error } = await adminDb.rpc('delete_teacher_cascade', {
            p_teacher_id: safeId,
            p_actor_id: adminUser?.id || null,
            p_actor_email: adminUser?.email || null,
            p_actor_role: 'admin',
        })
        if (error) throw error
        return { success: true, report: data ?? null } as unknown as AdminActionResult<Record<string, unknown>>
    } catch (e) {
        return { error: getErrorMessage(e) } as unknown as AdminActionResult<Record<string, unknown>>
    }
}

export async function clearPublicRegistry(): Promise<AdminActionResult<Record<string, unknown>>> {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()
        const { error } = await adminDb.from('notifications').delete().gte('created_at', '1900-01-01')
        if (error) throw error
        return { success: true } as unknown as AdminActionResult<Record<string, unknown>>
    } catch (e) {
        return { error: getErrorMessage(e) } as unknown as AdminActionResult<Record<string, unknown>>
    }
}

export async function assignWorkoutToStudent(
    studentId: string,
    template: Record<string, unknown>,
): Promise<AdminActionResult<Record<string, unknown>>> {
    try {
        const adminUser = await checkAdmin();
        const adminDb = createAdminClient();

        let targetId = studentId;
        let isAuthUser = false;

        const { data: maybeProfile } = await adminDb
            .from('profiles')
            .select('id')
            .eq('id', targetId)
            .maybeSingle();
        if (maybeProfile?.id) {
            isAuthUser = true;
            targetId = maybeProfile.id;
        } else {
            const { data: studentRow } = await adminDb
                .from('students')
                .select('id, user_id, email')
                .or(`id.eq.${studentId},user_id.eq.${studentId}`)
                .maybeSingle();
            if (!studentRow) throw new Error('Aluno não encontrado');
            if (studentRow.user_id) {
                isAuthUser = true;
                targetId = studentRow.user_id;
            } else {
                isAuthUser = false;
                targetId = studentRow.id;
            }
        }

        const { data: newWorkout, error: wError } = await adminDb
            .from('workouts')
            .insert({
                user_id: isAuthUser ? targetId : null,
                student_id: isAuthUser ? null : targetId,
                name: template?.name ?? '',
                notes: template?.notes ?? '',
                is_template: true,
                created_by: adminUser.id
            })
            .select()
            .single();

        if (wError) throw wError;

        if (Array.isArray(template?.exercises) && template.exercises.length > 0) {
            const exercisesToInsert = template.exercises.map((ex, idx) => ({
                workout_id: newWorkout.id,
                name: ex?.name ?? '',
                notes: ex?.notes ?? '',
                video_url: ex?.video_url ?? '',
                rest_time: ex?.rest_time ?? 60,
                cadence: ex?.cadence ?? '2020',
                method: ex?.method ?? 'Normal',
                order: ex?.order ?? idx
            }));
            const { data: insertedExs, error: exError } = await adminDb
                .from('exercises')
                .insert(exercisesToInsert)
                .select();
            if (exError) throw exError;

            const safeInsertedExs = Array.isArray(insertedExs) ? insertedExs : []

            const insertSetSafe = async (payload: Record<string, any>) => {
                try {
                    const { error } = await adminDb.from('sets').insert(payload);
                    if (!error) return;
                    const msg = (error?.message || '').toLowerCase();
                    if (msg.includes('advanced_config') || msg.includes('is_warmup')) {
                        const reduced = { ...payload };
                        delete reduced.advanced_config;
                        const { error: reducedErr } = await adminDb.from('sets').insert(reduced);
                        if (!reducedErr) return;
                        const reducedMsg = (reducedErr?.message || '').toLowerCase();
                        if (!reducedMsg.includes('is_warmup')) throw reducedErr;
                        if (payload && typeof payload === 'object' && payload.is_warmup) {
                            throw new Error('Seu Supabase não tem a coluna "is_warmup" na tabela "sets". Rode a migration 20251222120000_sets_advanced_logic.sql e tente novamente.');
                        }
                        const finalPayload = { ...reduced };
                        delete finalPayload.is_warmup;
                        const { error: finalErr } = await adminDb.from('sets').insert(finalPayload);
                        if (finalErr) throw finalErr;
                        return;
                    }
                    throw error;
                } catch (e) {
                    const msg = (e?.message || '').toLowerCase();
                    if (msg.includes('advanced_config') || msg.includes('is_warmup')) {
                        const reduced = { ...payload };
                        delete reduced.advanced_config;
                        const { error: reducedErr } = await adminDb.from('sets').insert(reduced);
                        if (!reducedErr) return;
                        const reducedMsg = (reducedErr?.message || '').toLowerCase();
                        if (!reducedMsg.includes('is_warmup')) throw reducedErr;
                        if (payload && typeof payload === 'object' && payload.is_warmup) {
                            throw new Error('Seu Supabase não tem a coluna "is_warmup" na tabela "sets". Rode a migration 20251222120000_sets_advanced_logic.sql e tente novamente.');
                        }
                        const finalPayload = { ...reduced };
                        delete finalPayload.is_warmup;
                        const { error: finalErr } = await adminDb.from('sets').insert(finalPayload);
                        if (finalErr) throw finalErr;
                        return;
                    }
                    throw e;
                }
            };

            for (let i = 0; i < safeInsertedExs.length; i++) {
                const dstEx = safeInsertedExs[i];
                const srcEx = template.exercises[i] || {};
                const setsArr = Array.isArray(srcEx.sets) ? srcEx.sets : [];
                if (dstEx?.id && setsArr.length > 0) {
                    for (const s of setsArr) {
                        await insertSetSafe({
                            exercise_id: dstEx.id,
                            weight: s?.weight ?? null,
                            reps: s?.reps ?? null,
                            rpe: s?.rpe ?? null,
                            set_number: s?.set_number ?? 1,
                            completed: false,
                            is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
                            advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null
                        });
                    }
                }
            }
        }

        return { success: true, workoutId: newWorkout.id, workout: newWorkout } as unknown as AdminActionResult<Record<string, unknown>>;
    } catch (e) {
        return { error: getErrorMessage(e) } as unknown as AdminActionResult<Record<string, unknown>>;
    }
}

export async function getStudentWorkouts(studentId: string): Promise<ActionResult<unknown[]> & { error?: string; data?: unknown[] }> {
    try {
        await checkAdmin();
        const adminDb = createAdminClient();

        let targetId = studentId;
        let isAuthUser = false;
        const { data: maybeProfile } = await adminDb.from('profiles').select('id').eq('id', studentId).maybeSingle();
        if (maybeProfile?.id) {
            isAuthUser = true;
            targetId = maybeProfile.id;
        } else {
            const { data: srow } = await adminDb
                .from('students')
                .select('id, user_id')
                .or(`id.eq.${studentId},user_id.eq.${studentId}`)
                .maybeSingle();
            if (srow?.user_id) {
                isAuthUser = true;
                targetId = srow.user_id;
            } else if (srow?.id) {
                isAuthUser = false;
                targetId = srow.id;
            }
        }

        const { data, error } = await adminDb
            .from('workouts')
            .select('*, exercises(*, sets(*))')
            .or(`user_id.eq.${targetId},student_id.eq.${targetId}`)
            .eq('is_template', true)
            .order('name');

        if (error) throw error;
        return { data } as unknown as ActionResult<unknown[]> & { error?: string; data?: unknown[] };
    } catch (e) {
        return { error: getErrorMessage(e) } as unknown as ActionResult<unknown[]> & { error?: string; data?: unknown[] };
    }
}

export async function removeWorkoutFromStudent(workoutId: string): Promise<AdminActionResult<Record<string, unknown>>> {
    try {
        await checkAdmin();
        const adminDb = createAdminClient();
        const safeWorkoutId = String(workoutId || '').trim()
        if (!safeWorkoutId) throw new Error('Missing workout id')
        const { error } = await adminDb.from('workouts').delete().eq('id', safeWorkoutId);
        if (error) throw error;
        return { success: true } as unknown as AdminActionResult<Record<string, unknown>>;
    } catch (e) {
        return { error: getErrorMessage(e) } as unknown as AdminActionResult<Record<string, unknown>>;
    }
}

export async function exportAllData(): Promise<ActionResult<{ url: string } | { data: unknown }> & { error?: string; data?: unknown }> {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()

        const { data: profiles } = await adminDb.from('profiles').select('*')
        const { data: teachers } = await adminDb.from('teachers').select('*')
        const { data: students } = await adminDb.from('students').select('*')
        const { data: assessments } = await adminDb.from('assessments').select('*')
        const { data: notifications } = await adminDb.from('notifications').select('*')
        const { data: chat_channels } = await adminDb.from('chat_channels').select('*')
        const { data: messages } = await adminDb.from('messages').select('*')
        const { data: invites } = await adminDb.from('invites').select('*')
        const { data: team_sessions } = await adminDb.from('team_sessions').select('*')

        const { data: workouts } = await adminDb
            .from('workouts')
            .select('*, exercises(*, sets(*))')
            .order('name')

        const payload = {
            exported_at: new Date().toISOString(),
            profiles: profiles || [],
            teachers: teachers || [],
            students: students || [],
            assessments: assessments || [],
            notifications: notifications || [],
            chat_channels: chat_channels || [],
            messages: messages || [],
            invites: invites || [],
            team_sessions: team_sessions || [],
            workouts: (Array.isArray(workouts) ? workouts : []).map((w: any) => ({
                id: w?.id,
                user_id: w?.user_id ?? null,
                student_id: w?.student_id ?? null,
                title: w?.name ?? '',
                notes: w?.notes ?? null,
                is_template: !!w?.is_template,
                created_by: w?.created_by ?? null,
                exercises: (Array.isArray(w?.exercises) ? w.exercises : []).map((e: any) => ({
                    id: e?.id,
                    name: e?.name ?? '',
                    notes: e?.notes ?? null,
                    video_url: e?.video_url ?? null,
                    rest_time: e?.rest_time ?? null,
                    cadence: e?.cadence ?? null,
                    method: e?.method ?? null,
                    order: e?.order ?? null,
                    sets: (Array.isArray(e?.sets) ? e.sets : []).map((s: any) => ({
                        reps: s?.reps ?? null,
                        rpe: s?.rpe ?? null,
                        set_number: s?.set_number ?? null
                    }))
                }))
            }))
        }

        return { success: true, data: payload } as unknown as ActionResult<{ url: string } | { data: unknown }> & { error?: string; data?: unknown }
    } catch (e) {
        return { error: getErrorMessage(e) } as unknown as ActionResult<{ url: string } | { data: unknown }> & { error?: string; data?: unknown }
    }
}

export async function importAllData(json: Record<string, unknown>): Promise<ActionResult<{ imported: number }> & { error?: string; success?: boolean }> {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()

        const profiles = Array.isArray(json?.profiles) ? json.profiles : []
        const teachers = Array.isArray(json?.teachers) ? json.teachers : []
        const students = Array.isArray(json?.students) ? json.students : []
        const assessments = Array.isArray(json?.assessments) ? json.assessments : []
        const notifications = Array.isArray(json?.notifications) ? json.notifications : []
        const chat_channels = Array.isArray(json?.chat_channels) ? json.chat_channels : []
        const messages = Array.isArray(json?.messages) ? json.messages : []
        const invites = Array.isArray(json?.invites) ? json.invites : []
        const team_sessions = Array.isArray(json?.team_sessions) ? json.team_sessions : []
        const workouts = Array.isArray(json?.workouts) ? json.workouts : []

        if (chat_channels.length) {
            const batchSize = 500
            for (let i = 0; i < chat_channels.length; i += batchSize) {
                const batch = chat_channels.slice(i, i + batchSize)
                await adminDb.from('chat_channels').upsert(batch, { onConflict: 'id' })
            }
        }

        if (team_sessions.length) {
            const batchSize = 500
            for (let i = 0; i < team_sessions.length; i += batchSize) {
                const batch = team_sessions.slice(i, i + batchSize)
                await adminDb.from('team_sessions').upsert(batch, { onConflict: 'id' })
            }
        }

        if (profiles.length) {
            const batchSize = 500
            for (let i = 0; i < profiles.length; i += batchSize) {
                const batch = profiles.slice(i, i + batchSize).map(p => ({
                    id: p.id,
                    email: p.email,
                    display_name: p.display_name,
                    role: p.role,
                    photo_url: p.photo_url,
                    last_seen: p.last_seen
                }))
                await adminDb.from('profiles').upsert(batch, { onConflict: 'id' })
            }
        }

        if (teachers.length) {
            const batchSize = 500
            for (let i = 0; i < teachers.length; i += batchSize) {
                const batch = teachers.slice(i, i + batchSize).map(t => ({
                    id: t.id,
                    name: t.name,
                    email: t.email,
                    phone: t.phone,
                    birth_date: t.birth_date,
                    status: t.status
                }))
                await adminDb.from('teachers').upsert(batch, { onConflict: 'id' })
            }
        }

        if (students.length) {
            const batchSize = 500
            for (let i = 0; i < students.length; i += batchSize) {
                const batch = students.slice(i, i + batchSize).map(s => ({
                    id: s.id,
                    name: s.name,
                    email: s.email,
                    phone: s.phone,
                    user_id: s.user_id,
                    teacher_id: s.teacher_id,
                    created_by: s.created_by,
                    status: s.status
                }))
                await adminDb.from('students').upsert(batch, { onConflict: 'id' })
            }
        }

        for (const w of workouts) {
            const baseWorkout = {
                user_id: w?.user_id ?? null,
                student_id: w?.student_id ?? null,
                name: w?.title || w?.name || '',
                notes: w?.notes ?? null,
                is_template: w?.is_template === true,
                created_by: w?.created_by ?? null
            }

            let savedW: { id: string } | null = null
            if (w?.id) {
                const { data, error } = await adminDb
                    .from('workouts')
                    .upsert({ ...baseWorkout, id: w.id }, { onConflict: 'id' })
                    .select()
                    .single()
                if (!error) {
                    const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
                    if (row?.id) savedW = { id: String(row.id) }
                }
            }

            if (!savedW) {
                const { data } = await adminDb
                    .from('workouts')
                    .insert(baseWorkout)
                    .select()
                    .single()
                const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
                if (row?.id) savedW = { id: String(row.id) }
            }

            if (!savedW?.id) continue

            const { data: existingExs } = await adminDb
                .from('exercises')
                .select('id')
                .eq('workout_id', savedW.id)
            const exIds = (Array.isArray(existingExs) ? existingExs : []).map((x: Record<string, unknown>) => x?.id).filter(Boolean)
            if (exIds.length) await adminDb.from('sets').delete().in('exercise_id', exIds)
            await adminDb.from('exercises').delete().eq('workout_id', savedW.id)

            const exs = Array.isArray(w?.exercises) ? w.exercises : []
            for (const [idx, e] of exs.entries()) {
                const baseExercise = {
                    workout_id: savedW.id,
                    name: e?.name || '',
                    notes: e?.notes ?? null,
                    video_url: e?.video_url ?? null,
                    rest_time: e?.rest_time ?? null,
                    cadence: e?.cadence ?? null,
                    method: e?.method ?? null,
                    order: e?.order ?? idx
                }

                let savedEx: { id: string } | null = null
                if (e?.id) {
                    const { data, error } = await adminDb
                        .from('exercises')
                        .upsert({ ...baseExercise, id: e.id }, { onConflict: 'id' })
                        .select()
                        .single()
                    if (!error) {
                        const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
                        if (row?.id) savedEx = { id: String(row.id) }
                    }
                }
                if (!savedEx) {
                    const { data } = await adminDb
                        .from('exercises')
                        .insert(baseExercise)
                        .select()
                        .single()
                    const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
                    if (row?.id) savedEx = { id: String(row.id) }
                }

                if (!savedEx?.id) continue

                const sets = Array.isArray(e?.sets) ? e.sets : []
                for (let i = 0; i < sets.length; i++) {
                    const s = sets[i]
                    await adminDb.from('sets').insert({
                        exercise_id: savedEx.id,
                        reps: s?.reps ?? null,
                        rpe: s?.rpe ?? null,
                        set_number: s?.set_number ?? (i + 1),
                        weight: s?.weight ?? null,
                        is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
                        advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null
                    })
                }
            }
        }

        if (assessments.length) {
            const batchSize = 200
            for (let i = 0; i < assessments.length; i += batchSize) {
                const batch = assessments.slice(i, i + batchSize).map(a => ({
                    id: a.id,
                    student_id: a.student_id,
                    trainer_id: a.trainer_id,
                    assessment_date: a.assessment_date,
                    weight: a.weight,
                    height: a.height,
                    age: a.age,
                    gender: a.gender,
                    arm_circ: a.arm_circ,
                    chest_circ: a.chest_circ,
                    waist_circ: a.waist_circ,
                    hip_circ: a.hip_circ,
                    thigh_circ: a.thigh_circ,
                    calf_circ: a.calf_circ,
                    triceps_skinfold: a.triceps_skinfold,
                    biceps_skinfold: a.biceps_skinfold,
                    subscapular_skinfold: a.subscapular_skinfold,
                    suprailiac_skinfold: a.suprailiac_skinfold,
                    abdominal_skinfold: a.abdominal_skinfold,
                    thigh_skinfold: a.thigh_skinfold,
                    calf_skinfold: a.calf_skinfold,
                    observations: a.observations,
                    pdf_url: a.pdf_url
                }))
                await adminDb.from('assessments').upsert(batch, { onConflict: 'id' })
            }
        }

        if (notifications.length) {
            const batchSize = 500
            for (let i = 0; i < notifications.length; i += batchSize) {
                const batch = notifications.slice(i, i + batchSize)
                await adminDb.from('notifications').upsert(batch, { onConflict: 'id' })
            }
        }

        if (messages.length) {
            const batchSize = 500
            for (let i = 0; i < messages.length; i += batchSize) {
                const batch = messages.slice(i, i + batchSize)
                await adminDb.from('messages').upsert(batch, { onConflict: 'id' })
            }
        }

        if (invites.length) {
            const batchSize = 500
            for (let i = 0; i < invites.length; i += batchSize) {
                const batch = invites.slice(i, i + batchSize)
                await adminDb.from('invites').upsert(batch, { onConflict: 'id' })
            }
        }

        return { success: true } as unknown as ActionResult<{ imported: number }> & { error?: string; success?: boolean }
    } catch (e) {
        return { error: getErrorMessage(e) } as unknown as ActionResult<{ imported: number }> & { error?: string; success?: boolean }
    }
}
