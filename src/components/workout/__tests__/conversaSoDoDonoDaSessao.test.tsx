import React from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * A conversa de IA por exercício é do DONO da sessão.
 *
 * O mesmo `ExerciseCard` é desenhado no treino próprio e no Modo Spotter, em
 * que eu vejo o exercício do MEU PARCEIRO. Abrir a conversa de lá gravaria a
 * thread com o meu `user_id` e o `started_at` dele — e o pedido do dono é
 * explícito: a conversa não aparece para quem só acompanha.
 *
 * Três ângulos, porque nenhum sozinho fecha:
 *  1. a DECISÃO (`enderecoDaConversa`) — função pura;
 *  2. a FIAÇÃO — o botão montado dentro do provider de verdade, que é onde
 *     "algoritmo certo, ninguém chamando" costuma passar verde neste repo;
 *  3. a CLASSE — todo importador do card compartilhado declara de que lado
 *     está. Render site novo reprova aqui, não no aparelho do parceiro.
 */

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    storage: { from: () => ({ uploadToSignedUrl: async () => ({ error: null }) }) },
  }),
}))

import { WorkoutProvider } from '../WorkoutContext'
import ExerciseChatButton from '../ExerciseChatButton'
import ExerciseChatModal from '../ExerciseChatModal'
import {
  enderecoDaConversa,
  precisaPerguntarAoSair,
  chaveDoRascunho,
} from '@/lib/workout/exerciseChatThread'

const INICIO = Date.parse('2026-09-12T10:00:00.000Z')
const ROTULO_DO_BOTAO = /tirar dúvida sobre este exercício/i

const sessaoDoDono = { startedAt: INICIO, workout: { exercises: [] }, logs: {}, ui: {} }
/** O que o `PartnerExerciseOverlay` monta — sessão sintética do parceiro. */
const sessaoDoParceiro = { workout: { exercises: [] }, logs: {}, ui: {}, ehDeOutraPessoa: true }

const montarBotao = (session: unknown) =>
  render(
    <WorkoutProvider value={{ session } as never}>
      <ExerciseChatButton exerciseName="Supino reto" exerciseIndex={2} />
    </WorkoutProvider>,
  )

afterEach(cleanup)

// ── 1. A decisão ────────────────────────────────────────────────────────────

describe('enderecoDaConversa — quem tem direito à thread', () => {
  it('sessão do dono devolve o started_at em ISO', () => {
    expect(enderecoDaConversa(sessaoDoDono)).toBe('2026-09-12T10:00:00.000Z')
  })

  it('sessão declarada de outra pessoa NÃO tem endereço', () => {
    expect(enderecoDaConversa(sessaoDoParceiro)).toBeNull()
  })

  it('a marca vence mesmo com carimbo de início — é a segunda tranca', () => {
    // O dia em que a sessão sintética do Spotter ganhar um `startedAt` (para o
    // cronômetro, digamos) não pode ser o dia em que o botão vaza.
    expect(enderecoDaConversa({ ...sessaoDoParceiro, startedAt: INICIO })).toBeNull()
  })

  it('sem carimbo de início não há endereço', () => {
    expect(enderecoDaConversa({ workout: {}, logs: {} })).toBeNull()
    expect(enderecoDaConversa(null)).toBeNull()
    expect(enderecoDaConversa(undefined)).toBeNull()
  })

  it('carimbo inválido devolve null em vez de LANÇAR', () => {
    // `new Date(NaN).toISOString()` lança RangeError, e um throw aqui mataria o
    // card inteiro do exercício — não só o botão.
    for (const ruim of [Number.NaN, 0, -1, Infinity, 9e15, 'ontem', {}]) {
      expect(() => enderecoDaConversa({ startedAt: ruim })).not.toThrow()
      expect(enderecoDaConversa({ startedAt: ruim })).toBeNull()
    }
  })
})

// ── 2. A fiação ─────────────────────────────────────────────────────────────

