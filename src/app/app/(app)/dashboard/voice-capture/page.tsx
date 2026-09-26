import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { resolveRoleByUser } from '@/utils/auth/route'
import VoiceCaptureDebug from '@/components/dashboard/VoiceCaptureDebug'

export const dynamic = 'force-dynamic'

/**
 * FASE 0 do plano `docs/plans/voz-na-serie.md` — captura de calibração,
 * DESCARTÁVEL: mede o que o reconhecedor de voz devolve para números falados
 * ("cem quilos", "oitenta e dois e meio") ANTES de escrever o parser.
 *
 * Sem link em nenhum menu, de propósito — não é feature de produto. Gate por
 * admin/teacher (não por dono específico) porque é o mecanismo de papel mais
 * próximo já existente no repo; suficiente para uma ferramenta que não grava
 * nem lê dado sensível, só o texto que o próprio usuário dita.
 *
 * Remover esta rota e `VoiceCaptureDebug` quando a Fase 0 do plano terminar.
 */
export default async function VoiceCapturePage() {
  const supabase = await createClient()
  let authorized = false
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data?.user) {
      const { role } = await resolveRoleByUser(data.user)
      authorized = role === 'admin' || role === 'teacher'
    }
  } catch {
    authorized = false
  }

  if (!authorized) redirect('/dashboard')

  return <VoiceCaptureDebug />
}
