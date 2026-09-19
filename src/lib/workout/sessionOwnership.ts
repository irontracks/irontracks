/**
 * @module sessionOwnership
 *
 * O discriminador "esta sessão é do DONO logado?" — extraído de
 * `exerciseChatThread.ts` em 19/09/2026 quando o botão de voz precisou da
 * MESMA regra sem o resto do contrato da conversa (endereço, `startedAt`
 * obrigatório). Antes de extrair, copiar a checagem seria o mesmo erro que já
 * custou caro aqui — duas cópias da mesma decisão divergindo em silêncio.
 *
 * A regra é FUNCIONAL, não geográfica: quem monta a sessão do treino de OUTRA
 * pessoa (Modo Spotter, painel do professor) marca `ehDeOutraPessoa: true`
 * explicitamente. Ausência do campo = sessão própria — é assim que
 * `enderecoDaConversa` sempre se comportou, e qualquer novo consumidor deste
 * discriminador entra na MESMA varredura de classe que já cobre o card
 * compartilhado (`conversaSoDoDonoDaSessao.test.tsx`).
 */

export interface SessaoPossivelmenteAlheia {
  ehDeOutraPessoa?: unknown
}

/**
 * A sessão é do usuário logado (não a de um parceiro/aluno sendo observado)?
 *
 * Sem sessão nenhuma (`null`/`undefined`/não-objeto) devolve `false` — sem
 * sessão reconhecível não há base para afirmar propriedade, e é mais seguro
 * esconder um recurso de escrita do que mostrá-lo por padrão. Medido: em
 * produção o `ExerciseCard` só monta dentro de um treino ativo, que sempre
 * tem sessão real — este caso é defesa, não caminho comum.
 */
export function sessaoEhPropria(session: unknown): boolean {
  if (!session || typeof session !== 'object') return false
  return (session as SessaoPossivelmenteAlheia).ehDeOutraPessoa !== true
}
