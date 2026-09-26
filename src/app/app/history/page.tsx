/**
 * /history → redireciona pro dashboard com a aba histórico aberta.
 *
 * A tela de histórico abre como overlay dentro do dashboard via menu lateral.
 * Não existe rota dedicada — esse redirect cobre links antigos.
 */
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function HistoryRedirect() {
  redirect('/dashboard?modal=history')
}
