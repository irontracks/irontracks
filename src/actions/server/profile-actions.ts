'use server'

import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const UpdateProfileSchema = z.object({
    displayName: z.string().trim().min(2).max(60),
})

export type UpdateProfileState = {
    ok: boolean
    error?: string
    displayName?: string
} | null

/**
 * Server Action — atualiza o display_name do usuário autenticado.
 * Usada via useActionState + useFormStatus no ProfilePage (PR-D).
 */
export async function updateProfileDisplayName(
    _prevState: UpdateProfileState,
    formData: FormData,
): Promise<NonNullable<UpdateProfileState>> {
    try {
        const parsed = UpdateProfileSchema.safeParse({
            displayName: String(formData.get('displayName') ?? ''),
        })
        if (!parsed.success) {
            return { ok: false, error: 'Use entre 2 e 60 caracteres.' }
        }

        const supabase = await createClient()
        const { data: { user }, error: authErr } = await supabase.auth.getUser()
        if (authErr || !user?.id) {
            return { ok: false, error: 'unauthorized' }
        }

        const { error } = await supabase
            .from('profiles')
            .update({ display_name: parsed.data.displayName })
            .eq('id', user.id)

        if (error) {
            return { ok: false, error: error.message || 'Erro ao salvar' }
        }

        revalidatePath('/dashboard/profile')
        return { ok: true, displayName: parsed.data.displayName }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
    }
}