describe('fiação — o botão dentro do provider de verdade', () => {
  it('aparece na sessão do dono', () => {
    montarBotao(sessaoDoDono)
    expect(screen.getByLabelText(ROTULO_DO_BOTAO)).toBeTruthy()
  })

  it('NÃO aparece na sessão do parceiro (Modo Spotter)', () => {
    montarBotao(sessaoDoParceiro)
    expect(screen.queryByLabelText(ROTULO_DO_BOTAO)).toBeNull()
  })

  it('NÃO aparece sem sessão nenhuma', () => {
    montarBotao(null)
    expect(screen.queryByLabelText(ROTULO_DO_BOTAO)).toBeNull()
  })
})

// ── 3. A classe: todo render site declara de que lado está ──────────────────

describe('classe — quem desenha o ExerciseCard compartilhado', () => {
  const RAIZ = 'src'
  const semComentarios = (s: string) =>
    s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  /**
   * Importadores do card COMPARTILHADO. O `TeacherControlModal` desenha um card
   * homônimo e LOCAL, então não entra aqui hoje — mas entrará no dia em que
   * alguém unificar os dois, e é por isso que a lista é varrida em vez de
   * escrita à mão.
   */
  const tsx = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory()
        ? (d.name === '__tests__' || d.name === 'node_modules' ? [] : tsx(path.join(dir, d.name)))
        : d.name.endsWith('.tsx') ? [path.join(dir, d.name)] : [],
    )

  const importadores = tsx(RAIZ).filter((f) => {
    const src = semComentarios(readFileSync(f, 'utf8'))
    return /import\s+ExerciseCard\s+from\s+'(\.\/ExerciseCard|@\/components\/workout\/ExerciseCard)'/.test(src)
  })

  /** Superfície que É do dono, com o motivo. Só encolhe. */
  const E_DO_DONO: Record<string, string> = {
    'ExerciseList.tsx': 'a lista do treino ATIVO — a sessão é a do próprio usuário',
  }

  it('autoteste: a varredura acha os importadores conhecidos', () => {
    const nomes = importadores.map((f) => path.basename(f))
    expect(nomes).toEqual(expect.arrayContaining(['ExerciseList.tsx', 'PartnerExerciseOverlay.tsx']))
  })

  it('render site que NÃO é do dono declara ehDeOutraPessoa na sessão que provê', () => {
    const indefinidos = importadores
      .filter((f) => !(path.basename(f) in E_DO_DONO))
      .filter((f) => !semComentarios(readFileSync(f, 'utf8')).includes('ehDeOutraPessoa'))
      .map((f) => path.basename(f))

    expect(
      indefinidos,
      'Este arquivo desenha o card do exercício com uma sessão que não é a do ' +
      'usuário logado. Marque a sessão com `ehDeOutraPessoa: true` (o botão de ' +
      'conversa se apaga sozinho) ou declare em E_DO_DONO por que ela é própria.',
    ).toEqual([])
  })
})

// ── 3b. A classe pelo OUTRO ângulo: quem MONTA o treino ativo ───────────────
//
// O guard acima varre quem IMPORTA o ExerciseCard, e isso não fecha: o card é
// alcançado de forma TRANSITIVA por <ActiveWorkout> → <ExerciseList> →
// ExerciseCard. O `TeacherStudentWorkout` (Painel → aluno → Ao Vivo →
// "Controlar Treino do Aluno") monta o treino ativo com o estado sincronizado
// do ALUNO, não importa ExerciseCard nenhum — e por isso o botão de conversa
// apareceu para o professor com a varredura de importadores VERDE. É a
// pergunta que este repo manda fazer de todo guard: onde ele NÃO olha?

