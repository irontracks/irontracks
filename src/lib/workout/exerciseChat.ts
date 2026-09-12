/**
 * Chat de IA por EXERCÍCIO — a parte que não é rota.
 *
 * As quatro rotas (`api/ai/exercise-chat`, `/prepare-media`, `/summary`) falam
 * o mesmo contrato com a tela e precisam concordar sobre três coisas: qual é a
 * chave da thread, o que do histórico volta ao modelo, e como o prompt é
 * montado. Concordar por cópia foi o que custou 14 renderers de série neste
 * repo — então mora tudo aqui.
 *
 * ── A thread é (usuário, sessão, ÍNDICE do exercício) ──────────────────────────
 * O índice, e não o nome: é ele que a tela do treino ativo tem na mão e é ele
 * que sobrevive a renomear/trocar o exercício no meio da sessão. O NOME também
 * é gravado, mas como CARIMBO do que foi conversado — quando ele diverge do
 * exercício de agora, o GET devolve `nomeAnterior` e quem exibe avisa que a
 * conversa é sobre outro exercício. Sem isso, trocar "Supino reto" por
 * "Crucifixo" no mesmo slot herdaria em silêncio a conversa do anterior.
 *
 * ⚠️ ── A MÍDIA ENTRA UMA VEZ ────────────────────────────────────────────────────
 * O vídeo/foto vai ao Gemini SÓ no turno em que foi enviado. Nos turnos
 * seguintes o histórico que volta ao modelo é TEXTO — inclusive o turno que
 * teve mídia, que entra como texto mais a marca de que houve foto/vídeo.
 * Reenviar o vídeo a cada pergunta multiplica o custo (é a mesma chave paga de
 * produção) sem melhorar a resposta: o que o modelo viu já está na resposta
 * dele, que está no histórico. Quem mexer aqui e mandar mídia de novo não vai
 * ver nada quebrar — só a conta subir.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeAiInput } from '@/lib/nutrition/security'

/** Turnos do histórico que voltam ao modelo — o mesmo teto do nutrition-chat. */
export const MAX_TURNOS_NO_PROMPT = 6

/** Teto de mensagens que o GET devolve para a tela (a thread de um exercício é curta). */
export const MAX_MENSAGENS_NA_TELA = 60

/** Tetos de texto, iguais aos do contrato das rotas. */
export const TETO_PERGUNTA = 1000
export const TETO_RESPOSTA = 1400
export const TETO_RESUMO = 500

export type PapelDaMensagem = 'user' | 'assistant'
export type TipoDeMidia = 'photo' | 'video'

/** O que a tela recebe no GET. */
export interface MensagemDoChat {
  role: PapelDaMensagem
  content: string
  mediaKind: TipoDeMidia | null
  createdAt: string
}

/** A linha crua de `exercise_chat_messages` (só as colunas que lemos). */
export interface LinhaDaThread {
  role: string | null
  content: string | null
  media_kind: string | null
  exercise_name: string | null
  created_at: string | null
}

const COLUNAS_DA_THREAD = 'role, content, media_kind, exercise_name, created_at'

/**
 * Instante canônico da sessão.
 *
 * A tela manda o `startedAt` do treino ativo, e a mesma sessão pode chegar com
 * ou sem milissegundos, com `Z` ou com offset. O Postgres compararia tudo isso
 * como o mesmo `timestamptz`, mas normalizar aqui evita que a chave do POST e a
 * do GET divirjam em qualquer ponto que venha a comparar STRING (cache, log,
 * dedupe). Devolve '' quando a data não é válida — quem chama decide o erro.
 */
export function normalizarInstante(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const ms = Date.parse(s)
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toISOString()
}

/**
 * Lê a thread daquele (sessão, índice) e devolve mais antiga primeiro.
 *
 * ⚠️ A consulta é DESCENDENTE e o array é invertido aqui — não é firula. Com
 * `ascending: true` + `limit`, o teto corta pelo LADO ERRADO: passando de
 * `limite` mensagens, o banco devolveria as PRIMEIRAS e a conversa congelaria
 * no começo, tanto na tela quanto no histórico que vai ao modelo. Descendente
 * + reverse pega as ÚLTIMAS, que é o que "as N mensagens da thread" quer dizer.
 *
 * ⚠️ E o desempate por `role` também não é firula. Os dois turnos de uma
 * pergunta são gravados em UM `insert([user, assistant])`, então `now()` é o
 * mesmo para os dois e `created_at` EMPATA: sem segundo critério, o Postgres
 * não deve nenhuma ordem e a resposta pode aparecer acima da pergunta. `role`
 * ascendente aqui vira descendente depois do reverse — e 'user' > 'assistant'
 * em texto, ou seja, a pergunta primeiro.
 */
export async function carregarThread(
  supabase: SupabaseClient,
  userId: string,
  sessionStartedAt: string,
  exerciseIndex: number,
  limite = MAX_MENSAGENS_NA_TELA,
): Promise<{ rows: LinhaDaThread[]; error: unknown }> {
  const { data, error } = await supabase
    .from('exercise_chat_messages')
    .select(COLUNAS_DA_THREAD)
    .eq('user_id', userId)
    .eq('session_started_at', sessionStartedAt)
    .eq('exercise_index', exerciseIndex)
    .order('created_at', { ascending: false })
    .order('role', { ascending: true })
    .limit(limite)

  // O supabase-js NÃO lança em erro de leitura — devolve `{ error }`. Quem
  // chama precisa OLHAR: tratar falha como "thread vazia" faria o chat começar
  // do zero em silêncio e o modelo responder sem o contexto que existe.
  const rows = ((data ?? []) as unknown as LinhaDaThread[]).slice().reverse()
  return { rows, error }
}

