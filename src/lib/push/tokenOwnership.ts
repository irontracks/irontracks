/**
 * De quem é este push token? (06/09/2026)
 *
 * Um token do APNs/FCM pertence ao **APARELHO**, não à conta: o mesmo iPhone
 * devolve o mesmo token qualquer que seja o usuário logado. A auditoria de
 * 27/06/2026 fechou o IDOR — sem guard, alguém que soubesse o token de outra
 * pessoa podia reivindicá-lo e passar a receber as notificações dela — e o
 * guard recusava TODA troca de dono com 409.
 *
 * O que ele não previu é o caso legítimo e comum: **a mesma pessoa trocando de
 * conta no próprio aparelho**. Depois da primeira conta registrar, a segunda
 * batia em 409 para sempre, em silêncio (o app só gravava um `logWarn` local).
 * Medido em produção em 06/09/2026: o iPhone do dono levou 409 às 03:58 e às
 * 04:11, a conta oficial ficou sem NENHUM token iOS, e nenhum push chegava —
 * de tipo nenhum, não só o lembrete de refeição.
 *
 * A régua passa a ser o APARELHO: `device_id` é o `identifierForVendor` no iOS,
 * estável por aparelho+app e independente da conta. Se o aparelho é o mesmo, é
 * troca de conta e o token é reatribuído; se não bate (ou não dá para saber),
 * continua 409 — quem roubou só o token, de outro aparelho, segue barrado.
 */
export type DecisaoDoToken = 'grava' | 'reatribui' | 'recusa'

export function decidirDonoDoToken(args: {
  /** Dono gravado hoje na linha do token (null/'' = token novo). */
  donoAtual: string | null | undefined
  /** Quem está registrando agora (usuário autenticado). */
  novoDono: string
  /** `device_id` gravado na linha (pode ser null em linha antiga). */
  deviceIdGravado: string | null | undefined
  /** `device_id` que o app mandou nesta chamada. */
  deviceIdRecebido: string | null | undefined
}): DecisaoDoToken {
  const dono = String(args.donoAtual ?? '').trim()
  const novo = String(args.novoDono ?? '').trim()
  if (!novo) return 'recusa'
  // Token novo, ou o mesmo dono renovando: caminho comum.
  if (!dono || dono === novo) return 'grava'

  const gravado = String(args.deviceIdGravado ?? '').trim()
  const recebido = String(args.deviceIdRecebido ?? '').trim()
  // Sem os DOIS lados não há prova de aparelho — e "não sei" nunca autoriza
  // tomar o token de outra conta.
  if (!gravado || !recebido) return 'recusa'
  return gravado === recebido ? 'reatribui' : 'recusa'
}