describe('classe — quem MONTA o <ActiveWorkout>', () => {
  const RAIZ = 'src'
  const semComentarios = (s: string) =>
    s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  const tsx = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory()
        ? (d.name === '__tests__' || d.name === 'node_modules' ? [] : tsx(path.join(dir, d.name)))
        : d.name.endsWith('.tsx') ? [path.join(dir, d.name)] : [],
    )

  const montadores = tsx(RAIZ)
    .filter((f) => path.basename(f) !== 'ActiveWorkout.tsx')
    .filter((f) => /<ActiveWorkout[\s/>]/.test(semComentarios(readFileSync(f, 'utf8'))))

  /** Monta a sessão do PRÓPRIO usuário logado, com o motivo. Só encolhe. */
  const MONTA_A_PROPRIA_SESSAO: Record<string, string> = {
    'IronTracksAppClientImpl.tsx': 'o shell do dashboard — a sessão é a do usuário logado',
  }

  it('autoteste: a varredura acha os dois montadores conhecidos', () => {
    const nomes = montadores.map((f) => path.basename(f))
    expect(nomes).toEqual(
      expect.arrayContaining(['IronTracksAppClientImpl.tsx', 'TeacherStudentWorkout.tsx']),
    )
  })

  it('quem monta o treino de OUTRA pessoa marca a sessão que entrega', () => {
    const indefinidos = montadores
      .filter((f) => !(path.basename(f) in MONTA_A_PROPRIA_SESSAO))
      .filter((f) => !semComentarios(readFileSync(f, 'utf8')).includes('ehDeOutraPessoa'))
      .map((f) => path.basename(f))

    expect(
      indefinidos,
      'Este arquivo monta o <ActiveWorkout> — e com ele o ExerciseCard inteiro — ' +
      'sobre uma sessão que pode não ser a do usuário logado. Marque a sessão ' +
      'entregue com `ehDeOutraPessoa: true` (a conversa de IA se apaga sozinha) ' +
      'ou declare em MONTA_A_PROPRIA_SESSAO por que ela é própria.',
    ).toEqual([])
  })

  // A presença da marca no arquivo não prova NADA sozinha: declarar o objeto
  // marcado e continuar entregando `session.state` cru ao componente passaria
  // verde com o vazamento vivo — é o jeito nº 3 da lista de guards falsos deste
  // repo (as pontas certas, ninguém ligando). Por isso aqui se anda pela
  // FIAÇÃO: o que o `<ActiveWorkout>` recebe, e de onde aquilo vem.
  it('o professor entrega ao <ActiveWorkout> o objeto MARCADO, não o estado cru', () => {
    const src = semComentarios(
      readFileSync('src/components/teacher/TeacherStudentWorkout.tsx', 'utf8'),
    )
    const bloco = src.slice(src.indexOf('<ActiveWorkout'))
    const passado = String(/session=\{([^}]+)\}/.exec(bloco)?.[1] ?? '').trim()

    expect(passado, 'o <ActiveWorkout> do professor precisa receber uma sessão').not.toBe('')
    expect(
      passado,
      'entregar `session.state` cru devolve ao professor tudo que é do DONO da sessão',
    ).not.toMatch(/session\.state/)
    expect(
      src,
      `"${passado}" precisa ser um objeto declarado com ehDeOutraPessoa: true`,
    ).toMatch(new RegExp(`const\\s+${passado}\\s*=[\\s\\S]{0,800}?ehDeOutraPessoa:\\s*true`))
  })

  it('a marca NÃO volta para a linha do aluno', () => {
    // Se ela entrasse em `prev.state`, o PATCH a gravaria na linha do aluno e
    // seria o ALUNO a perder o botão no próprio treino — o defeito ao contrário.
    const src = semComentarios(
      readFileSync('src/components/teacher/TeacherStudentWorkout.tsx', 'utf8'),
    )
    expect(src).not.toMatch(/patchStudentSession\([^)]*ehDeOutraPessoa/)
  })
})

// ── 4. O botão não pode ser gêmeo do vizinho ────────────────────────────────

describe('o botão de conversa × o botão de troca, lado a lado na barra', () => {
  const DIR = 'src/components/workout'
  /** Só o executável: o comentário que EXPLICA por que não repetir o ícone da
   *  troca cita o nome dele, e casar com ele é o guard reprovando a própria
   *  documentação (jeito nº 2 da lista de guards falsos deste repo). */
  const executavel = (s: string) =>
    s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const chat = executavel(readFileSync(path.join(DIR, 'ExerciseChatButton.tsx'), 'utf8'))
  const swap = executavel(readFileSync(path.join(DIR, 'AIExerciseSwap.tsx'), 'utf8'))
  const rotulos = (src: string) => Array.from(src.matchAll(/aria-label="([^"]+)"/g)).map((m) => m[1])

  it('os dois têm nome acessível, e os nomes são DIFERENTES', () => {
    const doChat = rotulos(chat)
    const doSwap = rotulos(swap)
    expect(doChat.length, 'o gatilho da conversa precisa de aria-label').toBeGreaterThan(0)
    expect(doSwap.length).toBeGreaterThan(0)
    expect(doChat.filter((r) => doSwap.includes(r)), 'dois botões vizinhos com o mesmo nome').toEqual([])
  })

  it('os ícones são de famílias diferentes — o âmbar RefreshCw não se repete', () => {
    expect(chat).toContain('MessageCircleQuestion')
    expect(chat, 'repetir o ícone da troca torna os dois indistinguíveis').not.toContain('RefreshCw')
  })
})

