/**
 * Para onde leva o TOQUE numa notificação — no push E no card do sino.
 *
 * Relato do dono (06/10/2026): "tem muito card que ao clicar só entra no app".
 * A medição confirmou: dos tipos que o servidor envia por push, só uns oito
 * navegavam. O resto dependia de quem enviou ter posto um `link` no push — e
 * quase ninguém põe: o caminho padrão (`insertNotifications`) só leva `link` se
 * o `metadata.link` da linha existir. Enquanto isso o SINO já sabia o destino
 * de cada tipo, numa tabela própria. Dois lugares decidindo a mesma coisa, e o
 * push perdendo.
 *
 * Hoje a decisão mora AQUI, pelo TIPO, e o `link` do payload é só desempate
 * para tipo que a tabela não conhece. Três telas não são rota — são janelas que
 * o shell abre por estado (a Nutrição e os Medicamentos são overlays; fora de
 * `/app` o iPhone abriria o Safari) —, por isso o destino é uma união, não uma
 * string.
 *
 * ⚠️ Tipo NOVO enviado pelo servidor precisa entrar numa das tabelas ou em
 * `SEM_DESTINO_DE_PROPOSITO`, com o motivo. O guard
 * `destinoDaNotificacao.test.ts` lê os emissores e reprova o que ficar de fora —
 * sem isso o próximo tipo volta a "só abrir o app" em silêncio.
 */

export type DestinoDaNotificacao =
  | { tipo: 'rota'; rota: string }
  | { tipo: 'nutricao' }
  | { tipo: 'medicamentos' }
  | { tipo: 'treinoAtivo' }
  | { tipo: 'painelAdmin'; aba: 'requests' | 'vip' }

/** Nomes antigos de tipo que o servidor ainda pode mandar. */
export const TYPE_ALIASES: Record<string, string> = {
  workout_finished: 'workout_finish',
  workout_started: 'workout_start',
  pr: 'friend_pr',
}

export const tipoCanonico = (type: string): string => TYPE_ALIASES[type] ?? type

const COMUNIDADE = '/dashboard/community'
const LISTA_DE_TREINOS = '/dashboard'

const ROTA_POR_TIPO: Record<string, string> = {
  // Movimento de quem a pessoa segue: tudo isso vive no feed.
  friend_pr: COMUNIDADE,
  friend_streak: COMUNIDADE,
  friend_goal: COMUNIDADE,
  friend_weekly_goal: COMUNIDADE,
  friend_achievement: COMUNIDADE,
  friend_comeback: COMUNIDADE,
  friends_trained_today: COMUNIDADE,
  friend_online: COMUNIDADE,
  workout_start: COMUNIDADE,
  workout_finish: COMUNIDADE,
  milestone: COMUNIDADE,
  story_posted: COMUNIDADE,
  story_like: COMUNIDADE,
  story_reaction: COMUNIDADE,
  story_comment: COMUNIDADE,
  like: COMUNIDADE,
  follow_request: COMUNIDADE,
  follow_accepted: COMUNIDADE,
  challenge_created: COMUNIDADE,
  challenge_accepted: COMUNIDADE,
  challenge_declined: COMUNIDADE,
  mentioned_in_comment: COMUNIDADE,

  // Sem remetente no payload o shell não abre a conversa: cai na lista delas.
  message: '/dashboard/chat',
  appointment: '/dashboard/schedule',
  appointment_created: '/dashboard/schedule',

  // Cutucões sobre o próprio treino: a lista é de onde se começa um.
  workout_reminder: LISTA_DE_TREINOS,
  workout_assigned: LISTA_DE_TREINOS,
  workout_updated: LISTA_DE_TREINOS,
  streak_at_risk: LISTA_DE_TREINOS,
  inactivity: LISTA_DE_TREINOS,
  pr_close: LISTA_DE_TREINOS,
  // O card "Vai treinar hoje?" e o treino do dia moram na lista de treinos.
  morning_briefing: LISTA_DE_TREINOS,
  // O convite chega como janela no dashboard (realtime). O push mandava o
  // link `/`, que depois da migração de rotas virou a PÁGINA COMERCIAL: o
  // toque tirava a pessoa do app.
  team_invite: LISTA_DE_TREINOS,
  // Professor: o próprio hook do push dispara o pedido de controle / abre o
  // controle; aqui só garante que a tela de baixo é o dashboard.
  student_workout_start: LISTA_DE_TREINOS,
  teacher_control_accepted: LISTA_DE_TREINOS,
}

