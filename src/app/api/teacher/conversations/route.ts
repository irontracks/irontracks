import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/route'
import { respondDbError } from '@/utils/api/dbError'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// Inbox do professor: uma linha por aluno vinculado, com a última mensagem e não-lidas.
// Padrão do inbox/feed: service-role SÓ pra descobrir os alunos (students.teacher_id, cuja
// RLS o professor não lê arbitrariamente); as mensagens vêm da RPC get_user_conversations,
// que é SECURITY DEFINER e valida caller = auth.uid() (só as conversas DELE). Filtramos aos
// alunos e nunca expomos conversa de terceiro.

interface ConversationRow {
    userId: string
    name: string
    channelId: string | null
    lastMessage: string | null
    lastMessageAt: string | null
    unreadCount: number
    photo: string | null
    isOnline: boolean
}

export async function GET() {
    try {
        const auth = await requireRole(['admin', 'teacher'])
        if (!auth.ok) return auth.response
        const requesterId = String(auth.user.id)
        const admin = createAdminClient()

        const { data: students, error: sErr } = await admin
            .from('students')
            .select('user_id, name, email')
            .eq('teacher_id', requesterId)
        if (sErr) return respondDbError('teacher:conversations:students', sErr)

        const studentMap = new Map<string, string>()
        for (const s of students || []) {
            const uid = String((s as { user_id?: unknown }).user_id || '').trim()
            if (uid) studentMap.set(uid, String((s as { name?: unknown; email?: unknown }).name || (s as { email?: unknown }).email || 'Aluno'))
        }
        if (studentMap.size === 0) return NextResponse.json({ ok: true, conversations: [] })

        const { data: convos, error: cErr } = await auth.supabase.rpc('get_user_conversations', { user_id: requesterId })
        if (cErr) return respondDbError('teacher:conversations:rpc', cErr)

        const byUser = new Map<string, Record<string, unknown>>()
        for (const c of (Array.isArray(convos) ? convos : []) as Record<string, unknown>[]) {
            const other = String(c.other_user_id || '').trim()
            if (studentMap.has(other)) byUser.set(other, c)
        }

        const conversations: ConversationRow[] = Array.from(studentMap.entries()).map(([uid, name]) => {
            const c = byUser.get(uid)
            return {
                userId: uid,
                name,
                channelId: c ? String(c.channel_id) : null,
                lastMessage: c && c.last_message != null ? String(c.last_message) : null,
                lastMessageAt: c && c.last_message_at != null ? String(c.last_message_at) : null,
                unreadCount: c ? Number(c.unread_count || 0) : 0,
                photo: c && c.other_user_photo != null ? String(c.other_user_photo) : null,
                isOnline: c ? !!c.is_online : false,
            }
        })

        // Conversas com mensagem primeiro (mais recentes no topo); alunos sem conversa depois, por nome.
        conversations.sort((a, b) => {
            if (a.lastMessageAt && b.lastMessageAt) return a.lastMessageAt < b.lastMessageAt ? 1 : -1
            if (a.lastMessageAt) return -1
            if (b.lastMessageAt) return 1
            return a.name.localeCompare(b.name)
        })

        return NextResponse.json({ ok: true, conversations })
    } catch (e: unknown) {
        logError('teacher:conversations', e)
        return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
    }
}