// ── 5. Sair: a pergunta sobre o relatório, e a pergunta digitada ────────────

describe('a decisão sobre o relatório se repete quando há conversa nova', () => {
  it('nada novo desde a última decisão: não pergunta', () => {
    expect(precisaPerguntarAoSair(4, 4)).toBe(false)
  })

  it('mensagem nova depois da decisão: pergunta de novo', () => {
    // Com um booleano "já perguntei", quem dissesse "não" uma vez nunca mais
    // seria consultado — e a próxima dúvida ficaria fora do relatório sem
    // ninguém escolher isso.
    expect(precisaPerguntarAoSair(6, 4)).toBe(true)
  })

  it('thread ainda vazia: não há o que perguntar', () => {
    expect(precisaPerguntarAoSair(0, 0)).toBe(false)
  })
})

describe('falha de rede NÃO come a pergunta digitada', () => {
  const ENDERECO = '2026-09-12T10:00:00.000Z'
  let chamadas: string[] = []

  beforeEach(() => {
    chamadas = []
    try { window.localStorage.clear() } catch { /* modo privado */ }
    vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: { method?: string }) => {
      const u = String(url)
      chamadas.push(`${init?.method ?? 'GET'} ${u.split('?')[0]}`)
      if (!init?.method || init.method === 'GET') {
        return { ok: true, json: async () => ({ ok: true, messages: [], nomeAnterior: null }) }
      }
      // O POST da pergunta falha — o caso que importa.
      return { ok: false, json: async () => ({ ok: false, error: 'ai_unavailable' }) }
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
  })

  it('a pergunta volta ao campo e o rascunho continua salvo', async () => {
    render(
      <ExerciseChatModal
        endereco={ENDERECO}
        exIdx={2}
        exerciseName="Supino reto"
        onFechar={() => {}}
      />,
    )

    const campo = await screen.findByLabelText(/sua dúvida sobre o exercício/i)
    fireEvent.change(campo, { target: { value: 'A pegada aberta dói no ombro, é normal?' } })
    expect(window.localStorage.getItem(chaveDoRascunho(ENDERECO, 2))).toContain('pegada aberta')

    fireEvent.click(screen.getByLabelText(/enviar a pergunta/i))

    await waitFor(() => {
      expect(chamadas.some((c) => c.startsWith('POST'))).toBe(true)
    })
    await waitFor(() => {
      // Ela existe em UM lugar só: se o campo esvaziar e o balão sumir, a
      // pergunta morreu com o erro de rede.
      expect((campo as HTMLTextAreaElement).value).toBe('A pegada aberta dói no ombro, é normal?')
    })
    expect(window.localStorage.getItem(chaveDoRascunho(ENDERECO, 2))).toContain('pegada aberta')
    expect(screen.getByText(/a ia não respondeu agora/i)).toBeTruthy()
  })
})

describe('as saídas do modal passam TODAS pela decisão', () => {
  const src = readFileSync('src/components/workout/ExerciseChatModal.tsx', 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('o toque fora, o Escape e o botão Sair chamam pedirParaSair, não onFechar', () => {
    expect(src).toContain('backdropProps(pedirParaSair')
    expect(src).toContain('useFocusTrap(true, pedirParaSair)')
    expect(src).toMatch(/onClick=\{pedirParaSair\}/)
    // `onFechar` direto em qualquer uma dessas três saídas pularia a pergunta
    // do relatório — que é o único momento em que ela pode ser feita.
    expect(src).not.toContain('backdropProps(onFechar')
    expect(src).not.toContain('useFocusTrap(true, onFechar)')
  })
})