/** Telas que o shell abre por ESTADO — não existe URL para elas. */
const TELA_POR_TIPO: Record<string, Exclude<DestinoDaNotificacao, { tipo: 'rota' }>> = {
  meal_reminder: { tipo: 'nutricao' },
  water_reminder: { tipo: 'nutricao' },
  diet_updated: { tipo: 'nutricao' },
  daily_goal_hit: { tipo: 'nutricao' },
  // Botão "Vou descansar" do push matinal: a meta do dia muda, e é lá que se vê.
  rest_day: { tipo: 'nutricao' },

  medication_reminder: { tipo: 'medicamentos' },
  medication_updated: { tipo: 'medicamentos' },

  // Só faz sentido com treino em andamento — sem ele, o shell não navega.
  rest_timer: { tipo: 'treinoAtivo' },
  // O aluno aceita/recusa o controle no aviso que aparece DENTRO do treino.
  teacher_control_request: { tipo: 'treinoAtivo' },
  teacher_control_released: { tipo: 'treinoAtivo' },
  // O chat do treino em dupla mora na tela do treino.
  team_chat: { tipo: 'treinoAtivo' },
  mentioned_in_chat: { tipo: 'treinoAtivo' },

  // O painel de admin é uma `view` do shell, não uma rota (`/admin` não existe).
  admin_new_signup: { tipo: 'painelAdmin', aba: 'requests' },
  admin_access_request: { tipo: 'painelAdmin', aba: 'requests' },
  admin_vip_expiring: { tipo: 'painelAdmin', aba: 'vip' },
}

/**
 * Tipos que NÃO levam a lugar nenhum, e por quê. Levar ao lugar errado é pior
 * que não levar: a pessoa perde o contexto e ainda tem que achar o caminho.
 */
export const SEM_DESTINO_DE_PROPOSITO: Record<string, string> = {
  billing_issue: 'cobrança/plano: a tela VIP não existe no iOS (política da Apple) e o professor não tem tela de plano no app',
  trial_ending: 'leva à tela VIP, que não existe no iOS',
  vip_trial_granted: 'leva à tela VIP, que não existe no iOS',
  broadcast: 'aviso livre do admin, sem tela associada',
  birthday: 'parabéns pelo tempo de app — não há tela a abrir',
  student_status_change: 'status de pagamento do aluno — não há tela de cobrança do lado do aluno',
  teacher_control_rejected: 'informativo para o professor; não há o que abrir',
  invite: 'o card do sino tem os próprios botões de aceitar/recusar',
}

/**
 * Só aceita destino DENTRO do app. O payload vem de fora e não pode virar
 * open-redirect (`//host`), nem tirar a pessoa do app: `/` hoje é a página
 * comercial e `/admin` não existe — os dois já foram mandados por push.
 */
export function rotaInternaDoApp(link: unknown): string {
  const s = String(link ?? '').trim()
  return /^\/dashboard(?:[/?#]|$)/.test(s) ? s : ''
}

function rotaDoResumoSemanal(n: { link?: unknown; metadata?: Record<string, unknown> | null }): string {
  const meta = n.metadata ?? {}
  const semana = String(meta.week_start ?? meta.weekStartDate ?? '').trim()
  if (semana) return `/dashboard/report/weekly?week=${encodeURIComponent(semana)}`
  // Sem a semana, só vale o link que já a traz — abrir a semana ERRADA é pior
  // que não abrir.
  const link = rotaInternaDoApp(n.link)
  return link.startsWith('/dashboard/report/weekly?') ? link : ''
}

export function destinoDaNotificacao(n: {
  type?: string | null
  link?: unknown
  metadata?: Record<string, unknown> | null
}): DestinoDaNotificacao | null {
  const tipo = tipoCanonico(String(n.type ?? '').trim())

  if (tipo === 'weekly_recap' || tipo === 'muscle_weekly_insights') {
    const rota = rotaDoResumoSemanal(n)
    return rota ? { tipo: 'rota', rota } : null
  }

  const tela = TELA_POR_TIPO[tipo]
  if (tela) return tela
  const rota = ROTA_POR_TIPO[tipo]
  if (rota) return { tipo: 'rota', rota }
  if (tipo in SEM_DESTINO_DE_PROPOSITO) return null

  // Tipo que a tabela não conhece: o link do payload, se for do app.
  const link = rotaInternaDoApp(n.link)
  return link ? { tipo: 'rota', rota: link } : null
}

/** O que o shell sabe fazer — cada destino vira exatamente uma destas chamadas. */
export type AcoesDoDestino = {
  abrirRota: (rota: string) => void
  abrirNutricao: () => void
  abrirMedicamentos: () => void
  abrirTreinoAtivo: () => void
  abrirPainelAdmin: (aba: 'requests' | 'vip') => void
}

/** Executa o destino. Devolve `false` quando não havia para onde ir. */
export function executarDestino(destino: DestinoDaNotificacao | null, acoes: AcoesDoDestino): boolean {
  if (!destino) return false
  switch (destino.tipo) {
    case 'rota': acoes.abrirRota(destino.rota); return true
    case 'nutricao': acoes.abrirNutricao(); return true
    case 'medicamentos': acoes.abrirMedicamentos(); return true
    case 'treinoAtivo': acoes.abrirTreinoAtivo(); return true
    case 'painelAdmin': acoes.abrirPainelAdmin(destino.aba); return true
    default: {
      // Destino novo na união sem ação aqui não compila.
      const exaustivo: never = destino
      return exaustivo
    }
  }
}

/** Os tipos que este módulo sabe tratar — usado pelo guard de classe. */
export function tipoTemDecisao(type: string): boolean {
  const t = tipoCanonico(type)
  return t in ROTA_POR_TIPO || t in TELA_POR_TIPO || t in SEM_DESTINO_DE_PROPOSITO
    || t === 'weekly_recap' || t === 'muscle_weekly_insights'
}