/** Converte as linhas cruas no formato do contrato do GET. */
export function paraMensagensDaTela(rows: LinhaDaThread[]): MensagemDoChat[] {
  return rows
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .map((r) => ({
      role: r.role as PapelDaMensagem,
      content: String(r.content ?? ''),
      mediaKind: r.media_kind === 'photo' || r.media_kind === 'video' ? (r.media_kind as TipoDeMidia) : null,
      createdAt: String(r.created_at ?? ''),
    }))
}

/**
 * O exercício mudou no slot?
 *
 * Compara o nome CARIMBADO na thread com o nome de agora. Comparação sem caixa
 * e sem espaço de sobra: "supino reto" e "Supino Reto " são o mesmo exercício,
 * e avisar que mudou aí seria alarme falso na cara do usuário.
 */
export function nomeAnteriorDaThread(rows: LinhaDaThread[], nomeAtual: string): string | null {
  const atual = String(nomeAtual ?? '').trim().toLowerCase()
  for (let i = rows.length - 1; i >= 0; i--) {
    const gravado = String(rows[i]?.exercise_name ?? '').trim()
    if (!gravado) continue
    if (gravado.toLowerCase() !== atual) return gravado
    return null
  }
  return null
}

/**
 * Histórico para o prompt — os últimos turnos, SÓ TEXTO.
 *
 * Cada turno é sanitizado de novo mesmo tendo sido sanitizado na gravação: o
 * texto do assistente veio de um modelo e o do usuário veio da tela; nada que
 * volta ao prompt entra sem passar por aqui.
 */
export function historicoParaPrompt(rows: LinhaDaThread[], maxTurnos = MAX_TURNOS_NO_PROMPT): string {
  const ultimos = rows.slice(-maxTurnos)
  if (!ultimos.length) return ''
  const linhas = ultimos.map((r) => {
    const quem = r.role === 'assistant' ? 'TREINADOR' : 'ALUNO'
    const marca = r.media_kind === 'photo' ? ' [enviou uma foto]' : r.media_kind === 'video' ? ' [enviou um vídeo]' : ''
    return `${quem}${marca}: ${sanitizeAiInput(r.content, TETO_PERGUNTA)}`
  })
  return `CONVERSA ATÉ AQUI (a mídia já foi analisada nos turnos anteriores e NÃO é reenviada):\n${linhas.join('\n')}\n`
}

export interface PromptDaPergunta {
  exerciseName: string
  question: string
  historico: string
  midia: TipoDeMidia | null
}

/**
 * O prompt é sobre AQUELE exercício, no meio da série.
 *
 * Foto e vídeo fazem perguntas DIFERENTES, e é por isso que o tipo viaja até
 * aqui: foto responde "é o aparelho/a postura certa?", vídeo responde "a
 * execução está correta?". Tratar os dois igual devolve resposta de foto para
 * quem filmou uma repetição — a pergunta cara que o usuário fez.
 */
export function montarPromptDaPergunta(p: PromptDaPergunta): string {
  const nome = sanitizeAiInput(p.exerciseName, 120) || 'exercício'
  const pergunta = sanitizeAiInput(p.question, TETO_PERGUNTA)

  const sobreAMidia =
    p.midia === 'photo'
      ? 'O ALUNO ANEXOU UMA FOTO. Ela mostra o aparelho, a regulagem ou a posição dele. Diga se é o aparelho certo para este exercício e se a regulagem/postura está adequada — e o que ajustar.\n'
      : p.midia === 'video'
        ? 'O ALUNO ANEXOU UM VÍDEO da execução. Diga se a execução está correta: amplitude, ritmo, trajetória e o que corrigir primeiro.\n'
        : ''

  return [
    'Você é o treinador do IronTracks respondendo ao aluno DENTRO da academia, entre uma série e outra.',
    `EXERCÍCIO DA VEZ: "${nome}".`,
    '',
    p.historico,
    sobreAMidia,
    `PERGUNTA DO ALUNO: "${pergunta}"`,
    '',
    'COMO RESPONDER:',
    '- Português do Brasil, direto, no máximo 120 palavras. Ele está de pé, com o celular na mão.',
    '- Fale do exercício da vez. Se a pergunta for sobre outra coisa, responda curto e traga de volta.',
    '- Se faltar informação para responder com segurança, diga o que falta em vez de adivinhar.',
    '- Nada de diagnóstico médico. Dor que não passa é caso de profissional de saúde, e diga isso.',
    '- Sem markdown, sem lista numerada, sem título. Texto corrido.',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Resumo da conversa — o que sobra do exercício depois que ele acaba.
 *
 * É uma LINHA para o aluno reler depois, não uma ata: o valor está em
 * "o que mudar na próxima vez", não em recontar a conversa.
 */
export function montarPromptDoResumo(exerciseName: string, rows: LinhaDaThread[]): string {
  const nome = sanitizeAiInput(exerciseName, 120) || 'exercício'
  const conversa = rows
    .slice(-12)
    .map((r) => `${r.role === 'assistant' ? 'TREINADOR' : 'ALUNO'}: ${sanitizeAiInput(r.content, TETO_PERGUNTA)}`)
    .join('\n')

  return [
    `Resuma a conversa abaixo sobre o exercício "${nome}".`,
    '',
    conversa,
    '',
    'REGRAS:',
    '- Português do Brasil, no máximo 2 frases, no máximo 300 caracteres.',
    '- Só o que o aluno precisa LEMBRAR na próxima vez que fizer este exercício (o ajuste, a correção, a conclusão).',
    '- Não recontar a conversa nem citar "o treinador disse".',
    '- Sem markdown, sem título.',
  ].join('\n')
}
