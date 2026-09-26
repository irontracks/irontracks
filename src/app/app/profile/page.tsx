/**
 * /profile → redireciona pra /dashboard com a aba VIP/perfil.
 *
 * Histórico: usuários compartilhavam links tipo /profile achando que
 * existia uma rota dedicada; o Next devolvia 404. Esses redirects mantêm
 * URLs limpas no menu (e compatibilidade com bookmarks antigos) sem
 * duplicar a tela do perfil que mora no dashboard como modal.
 */
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ProfileRedirect() {
  redirect('/dashboard?tab=profile')
}
