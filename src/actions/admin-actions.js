'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'

const ADMIN_EMAIL = 'djmkapple@gmail.com'

async function checkAdmin() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.email !== ADMIN_EMAIL) {
        throw new Error('Unauthorized')
    }
    return user
}

export async function sendBroadcastMessage(title, message) {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()

        // 1. Get all users
        const { data: profiles, error: pError } = await adminDb.from('profiles').select('id')
        if (pError) throw pError

        // 2. Prepare notifications
        const notifications = profiles.map(p => ({
            user_id: p.id,
            title,
            message,
            type: 'broadcast', // Must match database constraints if any
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

        return { success: true, count: notifications.length }
    } catch (e) {
        return { error: e.message }
    }
}

export async function registerStudent(email, password, name) {
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
            role: 'user',
            photo_url: null,
            last_seen: new Date()
        })

        if (pError) console.error("Profile creation warning:", pError)

        return { success: true, user: data.user }
    } catch (e) {
        return { error: e.message }
    }
}

export async function addTeacher(name, email, phone, status = 'pending') {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()
        const { error } = await adminDb.from('teachers').insert({ name, email, phone, status })
        if (error) throw error
        return { success: true }
    } catch (e) {
        return { error: e.message }
    }
}

export async function clearAllStudents() {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()
        const { error } = await adminDb.from('profiles').delete().neq('email', ADMIN_EMAIL)
        if (error) throw error
        return { success: true }
    } catch (e) {
        return { error: e.message }
    }
}

export async function clearAllTeachers() {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()
        const { error } = await adminDb.from('teachers').delete().gte('created_at', '1900-01-01')
        if (error) throw error
        return { success: true }
    } catch (e) {
        return { error: e.message }
    }
}

export async function clearPublicRegistry() {
    try {
        await checkAdmin()
        const adminDb = createAdminClient()
        const { error } = await adminDb.from('notifications').delete().gte('created_at', '1900-01-01')
        if (error) throw error
        return { success: true }
    } catch (e) {
        return { error: e.message }
    }
}

export async function assignWorkoutToStudent(studentId, template) {
    try {
        await checkAdmin();
        const adminDb = createAdminClient();
        // Resolve auth user id: studentId may be students.id or auth.users.id
        let targetUserId = studentId;
        // If provided id is NOT an auth.users.id, try to resolve via students
        const { data: maybeAuthUser } = await adminDb.from('profiles').select('id').eq('id', studentId).single();
        if (!maybeAuthUser) {
            const { data: studentRow } = await adminDb
                .from('students')
                .select('user_id, email, id')
                .or(`id.eq.${studentId},user_id.eq.${studentId}`)
                .limit(1)
                .single();
            if (studentRow?.user_id) {
                targetUserId = studentRow.user_id;
            } else {
                throw new Error('Aluno ainda não possui conta (login Google). Peça para realizar o primeiro login para vincular o treino.');
            }
        }

        const { data: newWorkout, error: wError } = await adminDb
            .from('workouts')
            .insert({
                user_id: targetUserId,
                name: template.name,
                notes: template.notes,
                is_template: true
            })
            .select()
            .single();

        if (wError) throw wError;

        // 2. Clone Exercises
        if (template.exercises && template.exercises.length > 0) {
            const exercisesToInsert = template.exercises.map(ex => ({
                workout_id: newWorkout.id,
                name: ex.name,
                muscle_group: ex.muscle_group,
                notes: ex.notes,
                video_url: ex.video_url,
                rest_time: ex.rest_time,
                cadence: ex.cadence,
                method: ex.method,
                "order": ex.order
            }));
            const { error: exError } = await adminDb.from('exercises').insert(exercisesToInsert);
            if (exError) throw exError;
        }

        return { success: true, workoutId: newWorkout.id, workout: newWorkout };
    } catch (e) {
        return { error: e.message };
    }
}

export async function getStudentWorkouts(studentId) {
    try {
        await checkAdmin();
        const adminDb = createAdminClient();

        // Resolve auth user id from either auth.users/profiles or students
        let targetUserId = studentId;
        const { data: maybeProfile } = await adminDb.from('profiles').select('id').eq('id', studentId).single();
        if (!maybeProfile) {
            const { data: srow } = await adminDb
                .from('students')
                .select('user_id, id')
                .or(`id.eq.${studentId},user_id.eq.${studentId}`)
                .limit(1)
                .single();
            if (srow?.user_id) targetUserId = srow.user_id;
        }

        const { data, error } = await adminDb
            .from('workouts')
            .select('*, exercises(*)')
            .eq('user_id', targetUserId)
            .order('name');

        if (error) throw error;
        return { data };
    } catch (e) {
        return { error: e.message };
    }
}

export async function removeWorkoutFromStudent(workoutId) {
    try {
        await checkAdmin();
        const adminDb = createAdminClient();
        const { error } = await adminDb.from('workouts').delete().eq('id', workoutId);
        if (error) throw error;
        return { success: true };
    } catch (e) {
        return { error: e.message };
    }
}