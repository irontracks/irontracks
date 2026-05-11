/**
 * /social → redireciona pra /community (mesma tela com nome canônico).
 *
 * O termo "social" continua aparecendo em links antigos e em telemetria,
 * mas a rota interna se chama /community desde o redesign de 2026.
 */
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function SocialRedirect() {
  redirect('/community')
}
