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
