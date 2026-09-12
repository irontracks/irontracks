/**
 * Conversa de IA por exercício — endereço, discriminador do DONO e regras puras.
 *
 * ## Por que o endereço mora aqui, e não no componente
 *
 * A thread é endereçada por `(usuário, sessão, índice do exercício)`. O usuário
 * vem do cookie de sessão, do lado do servidor; os outros dois saem daqui. Um
 * componente que montasse essa chave por conta própria repetiria a decisão em
 * cada superfície — o padrão que já custou 14 renderers e cinco cálculos de
 * semana neste repo.
 *
 * ## O discriminador: o botão só existe para o DONO da sessão
 *
 * `ExerciseCard` é renderizado em TRÊS lugares (medido em 12/09/2026, por
 * `grep` nos importadores): duas vezes em `ExerciseList` (solo e dentro de
 * grupo) e uma no `PartnerExerciseOverlay` — o Modo Spotter, em que eu vejo e
 * anoto o exercício do MEU PARCEIRO. O painel de controle do professor
 * (`TeacherControlModal`) desenha um card PRÓPRIO, homônimo e local, então ele
 * nunca recebeu este botão — mas a regra vale igual e está travada por guard,
 * porque nada impede alguém de trocar aquele card pelo compartilhado amanhã.
 *
 * A conversa é do dono: perguntar "este peso está certo pra mim?" dentro da
 * sessão de outra pessoa gravaria a thread com o MEU `user_id` e o
 * `started_at` DELA. E o pedido do dono é explícito: a conversa não aparece
 * para o professor.
 *
 * O discriminador é FUNCIONAL antes de ser uma flag: sem `startedAt` não há
 * endereço, e sem endereço não há conversa a abrir. O `ehDeOutraPessoa` é a
 * segunda tranca — a sessão sintética do Modo Spotter hoje não tem `startedAt`,
 * e no dia em que alguém acrescentar um (para o cronômetro, digamos) o botão
 * vazaria em silêncio para a tela do parceiro. Declarar na ORIGEM que aquela
 * sessão é de outra pessoa é o que sobrevive a essa mudança.
 */

export type PapelDaMensagem = 'user' | 'assistant'
export type TipoDeMidia = 'photo' | 'video'

export interface MensagemDoChat {
  role: PapelDaMensagem
  content: string
  mediaKind: TipoDeMidia | null
  createdAt: string
}

/** Resposta do GET /api/ai/exercise-chat. */
export interface ThreadDoExercicio {
  messages: MensagemDoChat[]
  /**
   * Preenchido quando existe thread naquele (sessão, índice) gravada com OUTRO
   * `exercise_name` — o exercício foi trocado no meio da sessão. A tela DIZ
   * isso; nada é apagado.
   */
  nomeAnterior: string | null
}

/**
 * Sessão sintética montada para exibir o exercício de OUTRA pessoa.
 * Quem monta uma declara isto; ver `PartnerExerciseOverlay`.
 */
export interface SessaoPossivelmenteAlheia {
  startedAt?: unknown
  ehDeOutraPessoa?: unknown
}

/**
 * O endereço da conversa desta sessão, ou `null` quando ela não é do dono.
 *
 * Devolve o `started_at` em ISO — o mesmo formato que as duas tabelas guardam
 * (`timestamptz`) e que o contrato das rotas pede.
 */
export function enderecoDaConversa(session: unknown): string | null {
  if (!session || typeof session !== 'object') return null
  const s = session as SessaoPossivelmenteAlheia
  if (s.ehDeOutraPessoa === true) return null

  const ms = typeof s.startedAt === 'number' ? s.startedAt : Number(s.startedAt)
  // `new Date(NaN).toISOString()` LANÇA RangeError, e o mesmo vale para valores
  // acima de ±8,64e15. Um throw aqui mataria o card inteiro do exercício.
  if (!Number.isFinite(ms) || ms <= 0 || Math.abs(ms) > 8.64e15) return null
  try {
    return new Date(ms).toISOString()
  } catch {
    return null
  }
}

/** Teto do contrato da rota: `question: string 1..1000`. */
export const LIMITE_DA_PERGUNTA = 1000

export function perguntaValida(texto: string): boolean {
  const t = String(texto ?? '').trim()
  return t.length >= 1 && t.length <= LIMITE_DA_PERGUNTA
}

/**
 * Teto do bucket `set-media` (60 MB). Recusar AQUI é melhor que descobrir no
 * upload: o usuário está na academia, e subir 60 MB para receber erro no fim
 * gasta a franquia dele por nada.
 */
export const TETO_DE_MIDIA_BYTES = 60 * 1024 * 1024

export function tipoDaMidia(mime: string): TipoDeMidia | null {
  const m = String(mime ?? '').toLowerCase()
  if (m.startsWith('image/')) return 'photo'
  if (m.startsWith('video/')) return 'video'
  return null
}

// ── Memória da decisão e do rascunho ────────────────────────────────────────
//
// As duas vivem no `localStorage`, com o ENDEREÇO na chave. Em memória não
// serviria: o modal desmonta ao fechar (hook de rede não pode rodar fechado),
// então reabrir e sair de novo perguntaria "isto entra no relatório?" sem
// nenhuma mensagem nova — e pergunta que se repete sozinha deixa de ser lida.

const PREFIXO = 'irontracks.exerciseChat'

export function chaveDoRascunho(endereco: string, exIdx: number): string {
  return `${PREFIXO}.rascunho.v1.${endereco}.${exIdx}`
}

export function chaveDaDecisao(endereco: string, exIdx: number): string {
  return `${PREFIXO}.decidido.v1.${endereco}.${exIdx}`
}

/**
 * Houve mensagem NOVA desde a última decisão?
 *
 * A régua é a CONTAGEM de mensagens no instante em que o usuário decidiu, não
 * um booleano "já perguntei": com booleano, quem respondesse "não" uma vez
 * nunca mais seria perguntado — e a conversa seguinte, sobre outra dúvida,
 * ficaria fora do relatório sem ninguém escolher isso.
 */
export function precisaPerguntarAoSair(totalDeMensagens: number, decididoEm: number): boolean {
  const total = Number.isFinite(totalDeMensagens) ? totalDeMensagens : 0
  const decidido = Number.isFinite(decididoEm) ? Math.max(0, decididoEm) : 0
  return total > decidido
}

// ── Erros ───────────────────────────────────────────────────────────────────

export type ErroDoChat = 'rate_limited' | 'vip_required' | 'quota' | 'ai_unavailable' | 'invalid'

const RECADOS: Record<ErroDoChat, string> = {
  rate_limited: 'Muitas perguntas seguidas. Espere alguns segundos e envie de novo.',
  vip_required: 'Tirar dúvida com a IA faz parte do VIP.',
  quota: 'Sua cota de IA de hoje acabou. Ela volta amanhã.',
  ai_unavailable: 'A IA não respondeu agora. Sua pergunta continua aqui — tente de novo.',
  invalid: 'Não consegui enviar essa pergunta. Revise o texto e tente de novo.',
}

/**
 * O erro vira frase. Código desconhecido NÃO vira texto cru na tela: o usuário
 * não faz nada com `PGRST116`, e despejar a exceção na cara dele é o defeito
 * que este repo já varreu em onze superfícies (`telaDeErroNaoVazaExcecao`).
 */
export function recadoDoErro(erro: unknown): string {
  const chave = String(erro ?? '') as ErroDoChat
  return RECADOS[chave] ?? 'Não consegui falar com a IA agora. Tente de novo em instantes.'
}
