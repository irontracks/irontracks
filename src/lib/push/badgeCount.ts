/**
 * @module badgeCount
 *
 * Núcleo puro do número que aparece no ícone do app (badge do iOS).
 *
 * Regra: conta as notificações NÃO LIDAS do usuário, ignorando as que já
 * existiam quando ele abriu o app pela última vez (`badge_cleared_at`).
 *
 * Por que a marca existe: o badge é recalculado no servidor a cada push. O
 * lado nativo zera o ícone quando o app fica ativo, mas sem esta marca a
 * próxima notificação devolveria a contagem cheia (32 → 33) — foi exatamente
 * o "número preso no ícone" relatado pelo dono. Abrir o app NÃO marca nada
 * como lido; o sino dentro do app segue com o indicador de não lidas.
 */

export interface UnreadNotificationRow {
  user_id?: string | null
  created_at?: string | null
}

/**
 * @param unreadRows Linhas de `notifications` com `is_read = false`.
 * @param clearedAtByUser `user_id` → `badge_cleared_at` (ISO) ou null/ausente
 *   quando o usuário nunca abriu o app depois desta feature (conta tudo).
 * @returns `user_id` → quantidade a exibir no badge. Usuário sem nenhuma
 *   notificação contável simplesmente não aparece no mapa.
 */
export function countUnreadSinceCleared(
  unreadRows: readonly UnreadNotificationRow[] | null | undefined,
  clearedAtByUser: ReadonlyMap<string, string | null | undefined>,
): Map<string, number> {
  const counts = new Map<string, number>()
  if (!Array.isArray(unreadRows)) return counts

  for (const row of unreadRows) {
    const uid = String(row?.user_id || '')
    if (!uid) continue

    const clearedRaw = clearedAtByUser.get(uid)
    if (clearedRaw) {
      const cleared = Date.parse(clearedRaw)
      const created = Date.parse(String(row?.created_at || ''))
      // Data ilegível (qualquer das duas) → conta, para nunca ENGOLIR uma
      // notificação por causa de parsing. Perder o aviso é pior que repetir o
      // número.
      if (Number.isFinite(cleared) && Number.isFinite(created) && created <= cleared) continue
    }

    counts.set(uid, (counts.get(uid) ?? 0) + 1)
  }

  return counts
}
