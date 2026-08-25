/**
 * "O usuário já treinou HOJE?" — fonte única da resposta no cliente.
 *
 * A pergunta é feita por dois componentes do dashboard ao mesmo tempo: o
 * RestDayPromptCard (não perguntar "vai treinar hoje?" a quem já treinou) e o
 * QuickStartCard (o atalho "Treinar agora" some depois da sessão concluída).
 * Estava escrita inline num deles; duplicar significaria dois critérios de
 * "hoje" divergindo em silêncio no dia em que um mudar.
 *
 * Regras que valem para os dois:
 * - Sessões concluídas são linhas de `workouts` com `is_template = false` — a
 *   linha só nasce no POST /api/workouts/finish. Treino EM ANDAMENTO não conta.
 * - O dia é sempre o calendário de São Paulo (`brtDateKey`), nunca o UTC: às
 *   21h BRT o UTC já virou e a comparação crua erra o dia inteiro.
 * - NUNCA selecionar `workouts.notes` aqui — a sessão inteira mora nessa coluna
 *   e trazê-la para responder um booleano serviria centenas de KB à toa.
 */
import { createClient } from '@/utils/supabase/client'
import { brtDateKey } from '@/utils/cron/dateBrt'

/** Só o dia POSITIVO é memorizado: "treinou" não se desfaz, "não treinou" sim. */
const treinouNoDia = new Map<string, string>()
/** Chamadas em voo, para as duas montagens simultâneas virarem uma query só. */
const emVoo = new Map<string, Promise<boolean>>()

/**
 * O mesmo positivo, PERSISTIDO — e é isto que mata o card fantasma.
 *
 * Sintoma relatado pelo dono (24/08/2026): mesmo com o treino do dia
 * concluído, o card "TREINO DE HOJE / TREINAR AGORA" piscava ~1 s a cada
 * abertura do app e sumia. Não era bug de render: o cache acima vive em
 * MEMÓRIA e morre quando o app fecha, então toda abertura recomeçava sem
 * saber, e o consumidor trata "não sei" como "ainda não treinou" (esconder a
 * ação primária durante a consulta deixaria a primeira dobra vazia para quem
 * de fato não treinou — ver `useTrainedToday`).
 *
 * Com a marca no storage, a resposta já existe antes de qualquer ida à rede.
 * A chave carrega o DIA: passou da meia-noite BRT, ela deixa de valer sozinha,
 * sem ninguém precisar limpar nada.
 *
 * Só o POSITIVO é gravado. "Não treinou" é um estado que muda a qualquer
 * momento — persistir isso guardaria uma resposta que envelhece em minutos.
 */
const CHAVE_STORAGE = 'it.trained_today'

function lerMarcaLocal(uid: string, hoje: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(`${CHAVE_STORAGE}:${uid}`) === hoje
  } catch {
    // Storage bloqueado (modo privado, política do WebView): segue pela rede.
    return false
  }
}

function gravarMarcaLocal(uid: string, hoje: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${CHAVE_STORAGE}:${uid}`, hoje)
  } catch {
    // Perder a marca custa um flash na próxima abertura, não um dado.
  }
}

/**
 * Apaga a marca do dia. Chamado quando a verdade do servidor diz que NÃO
 * treinou — o caso real é apagar do histórico a sessão de hoje: sem isto, a
 * marca local sustentaria "já treinou" até a virada do dia e o usuário ficaria
 * sem o botão de iniciar.
 */
function limparMarcaLocal(uid: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(`${CHAVE_STORAGE}:${uid}`)
  } catch {
    // Idem: nada a fazer, e a consulta seguinte corrige.
  }
}

async function consultar(uid: string, hoje: string): Promise<boolean> {
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('workouts')
      .select('date')
      .eq('user_id', uid)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .limit(5)
    const treinou = (Array.isArray(data) ? data : []).some(
      (w) => brtDateKey(String((w as { date?: string }).date ?? '')) === hoje,
    )
    if (treinou) {
      treinouNoDia.set(uid, hoje)
      gravarMarcaLocal(uid, hoje)
    } else {
      // A verdade do servidor venceu uma marca local otimista (sessão de hoje
      // apagada do histórico, por exemplo). Sem limpar, o app esconderia o
      // botão de iniciar até a meia-noite.
      limparMarcaLocal(uid)
    }
    return treinou
  } catch {
    // Sem dados/rede: responde "não treinou" — esconder o atalho por falha de
    // leitura seria pior que mostrá-lo a quem já treinou.
    return false
  }
}

/**
 * Reconfere com o servidor SEM ninguém esperar por isso.
 *
 * Existe por causa de um caso real e raro: a sessão de hoje ser apagada do
 * histórico. A marca local diria "já treinou" até a meia-noite e o usuário
 * ficaria sem o botão de iniciar. Aqui a resposta do servidor desfaz memória e
 * storage, e a próxima montagem já acerta.
 *
 * Nada é devolvido de propósito: quem chamou já respondeu pela marca local, e
 * trocar a tela no meio do caminho seria o mesmo flash — só que ao contrário.
 */
function hasTrainedTodayFresh(uid: string, hoje: string): void {
  const chave = `${uid}|${hoje}`
  if (emVoo.has(chave)) return
  const p = consultar(uid, hoje)
    .then((treinou) => {
      if (!treinou) treinouNoDia.delete(uid)
      return treinou
    })
    .finally(() => { emVoo.delete(chave) })
  emVoo.set(chave, p)
}

/** Houve sessão concluída hoje (BRT)? `false` também quando não dá para saber. */
export async function hasTrainedTodayBrt(userId: string): Promise<boolean> {
  const uid = String(userId || '').trim()
  if (!uid) return false
  const hoje = brtDateKey()
  if (treinouNoDia.get(uid) === hoje) return true
  // A marca persistida responde ANTES de qualquer ida à rede — é o que impede
  // o card de treino piscar a cada abertura do app para quem já treinou. A
  // consulta real ainda acontece depois (o `else` de `consultar` desfaz a
  // marca se o servidor discordar), mas a tela não espera por ela.
  if (lerMarcaLocal(uid, hoje)) {
    treinouNoDia.set(uid, hoje)
    void hasTrainedTodayFresh(uid, hoje)
    return true
  }
  const chave = `${uid}|${hoje}`
  const jaVoando = emVoo.get(chave)
  if (jaVoando) return jaVoando
  const p = consultar(uid, hoje).finally(() => { emVoo.delete(chave) })
  emVoo.set(chave, p)
  return p
}

/** Só para testes: zera a memória E a marca persistida entre casos. */
export function __resetTrainedTodayCache() {
  treinouNoDia.clear()
  emVoo.clear()
  if (typeof window === 'undefined') return
  try {
    // Sem isto um caso vaza a marca para o seguinte, e o teste do flash passa
    // verde por herança em vez de por comportamento.
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith(CHAVE_STORAGE)) window.localStorage.removeItem(k)
    }
  } catch { /* storage bloqueado: nada a limpar */ }
}
